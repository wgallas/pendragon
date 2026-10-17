/**
 * Moteur de bataille : toutes les écritures dans le document « Bataille » passent par ici et sont
 * faites par le MJ. Un joueur envoie sa demande au MJ par le socket du système (request) ;
 * ses propres jets (Bataille, Écuyer, passion) sont lancés chez lui et seul le résultat est transmis.
 */
import { PDVF, SYSTEM_ID } from "../config.mjs";
import * as R from "../rules/battle.mjs";
import { rollPlain } from "../dice/tests.mjs";
import { samePassion } from "../rules/resolution.mjs";

const L = (k) => game.i18n.localize(k);
const F = (k, d) => game.i18n.format(k, d);
const C = () => PDVF.battle;

export const SOCKET = `system.${SYSTEM_ID}`;
const CARD = `systems/${SYSTEM_ID}/templates/chat/battle-card.hbs`;

/* -------------------------------------------- */
/*  Demandes et socket                          */
/* -------------------------------------------- */

/** Demande une action : faite tout de suite par le MJ, envoyée au MJ actif par un joueur. */
export async function request(battle, action, payload = {}) {
  if (game.user.isGM) return perform(battle, action, payload, game.user.id);
  if (!game.users.activeGM) return ui.notifications.warn(L("PDVF.Battle.Notify.NoGM"));
  game.socket.emit(SOCKET, { type: "battle", action, battle: battle.uuid, payload, user: game.user.id });
}

/** Réception des messages du socket du système. */
export function onSocket(data) {
  if (data?.type === "battleOpen") {
    if (!game.user.isGM) fromUuid(data.battle).then(b => b?.sheet?.render(true));
    return;
  }
  if (data?.type !== "battle" || !game.users.activeGM?.isSelf) return;
  fromUuid(data.battle).then(b => { if (b) perform(b, data.action, data.payload, data.user); });
}

/** Ouvre la bataille chez tous les joueurs. */
export function showToPlayers(battle) {
  game.socket.emit(SOCKET, { type: "battleOpen", battle: battle.uuid });
}

let queue = Promise.resolve();

/** Exécute une action côté MJ, l'une après l'autre (les demandes simultanées ne s'écrasent pas). */
export function perform(battle, action, payload, userId) {
  queue = queue.then(() => run(battle, action, payload ?? {}, userId)).catch(err => {
    console.error(`${SYSTEM_ID} | Bataille : ${action}`, err);
    ui.notifications.error(`${L("PDVF.Battle.Title")} : ${err.message}`);
  });
  return queue;
}

async function run(battle, action, payload, userId) {
  const def = ACTIONS[action];
  if (!def) return;
  const user = userId ? game.users.get(userId) : game.user;
  if (!user) return;
  if (!allowed(battle, def.who, payload, user)) {
    console.warn(`${SYSTEM_ID} | Bataille : action « ${action} » refusée pour ${user.name}`);
    return;
  }
  const sys = foundry.utils.deepClone(battle._source.system);
  const ctx = {
    battle, sys, user, chat: [],
    log: (text) => sys.log.push({ round: sys.state.round, text })
  };
  const keep = await def.fn(ctx, payload);
  if (keep !== false) await battle.update({ system: sys });
  for (const card of ctx.chat) await announce(battle, card);
}

/** Qui peut faire quoi : le MJ, le propriétaire d'un chevalier, le commandant du conroi. */
function allowed(battle, who, payload, user) {
  if (user.isGM) return true;
  const s = battle.system;
  if (who === "knight") {
    const k = s.knights[Number(payload.index)];
    return !!k && !!fromUuidSync(k.uuid)?.testUserPermission?.(user, "OWNER");
  }
  if (who === "commander") return !!s.conroi.commander && !!fromUuidSync(s.conroi.commander)?.testUserPermission?.(user, "OWNER");
  return false;
}

/** Carte de chat de la bataille (annonce, boutons pour les joueurs). */
export async function announce(battle, { title, subtitle = "", text = "", lines = [], buttons = [], whisper = null }) {
  const content = await foundry.applications.handlebars.renderTemplate(CARD, { title, subtitle, text, lines, buttons, battle: battle.uuid });
  const data = { speaker: { alias: battle.name }, content, flags: { [SYSTEM_ID]: { kind: "battle", battle: battle.uuid } } };
  if (whisper) data.whisper = whisper;
  return ChatMessage.implementation.create(data);
}

/* -------------------------------------------- */
/*  Outils                                       */
/* -------------------------------------------- */

async function rollFormula(formula, flavor, battle) {
  const roll = new Roll(String(formula).replace(/D/g, "d"));
  await roll.evaluate();
  if (flavor) await roll.toMessage({ speaker: { alias: battle.name }, flavor });
  return roll.total;
}

export function knightActor(k) {
  try { return k?.uuid ? fromUuidSync(k.uuid) : null; } catch (err) { return null; }
}

export function findEncounter(sys, id) {
  return sys.encounters.find(e => e.id === id) ?? null;
}

/** Passion de Moral d'un chevalier : celle choisie, sinon la plus haute de la cour. */
export function moralePassion(actor, court, index) {
  const passions = actor?.system?.passions ?? [];
  if (index !== null && index !== undefined && passions[index]) return { index, ...passions[index] };
  let best = null;
  passions.forEach((p, i) => { if (p.court === court && (!best || p.value > best.value)) best = { index: i, ...p }; });
  return best;
}

/** Chevaliers sur le champ de bataille ce tour-ci. */
export function onField(sys) {
  return sys.knights.map((k, index) => ({ ...k, index })).filter(k => k.status === "field");
}

/** Rencontres que le commandant peut retenir : rencontre par défaut et propositions des PJ. */
export function candidates(sys) {
  const ids = new Set();
  const st = sys.state;
  if (st.charge === "enemyCharges") {
    for (const e of sys.encounters) if (e.kind === "opponent" && e.mounted) ids.add(e.id);
    return [...ids];
  }
  if (st.defaultId) ids.add(st.defaultId);
  for (const k of sys.knights) if (k.proposal) ids.add(k.proposal);
  if (st.intensityOutcome === "fumble") for (const e of sys.encounters) if (e.kind === "opportunity" && !e.used) ids.add(e.id);
  // Une opportunité proposée doit être résolue.
  const opps = [...ids].filter(id => findEncounter(sys, id)?.kind === "opportunity");
  if (opps.length && st.intensityOutcome !== "fumble") return opps;
  return [...ids];
}

function resetRound(sys) {
  for (const k of sys.knights) Object.assign(k, { posture: "", pendingMorale: "", battleRoll: "", proposal: "", squire: "" });
  Object.assign(sys.state, {
    defaultId: "", selectedId: "", charge: "", chargeOutcome: "", intensityOutcome: "", doubled: false,
    moraleLoss: null, rangedRounds: null, counterCharge: "", immune: false, imposed: false
  });
}

/** Bilan chiffré (aussi affiché par la fiche). */
export function summary(sys) {
  const cfg = C();
  const all = sys.knights.flatMap(k => k.kills);
  const enemyKV = all.reduce((s, k) => s + (Number(k.kv) || 0), 0);
  const pcLost = sys.knights.filter(k => ["dead", "captured"].includes(k.status)).length;
  const ownKV = (sys.result.npcLost + pcLost) * cfg.knightValue + (Number(sys.result.otherLosses) || 0);
  const mult = R.oddsResultMultiplier(sys.odds, sys.favors, cfg);
  const computed = R.battleResult(enemyKV, ownKV, mult, cfg);
  const resultId = sys.result.override || computed.id;
  const knights = sys.knights.map((k, index) => {
    const role = k.role !== "none" ? k.role : (k.uuid === sys.conroi.commander ? "conroi" : "none");
    const participation = k.participated ? R.participationGlory({ size: sys.size, tournament: sys.tournament, resultId, role }, cfg) : 0;
    const killsGlory = k.kills.reduce((s, x) => s + (Number(x.glory) || 0), 0);
    const loot = k.participated ? R.lootFor({ army: sys.army, resultId, odds: sys.odds, favors: sys.favors, role, size: sys.size, decisiveBonus: sys.result.decisiveBonus }, cfg) : 0;
    return { index, uuid: k.uuid, role, participation, killsGlory, total: participation + killsGlory, loot,
      captives: k.kills.filter(x => x.captured), kills: k.kills.length };
  });
  return { enemyKV, ownKV, pcLost, mult, ratio: computed.ratio, computedId: computed.id, resultId, knights };
}

/* -------------------------------------------- */
/*  Actions                                      */
/* -------------------------------------------- */

const ACTIONS = {
  // ----- Préparation -----
  addKnight: { who: "gm", fn: async ({ sys }, { uuid }) => {
    const actor = fromUuidSync(uuid);
    if (actor?.type !== "chevalier" || sys.knights.some(k => k.uuid === uuid)) return false;
    sys.knights.push({ uuid, role: "none", status: "field", passion: moralePassion(actor, sys.conroi.court, null)?.index ?? null,
      posture: "", pendingMorale: "", battleRoll: "", proposal: "", invoked: "", invokedTarget: "", invokedRound: 0,
      squire: "", squireLost: false, participated: false, kills: [] });
    if (!sys.conroi.commander && !sys.conroi.commanderName) sys.conroi.commander = uuid;
  } },
  removeKnight: { who: "gm", fn: async ({ sys }, { index }) => {
    const [k] = sys.knights.splice(Number(index), 1);
    if (k && sys.conroi.commander === k.uuid) sys.conroi.commander = "";
  } },
  addEncounter: { who: "gm", fn: async ({ sys }, { data, source = "" }) => {
    if (!data?.system) return false;
    if (source && sys.encounters.some(e => e.source === source)) return false;
    sys.encounters.push({ ...foundry.utils.deepClone(data.system), id: foundry.utils.randomID(), name: data.name, source, used: false });
  } },
  removeEncounter: { who: "gm", fn: async ({ sys }, { id }) => {
    sys.encounters = sys.encounters.filter(e => e.id !== id);
    if (sys.state.defaultId === id) sys.state.defaultId = "";
  } },
  addPreset: { who: "gm", fn: async ({ sys }, { army, id }) => {
    army = army || id || sys.army;
    const pack = game.packs.get(`world.${ENCOUNTER_PACK}`);
    if (!pack) { ui.notifications.warn(L("PDVF.Battle.Notify.NoPack")); return false; }
    const docs = await pack.getDocuments();
    let n = 0;
    for (const d of docs) {
      if (!d.system.armies?.includes(army) || sys.encounters.some(e => e.source === d.uuid)) continue;
      sys.encounters.push({ ...d.toObject().system, id: foundry.utils.randomID(), name: d.name, source: d.uuid, used: false });
      n++;
    }
    if (!n) return false;
  } },
  computeMorale: { who: "gm", fn: async (ctx) => computeMorale(ctx) },
  armyTests: { who: "gm", fn: async (ctx) => armyTests(ctx) },

  start: { who: "gm", fn: async (ctx) => {
    const { sys, battle } = ctx;
    if (!sys.knights.length) { ui.notifications.warn(L("PDVF.Battle.Notify.NoKnights")); return false; }
    const cfg = C();
    if (sys.intensity === null) sys.intensity = await rollFormula(cfg.sizes[sys.size].intensity, L("PDVF.Battle.RollIntensity"), battle);
    if (!sys.conroi.moraleStart) computeMorale(ctx);
    if (cfg.sizes[sys.size]?.armyTests && !sys.allied.outcome) await armyTests(ctx);
    if (!cfg.sizes[sys.size]?.armyTests) Object.assign(sys.state, R.armyTestEffects(null, null));
    resetRound(sys);
    Object.assign(sys.state, { phase: "active", round: 1, step: "define", position: "field", engagedLast: false });
    for (const k of sys.knights) Object.assign(k, { participated: false, kills: [], invoked: "", invokedTarget: "", invokedRound: 0, squireLost: false });
    const intensity = R.effectiveIntensity(sys.intensity, sys.tournament, cfg);
    const rounds = R.maxRounds(sys.size, sys.rounds, cfg);
    ctx.log(F("PDVF.Battle.Log.Start", { intensity, rounds, morale: sys.conroi.morale }));
    ctx.chat.push({
      title: battle.name, subtitle: L("PDVF.Battle.Begins"),
      lines: [
        F("PDVF.Battle.Card.Intensity", { intensity }), F("PDVF.Battle.Card.Rounds", { rounds }),
        F("PDVF.Battle.Card.Morale", { morale: sys.conroi.morale }),
        F("PDVF.Battle.Card.Deck", { names: sys.encounters.filter(e => e.kind === "opponent").map(e => e.name).join(", ") || "—" })
      ],
      buttons: [{ action: "open", label: L("PDVF.Battle.OpenSheet") }]
    });
    showToPlayers(battle);
  } },

  // ----- Tour de bataille -----
  setDefault: { who: "gm", fn: async ({ sys }, { id }) => { sys.state.defaultId = id ?? ""; } },
  confirmDefault: { who: "gm", fn: async (ctx, { id }) => {
    const { sys, battle } = ctx;
    const st = sys.state;
    if (st.step !== "define") return false;
    if (id) st.defaultId = id;
    const enc = findEncounter(sys, st.defaultId);
    if (!enc) { ui.notifications.warn(L("PDVF.Battle.Notify.ChooseDefault")); return false; }
    const events = sys.events.filter(e => e.round === st.round && e.text).map(e => e.text);
    if (st.round === 1 && st.firstCharge) { st.charge = "first"; st.step = "intensity"; }
    else st.step = "charge";
    ctx.log(F("PDVF.Battle.Log.Default", { name: enc.name }));
    ctx.chat.push({
      title: F("PDVF.Battle.RoundN", { round: st.round }), subtitle: battle.name,
      text: F("PDVF.Battle.Card.Default", { name: enc.name }),
      lines: [...events.map(t => F("PDVF.Battle.Card.Event", { text: t })),
        st.charge === "first" ? L("PDVF.Battle.Card.FirstCharge") : L("PDVF.Battle.Card.ChargeTest")],
      buttons: st.step === "charge" ? [{ action: "chargeTest", label: L("PDVF.Battle.ChargeTest") }] : []
    });
  } },
  stayRear: { who: "commander", fn: async (ctx) => {
    const { sys, battle } = ctx;
    const gain = await rollFormula(C().rearMorale, L("PDVF.Battle.RearMorale"), battle);
    sys.conroi.morale = R.clampMorale(sys.conroi.morale + gain, sys.conroi.moraleStart);
    sys.state.engagedLast = false;
    ctx.log(F("PDVF.Battle.Log.StayRear", { gain, morale: sys.conroi.morale }));
    advance(ctx);
  } },
  returnField: { who: "commander", fn: async (ctx) => {
    ctx.sys.state.position = "field";
    for (const k of ctx.sys.knights) if (k.status === "rear") k.status = "field";
    ctx.log(L("PDVF.Battle.Log.Return"));
  } },
  chargeTest: { who: "commander", fn: async (ctx, { outcome }) => {
    const { sys } = ctx;
    const st = sys.state;
    if (st.step !== "charge") return false;
    let opp = R.chargeOpportunity(outcome, st.engagedLast);
    const mounted = sys.encounters.some(e => e.kind === "opponent" && e.mounted);
    if (opp === "enemyCharges" && !mounted) opp = "noCharge";
    Object.assign(st, { charge: opp, chargeOutcome: outcome });
    if (opp === "enemyCharges") {
      const def = findEncounter(sys, st.defaultId);
      st.selectedId = def?.mounted ? def.id : "";
      st.step = "select";
    } else st.step = "intensity";
    ctx.log(L(`PDVF.Battle.Charge.${opp}`));
    ctx.chat.push({ title: L("PDVF.Battle.ChargeTest"), text: L(`PDVF.Battle.Charge.${opp}`) });
  } },
  intensityTest: { who: "gm", fn: async (ctx) => {
    const { sys, battle } = ctx;
    const st = sys.state;
    if (st.step !== "intensity") return false;
    const value = R.effectiveIntensity(sys.intensity, sys.tournament, C());
    const { outcome } = await rollPlain({
      name: battle.name, label: L("PDVF.Battle.Intensity"), value, title: L("PDVF.Battle.IntensityTest"), alias: battle.name,
      verdict: (o) => ({ text: L(`PDVF.Battle.IntensityResult.${o}`), cls: R.isSuccess(o) ? "victory" : "tie" })
    });
    st.intensityOutcome = outcome;
    if (R.isSuccess(outcome)) {
      st.selectedId = st.defaultId;
      st.doubled = outcome === "critical";
      st.step = "select";
    } else if (outcome === "fumble") {
      st.selectedId = st.defaultId;
      st.step = "select";
    } else {
      st.step = "battle";
      ctx.chat.push({
        title: L("PDVF.Battle.BattleTests"), text: L("PDVF.Battle.Card.BattleTests"),
        buttons: [{ action: "battleTest", label: L("PDVF.Battle.BattleTest") }]
      });
    }
    ctx.log(L(`PDVF.Battle.IntensityResult.${outcome}`));
  } },
  battleTest: { who: "knight", fn: async (ctx, { index, outcome, proposal = "" }) => {
    const { sys } = ctx;
    const k = sys.knights[Number(index)];
    if (!k || sys.state.step !== "battle" || k.battleRoll) return false;
    const enc = findEncounter(sys, proposal);
    const ok = enc && R.isSuccess(outcome) && (enc.kind === "opponent" || (outcome === "critical" && !enc.used));
    k.battleRoll = outcome;
    k.proposal = ok ? enc.id : "";
    const name = knightActor(k)?.name ?? "?";
    ctx.log(ok ? F("PDVF.Battle.Log.Proposal", { name, encounter: enc.name }) : F("PDVF.Battle.Log.NoProposal", { name }));
  } },
  closeTests: { who: "gm", fn: async ({ sys }) => {
    if (sys.state.step !== "battle") return false;
    const list = candidates(sys);
    sys.state.selectedId = list.length === 1 ? list[0] : (list.includes(sys.state.defaultId) ? sys.state.defaultId : list[0] ?? "");
    sys.state.step = "select";
  } },
  select: { who: "commander", fn: async ({ sys }, { id }) => {
    if (sys.state.step !== "select") return false;
    if (!sys.state.imposed && !candidates(sys).includes(id)) return false;
    sys.state.selectedId = id;
  } },
  impose: { who: "gm", fn: async (ctx, { id }) => {
    const st = ctx.sys.state;
    const enc = findEncounter(ctx.sys, id);
    if (!st.enemyImposes || st.enemyImposeUsed || !enc || st.step !== "select") return false;
    Object.assign(st, { selectedId: id, imposed: true, enemyImposeUsed: true });
    ctx.log(F("PDVF.Battle.Log.Imposed", { name: enc.name }));
  } },
  toggleImmunity: { who: "commander", fn: async ({ sys }) => {
    if (!sys.state.moraleImmunity || sys.state.moraleImmunityUsed) return false;
    sys.state.immune = !sys.state.immune;
  } },
  engage: { who: "commander", fn: async (ctx) => {
    const { sys, battle } = ctx;
    const st = sys.state;
    const enc = findEncounter(sys, st.selectedId);
    if (st.step !== "select" || !enc) return false;
    const min = enc.moraleMin - st.moraleMinMod;
    if (sys.conroi.morale < min) {
      ctx.log(F("PDVF.Battle.Log.TooLow", { name: enc.name, min, morale: sys.conroi.morale }));
      return retreatNow(ctx, F("PDVF.Battle.Card.TooLow", { name: enc.name, min }));
    }
    let loss = 0;
    if (st.immune) st.moraleImmunityUsed = true;
    else if (enc.moraleLoss && enc.moraleLoss !== "0") {
      loss = Math.max(0, await rollFormula(enc.moraleLoss, F("PDVF.Battle.MoraleLossOf", { name: enc.name }), battle) - st.moraleLossMod);
    }
    st.moraleLoss = loss;
    sys.conroi.morale = R.clampMorale(sys.conroi.morale - loss, sys.conroi.moraleStart);
    const count = R.enemyCount(enc, onField(sys).length, st.doubled);
    ctx.log(F("PDVF.Battle.Log.Engage", { name: enc.name, loss, morale: sys.conroi.morale }));
    if (sys.conroi.morale <= 0) return retreatNow(ctx, L("PDVF.Battle.Card.NoMorale"));
    st.step = "posture";
    st.counterCharge = enc.counterCharge && st.round === 1 ? "yes" : "";
    const choices = R.postureChoices({ firstCharge: st.charge === "first", forbidPrudent: enc.forbidPrudent });
    ctx.chat.push({
      title: enc.name, subtitle: F("PDVF.Battle.RoundN", { round: st.round }),
      lines: [
        F("PDVF.Battle.Card.Enemies", { count }),
        loss ? F("PDVF.Battle.Card.MoraleLoss", { loss, morale: sys.conroi.morale }) : F("PDVF.Battle.Card.Morale", { morale: sys.conroi.morale }),
        st.charge === "first" || st.charge === "charge" || st.charge === "chargeBonus" ? L(`PDVF.Battle.Charge.${st.charge === "first" ? "first" : st.charge}`) : "",
        L("PDVF.Battle.Card.ChoosePosture")
      ].filter(Boolean),
      buttons: choices.map(p => ({ action: "posture", value: p, label: L(`PDVF.Battle.Posture.${p}`) }))
    });
  } },
  posture: { who: "knight", fn: async (ctx, { index, posture }) => {
    const { sys, battle } = ctx;
    const st = sys.state;
    const k = sys.knights[Number(index)];
    const enc = findEncounter(sys, st.selectedId);
    if (!k || st.step !== "posture" || k.status !== "field" || k.posture === "cowardly") return false;
    if (!R.postureChoices({ firstCharge: st.charge === "first", forbidPrudent: enc?.forbidPrudent }).includes(posture)) return false;
    const cfg = C().postures[posture];
    const actor = knightActor(k);
    k.posture = posture;
    k.pendingMorale = cfg.morale;
    if (cfg.trait) await actor?.markExperience(cfg.trait);
    const name = actor?.name ?? "?";
    if (posture === "cowardly") {
      k.status = "rear";
      await actor?.adjustPassion("honor", -C().cowardHonorLoss);
      const hp = actor?.system?.health?.hp;
      let loss = 0;
      if (hp && hp.value > hp.max / 2) {
        loss = await rollFormula(C().cowardMorale, F("PDVF.Battle.CowardMorale", { name }), battle);
        sys.conroi.morale = R.clampMorale(sys.conroi.morale - loss, sys.conroi.moraleStart);
      }
      ctx.log(F("PDVF.Battle.Log.Coward", { name, loss }));
      ctx.chat.push({ title: name, text: F("PDVF.Battle.Card.Coward", { name, loss }) });
    } else ctx.log(F("PDVF.Battle.Log.Posture", { name, posture: L(`PDVF.Battle.Posture.${posture}`) }));
  } },
  invoked: { who: "knight", fn: async ({ sys }, { index, source, target }) => {
    const k = sys.knights[Number(index)];
    if (!k || k.invoked) return false;
    Object.assign(k, { invoked: source, invokedTarget: target ?? "", invokedRound: sys.state.round });
  } },
  fight: { who: "gm", fn: async (ctx) => {
    const { sys } = ctx;
    if (sys.state.step !== "posture") return false;
    for (const k of sys.knights) {
      if (k.status !== "field") continue;
      if (!k.posture) {
        k.posture = "valorous";
        await knightActor(k)?.markExperience(C().postures.valorous.trait);
      }
      if (k.posture !== "cowardly") k.participated = true;
    }
    sys.state.step = "resolve";
  } },
  counterChargeRoll: { who: "gm", fn: async ({ sys, battle }) => {
    const die = await rollFormula("1D6", L("PDVF.Battle.CounterChargeRoll"), battle);
    sys.state.counterCharge = R.counterCharges(sys.state.round, die, C()) ? "yes" : "no";
  } },
  rangedTest: { who: "commander", fn: async ({ sys }, { outcome }) => {
    if (sys.state.step !== "resolve") return false;
    sys.state.rangedRounds = R.rangedRounds(outcome);
  } },
  addKill: { who: "gm", fn: async ({ sys }, { index, captured = false }) => {
    const k = sys.knights[Number(index)];
    const enc = findEncounter(sys, sys.state.selectedId);
    if (!k || !enc || sys.state.step !== "resolve") return false;
    k.kills.push({ name: enc.name, kv: enc.kv, glory: R.opponentGlory(enc.glory, sys.tournament, C()), captured: !!captured,
      round: sys.state.round, ransom: captured ? enc.ransom : "" });
  } },
  removeKill: { who: "gm", fn: async ({ sys }, { index }) => {
    const k = sys.knights[Number(index)];
    if (!k) return false;
    const i = k.kills.findLastIndex(x => x.round === sys.state.round);
    if (i < 0) return false;
    k.kills.splice(i, 1);
  } },
  endEncounter: { who: "gm", fn: async (ctx) => {
    const { sys, battle } = ctx;
    const st = sys.state;
    const enc = findEncounter(sys, st.selectedId);
    if (st.step !== "resolve") return false;
    const kills = sys.knights.flatMap(k => k.kills.filter(x => x.round === st.round));
    const gain = R.moraleFromKills(kills);
    let delta = 0;
    for (const k of sys.knights) {
      if (!k.pendingMorale) continue;
      const v = await rollFormula(k.pendingMorale, F("PDVF.Battle.PostureMorale", {
        name: knightActor(k)?.name ?? "?", posture: L(`PDVF.Battle.Posture.${k.posture}`) }), battle);
      delta += v;
      k.pendingMorale = "";
    }
    sys.conroi.morale = R.clampMorale(sys.conroi.morale + gain + delta, sys.conroi.moraleStart);
    if (enc?.kind === "opportunity") enc.used = true;
    st.engagedLast = true;
    st.step = "squire";
    ctx.log(F("PDVF.Battle.Log.End", { name: enc?.name ?? "", kills: kills.length, gain, delta, morale: sys.conroi.morale }));
    ctx.chat.push({
      title: F("PDVF.Battle.EndOf", { name: enc?.name ?? "" }),
      lines: [F("PDVF.Battle.Card.Defeated", { count: kills.length, gain }), F("PDVF.Battle.Card.Morale", { morale: sys.conroi.morale }), L("PDVF.Battle.Card.SquireOptional")],
      buttons: [{ action: "squireTest", label: L("PDVF.Battle.SquireTest") }]
    });
  } },
  retreat: { who: "commander", fn: async (ctx) => {
    if (ctx.sys.state.phase !== "active" || ctx.sys.state.position !== "field") return false;
    return retreatNow(ctx, L("PDVF.Battle.Card.Retreat"));
  } },
  squireTest: { who: "knight", fn: async ({ sys }, { index, outcome }) => {
    const k = sys.knights[Number(index)];
    if (!k || k.squire) return false;
    k.squire = outcome;
    if (outcome === "fumble") k.squireLost = true;
  } },
  nextRound: { who: "gm", fn: async (ctx) => advance(ctx) },
  firstAid: { who: "gm", fn: async ({ sys }) => {
    for (const k of sys.knights) {
      const actor = knightActor(k);
      const hp = actor?.system?.health?.hp;
      if (!hp || hp.value >= hp.max) continue;
      const value = await new Roll(C().rearFirstAid.replace(/D/g, "d")).evaluate().then(r => r.total);
      await rollPlain({ actor, name: L("PDVF.Battle.Healer"), label: L("PDVF.Skill.firstAid"), value, title: F("PDVF.Battle.FirstAidFor", { name: actor.name }) });
    }
    return false;
  } },
  leaveField: { who: "commander", fn: async (ctx) => {
    ctx.sys.state.position = "left";
    ctx.sys.state.step = "over";
    ctx.log(L("PDVF.Battle.Log.Left"));
  } },
  conclude: { who: "gm", fn: async (ctx) => {
    Object.assign(ctx.sys.state, { phase: "done", step: "aftermath" });
    ctx.log(L("PDVF.Battle.Log.Conclude"));
  } },
  reopen: { who: "gm", fn: async ({ sys }) => {
    if (sys.result.applied) return false;
    Object.assign(sys.state, { phase: "active", step: sys.state.round > R.maxRounds(sys.size, sys.rounds, C()) ? "over" : "define" });
  } },
  lossesTest: { who: "commander", fn: async ({ sys }, { outcome }) => {
    const l = R.conroiLosses(outcome, sys.conroi.npcKnights, C());
    Object.assign(sys.result, { lossOutcome: outcome, npcLost: l.lost, npcKilled: l.killed, npcCaptured: l.captured });
  } },
  applyResults: { who: "gm", fn: async (ctx) => applyResults(ctx) },
  reset: { who: "gm", fn: async ({ sys }) => {
    resetRound(sys);
    Object.assign(sys.state, { phase: "prep", round: 0, step: "", position: "field", engagedLast: false, enemyImposeUsed: false,
      moraleImmunityUsed: false, moraleMinMod: 0, moraleLossMod: 0 });
    for (const k of sys.knights) Object.assign(k, { status: "field", participated: false, kills: [], invoked: "", invokedTarget: "", invokedRound: 0, squireLost: false });
    for (const e of sys.encounters) e.used = false;
    sys.conroi.morale = sys.conroi.moraleStart;
    sys.allied.outcome = "";
    sys.enemy.outcome = "";
    sys.log = [];
    sys.result = { lossOutcome: "", npcLost: 0, npcKilled: 0, npcCaptured: 0, otherLosses: 0, override: "", decisiveBonus: 0, applied: false };
  } }
};

export const ENCOUNTER_PACK = "pendragon-rencontres";

/* -------------------------------------------- */
/*  Étapes partagées                             */
/* -------------------------------------------- */

function computeMorale(ctx) {
  const { sys } = ctx;
  const chosen = sys.knights.map(k => moralePassion(knightActor(k), sys.conroi.court, k.passion)).filter(Boolean);
  const same = chosen.length > 1 && chosen.every(p => samePassion(p.name, chosen[0].name));
  sys.conroi.moraleStart = R.startingMorale(chosen.map(p => p.value), same);
  sys.conroi.morale = sys.conroi.moraleStart;
  sys.knights.forEach(k => { const p = moralePassion(knightActor(k), sys.conroi.court, k.passion); k.passion = p?.index ?? null; });
}

async function armyTests(ctx) {
  const { sys, battle } = ctx;
  const cfg = C();
  const b = { odds: sys.odds, favors: sys.favors, alliedMods: sys.allied.mods, enemyMods: sys.enemy.mods };
  for (const side of ["allied", "enemy"]) {
    const army = sys[side];
    if (army.battle === null) army.battle = await rollFormula(cfg.commanderSkill, F("PDVF.Battle.RollCommander", { side: L(`PDVF.Battle.Side.${side}`) }), battle);
    const modifier = R.commanderModifier(side, b, cfg);
    const { outcome } = await rollPlain({
      name: army.name || L(`PDVF.Battle.Side.${side}`), label: L("PDVF.Skill.battle"), value: army.battle, modifier,
      title: L("PDVF.Battle.ArmyTest"), subtitle: L(`PDVF.Battle.Side.${side}`), alias: battle.name,
      verdict: (o) => ({ text: L(`PDVF.Battle.ArmyResult.${side}.${o}`), cls: R.isSuccess(o) === (side === "allied") ? "victory" : "defeat" })
    });
    army.outcome = outcome;
  }
  const fx = R.armyTestEffects(sys.allied.outcome, sys.enemy.outcome);
  Object.assign(sys.state, fx, { enemyImposeUsed: false, moraleImmunityUsed: false });
  ctx.log(F("PDVF.Battle.Log.ArmyTests", { allied: L(`PDVF.Outcome.${sys.allied.outcome}`), enemy: L(`PDVF.Outcome.${sys.enemy.outcome}`) }));
}

/** Repli vers les lignes arrière : +1D6 de Moral, le tour se termine sans test d'Écuyer. */
async function retreatNow(ctx, text) {
  const { sys, battle } = ctx;
  const gain = await rollFormula(C().rearMorale, L("PDVF.Battle.RearMorale"), battle);
  sys.conroi.morale = R.clampMorale(sys.conroi.morale + gain, sys.conroi.moraleStart);
  for (const k of sys.knights) k.pendingMorale = "";
  Object.assign(sys.state, { position: "rear", engagedLast: false, step: "end" });
  ctx.log(F("PDVF.Battle.Log.Retreat", { gain, morale: sys.conroi.morale }));
  ctx.chat.push({ title: L("PDVF.Battle.Retreat"), text, lines: [F("PDVF.Battle.Card.Morale", { morale: sys.conroi.morale }), L("PDVF.Battle.Card.FirstAid")] });
}

/** Fin du tour de bataille : fin des passions invoquées pour ce tour, puis tour suivant ou fin. */
async function advance(ctx) {
  const { sys } = ctx;
  const st = sys.state;
  for (const k of sys.knights) {
    if (!k.invoked || k.invokedRound !== st.round) continue;
    const actor = knightActor(k);
    const i = actor?.activeInspirations?.().find(x => samePassion(x.source, k.invoked) && x.target === k.invokedTarget);
    if (i) await actor.endInspiration(i.index);
  }
  if (st.step !== "squire") st.engagedLast = false;
  resetRound(sys);
  // Le prisonnier escorté, ou le chevalier qui s'est dérobé seul, rejoint le conroi au tour suivant.
  for (const k of sys.knights) {
    if (k.status === "escort") k.status = "field";
    if (k.status === "rear" && st.position === "field") k.status = "field";
  }
  st.round += 1;
  if (st.round > R.maxRounds(sys.size, sys.rounds, C())) {
    st.round -= 1;
    st.step = "over";
    ctx.chat.push({ title: ctx.battle.name, text: L("PDVF.Battle.Card.Over") });
  } else st.step = "define";
}

async function applyResults(ctx) {
  const { sys, battle } = ctx;
  if (sys.result.applied) return false;
  const cfg = C();
  let sum = summary(sys);
  if (R.resultRow(sum.resultId, cfg).decisive && !sys.result.decisiveBonus) {
    sys.result.decisiveBonus = await rollFormula(cfg.decisiveLoot, L("PDVF.Battle.DecisiveLoot"), battle);
    sum = summary(sys);
  }
  const lines = [];
  for (const row of sum.knights) {
    const actor = fromUuidSync(row.uuid);
    if (!actor) continue;
    if (row.total) await actor.update({ "system.glory.session": (Number(actor.system.glory.session) || 0) + row.total });
    lines.push(F("PDVF.Battle.Card.KnightResult", {
      name: actor.name, glory: row.total, participation: row.participation, kills: row.killsGlory, loot: R.formatPounds(row.loot)
    }));
    for (const c of row.captives) lines.push(F("PDVF.Battle.Card.Captive", { name: actor.name, captive: c.name, ransom: c.ransom || "—" }));
  }
  if (sys.result.npcLost) lines.push(F("PDVF.Battle.Card.NpcLosses", { lost: sys.result.npcLost, killed: sys.result.npcKilled, captured: sys.result.npcCaptured }));
  sys.result.applied = true;
  ctx.log(F("PDVF.Battle.Log.Applied", { result: L(`PDVF.Battle.Result.${sum.resultId}`) }));
  ctx.chat.push({ title: battle.name, subtitle: L(`PDVF.Battle.Result.${sum.resultId}`), lines });
}
