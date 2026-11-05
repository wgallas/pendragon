/**
 * Bataille simplifiée, la « passe d'armes » (réglage du monde « Gestion des batailles ») :
 *   1. ordre : intention cachée de l'ennemi, test de Bataille du commandant, ordre donné ;
 *   2. choix : chaque chevalier prend une carte ouverte, une posture, éventuellement un renfort ;
 *   3. passe : un test opposé par chevalier (sa compétence contre la Valeur de la carte),
 *      victimes inscrites, Danger lancé et appliqué ; une opportunité se joue en duel ;
 *   4. fin de la rencontre (Moral), test d'Écuyer facultatif, tour suivant.
 * Actions côté MJ, comme celles du moteur (engine.mjs), qui les appelle.
 */
import { PDVF } from "../config.mjs";
import * as R from "../rules/battle.mjs";
import * as S from "../rules/battle-simple.mjs";
import { resolveTest, formatValue } from "../rules/resolution.mjs";
import { knightActor, findEncounter, rollFormula, retreatNow } from "./engine.mjs";
import { combatStats, receiveDamage, postCombatCard, snapshot } from "../combat/damage.mjs";
import { weaponOptions } from "../combat/exchange.mjs";
import { STATUS, hasStatus, setStatus } from "../combat/status.mjs";

const L = (k) => game.i18n.localize(k);
const F = (k, d) => game.i18n.format(k, d);
const C = () => PDVF.battle;
const CFG = () => PDVF.battle.simple;
const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0");

/* -------------------------------------------- */
/*  Outils                                       */
/* -------------------------------------------- */

/** Opposants en vigueur à ce tour. */
export function activeOpponents(sys) {
  return sys.encounters.filter(e => e.kind === "opponent" && R.activeAt(e, sys.state.round));
}

/** Opportunités encore jouables à ce tour. */
export function availableOpportunities(sys) {
  return sys.encounters.filter(e => e.kind === "opportunity" && !e.used && R.activeAt(e, sys.state.round));
}

/** Pas de test du commandant ce tour-ci : première charge, ou manœuvre au tour précédent. */
export function noOrderTest(st) {
  return (st.round === 1 && st.firstCharge) || st.lastOrder === "maneuver";
}

/** Première charge du premier tour : l'ordre est de charger. */
export function firstChargeRound(st) {
  return st.round === 1 && !!st.firstCharge;
}

/** Postures possibles pour un chevalier (carte choisie comprise). */
export function simplePostureChoices(sys, k) {
  const card = findEncounter(sys, k?.card);
  return R.postureChoices({ firstCharge: firstChargeRound(sys.state), forbidPrudent: card?.forbidPrudent });
}

/** Chevalier en état de se battre : sur le champ (ou isolé), ni inconscient ni mort. */
export function canFight(k) {
  if (!["field", "alone"].includes(k?.status)) return false;
  const actor = knightActor(k);
  return !!actor && !hasStatus(actor, STATUS.unconscious) && !hasStatus(actor, STATUS.dead);
}

/** Le conroi a-t-il le Moral qu'exige cette carte ? */
export function affordable(sys, card) {
  return !!card && sys.conroi.morale >= (Number(card.moraleMin) || 0) - (Number(sys.state.moraleMinMod) || 0);
}

/** Compétences de passe d'un chevalier : Charge si l'ordre est de charger, sinon ses armes. */
export function passSkills(actor, order) {
  if (!actor || actor.type !== "chevalier") return [];
  const seen = new Set();
  const out = [];
  const add = (key) => {
    if (seen.has(key)) return;
    const r = actor.getRollable(key);
    if (!r) return;
    seen.add(key);
    out.push({ key, label: r.label, value: passValue(actor, key) });
  };
  if (order === "charge") add("skill.charge");
  for (const o of weaponOptions(actor)) if (o.equipped && !o.unarmed) add(`skill.${o.skill}`);
  add("skill.sword");
  add("skill.brawling");
  return out;
}

/** Valeur de la compétence de passe (Charge plafonnée par l'Équitation). */
export function passValue(actor, key) {
  const v = Number(actor?.getRollable(key)?.value) || 0;
  if (key === "skill.charge") return Math.min(v, Number(actor.system.skills?.horsemanship?.value) || 0);
  return v;
}

/** Compétence de passe par défaut : la Charge si l'on charge, sinon la meilleure arme portée. */
export function defaultPassKey(actor, order) {
  const list = passSkills(actor, order);
  if (order === "charge" && list.some(s => s.key === "skill.charge")) return "skill.charge";
  return list.filter(s => s.key !== "skill.charge").reduce((b, s) => (!b || s.value > b.value ? s : b), null)?.key ?? "skill.sword";
}

/** Valeur et Danger d'une carte pour l'ordre en cours (attaques de l'adversaire lié). */
export async function profileOf(card, order) {
  let attacks = [];
  if (card?.npc) {
    try { attacks = (await fromUuid(card.npc))?.system?.attacks ?? []; } catch (err) { attacks = []; }
  }
  return S.cardProfile(card, attacks, order, CFG());
}

/** Même chose, sans attendre (fiche) : l'adversaire doit être en mémoire, sinon valeurs de la carte. */
export function profileOfSync(card, order) {
  let attacks = [];
  if (card?.npc) {
    try { attacks = fromUuidSync(card.npc)?.system?.attacks ?? []; } catch (err) { attacks = []; }
  }
  return S.cardProfile(card, attacks, order, CFG());
}

function randomOrder() {
  return S.ORDERS[Math.floor(Math.random() * S.ORDERS.length)];
}

/* -------------------------------------------- */
/*  Début du tour                                */
/* -------------------------------------------- */

/** Ouvre le tour : intention de l'ennemi tirée au hasard (le MJ peut la changer), cartes ouvertes. */
export async function beginRound(ctx) {
  const { sys, battle } = ctx;
  const st = sys.state;
  st.step = "order";
  if (st.position !== "field") return;
  st.intention = randomOrder();
  st.open = S.drawOpen(activeOpponents(sys), CFG().openCards);
  const events = sys.events.filter(e => e.round === st.round && e.text).map(e => F("PDVF.Battle.Card.Event", { text: e.text }));
  const first = firstChargeRound(st);
  const skip = noOrderTest(st);
  ctx.log(F("PDVF.Battle.Simple.Log.Round", { cards: st.open.map(id => findEncounter(sys, id)?.name).filter(Boolean).join(", ") || "—" }));
  ctx.chat.push({
    title: F("PDVF.Battle.RoundN", { round: st.round }), subtitle: battle.name,
    lines: [...events,
      F("PDVF.Battle.Simple.Card.Open", { names: st.open.map(id => findEncounter(sys, id)?.name).filter(Boolean).join(", ") || "—" }),
      first ? L("PDVF.Battle.Simple.Card.FirstCharge") : skip ? L("PDVF.Battle.Simple.Card.Maneuvered") : L("PDVF.Battle.Simple.Card.OrderTest")],
    buttons: skip ? [{ action: "open", label: L("PDVF.Battle.OpenSheet") }] : [{ action: "orderTest", label: L("PDVF.Battle.Simple.OrderTest") }]
  });
}

/* -------------------------------------------- */
/*  Actions                                      */
/* -------------------------------------------- */

const simple = (sys) => sys.state.mode === "simple";

export const SIMPLE_ACTIONS = {
  /** Le MJ choisit l'intention de l'ennemi (avant le test du commandant). */
  setIntention: { who: "gm", fn: async ({ sys }, { value, id }) => {
    value ??= id;
    const st = sys.state;
    if (!simple(sys) || st.step !== "order" || st.order || st.orderOutcome || !S.ORDERS.includes(value)) return false;
    st.intention = value;
  } },

  /** Test de Bataille du commandant (lancé chez lui) : voir l'intention, bonus, opportunité. */
  orderTest: { who: "commander", fn: async (ctx, { outcome }) => {
    const { sys } = ctx;
    const st = sys.state;
    if (!simple(sys) || st.step !== "order" || st.orderOutcome || st.order || noOrderTest(st)) return false;
    const fx = S.orderTestEffects(outcome, { enemyManeuvered: st.lastIntention === "maneuver" }, CFG());
    Object.assign(st, { orderOutcome: outcome, intentionSeen: fx.seen, orderBonus: fx.bonus });
    const lines = [];
    if (fx.opportunity) {
      const opp = availableOpportunities(sys).filter(e => !st.open.includes(e.id));
      if (opp.length) {
        const pick = opp[Math.floor(Math.random() * opp.length)];
        st.open.push(pick.id);
        lines.push(F("PDVF.Battle.Simple.Card.Opportunity", { name: pick.name }));
      }
    }
    if (fx.enemyImposes) st.imposed = true;
    ctx.log(F("PDVF.Battle.Simple.Log.OrderTest", { outcome: L(`PDVF.Outcome.${outcome}`) }));
    ctx.chat.push({
      title: L("PDVF.Battle.Simple.OrderTest"),
      text: L(`PDVF.Battle.Simple.OrderResult.${outcome}`),
      lines: [...(fx.seen ? [F("PDVF.Battle.Simple.Card.Intention", { order: L(`PDVF.Battle.Simple.Order.${st.intention}`) })] : []), ...lines]
    });
  } },

  /** L'ordre du commandant : bonus ou malus du tour, puis choix des cartes. */
  giveOrder: { who: "commander", fn: async (ctx, { order }) => {
    const { sys } = ctx;
    const st = sys.state;
    if (!simple(sys) || st.step !== "order" || st.order || st.position !== "field") return false;
    if (!st.orderOutcome && !noOrderTest(st)) return false;
    const first = firstChargeRound(st);
    if (first) order = "charge";
    if (!S.ORDERS.includes(order)) return false;
    const vs = first ? CFG().orderBonus : S.orderModifier(order, st.intention, CFG());
    Object.assign(st, { order, orderBonus: (Number(st.orderBonus) || 0) + vs, intentionSeen: true, step: "choose" });
    for (const k of sys.knights) {
      if (k.status !== "field" && k.status !== "alone") continue;
      k.weapon = defaultPassKey(knightActor(k), order);
      if (st.imposed && st.selectedId) k.card = st.selectedId;
    }
    const text = first ? L("PDVF.Battle.Simple.Card.FirstChargeOrder")
      : F("PDVF.Battle.Simple.Card.Order", { order: L(`PDVF.Battle.Simple.Order.${order}`), intention: L(`PDVF.Battle.Simple.Order.${st.intention}`) });
    ctx.log(F("PDVF.Battle.Simple.Log.Order", { order: L(`PDVF.Battle.Simple.Order.${order}`), intention: L(`PDVF.Battle.Simple.Order.${st.intention}`), bonus: signed(st.orderBonus) }));
    ctx.chat.push({
      title: L("PDVF.Battle.Simple.OrderGiven"), subtitle: F("PDVF.Battle.RoundN", { round: st.round }), text,
      lines: [F("PDVF.Battle.Simple.Card.Bonus", { bonus: signed(st.orderBonus) }),
        st.imposed ? L("PDVF.Battle.Simple.Card.Imposed") : L("PDVF.Battle.Simple.Card.Choose")],
      buttons: [{ action: "open", label: L("PDVF.Battle.OpenSheet") }]
    });
  } },

  /** Le MJ ajoute une opportunité aux cartes ouvertes. */
  openOpportunity: { who: "gm", fn: async ({ sys }, { id }) => {
    const st = sys.state;
    const card = findEncounter(sys, id);
    if (!simple(sys) || !["order", "choose"].includes(st.step) || !card || card.kind !== "opportunity" || card.used || st.open.includes(id)) return false;
    st.open.push(id);
  } },

  /** Échec critique du commandant : le MJ impose la carte de tout le conroi. */
  imposeCard: { who: "gm", fn: async (ctx, { id }) => {
    const { sys } = ctx;
    const st = sys.state;
    const card = findEncounter(sys, id);
    if (!simple(sys) || !st.imposed || !["order", "choose"].includes(st.step) || !card) return false;
    st.selectedId = id;
    if (!st.open.includes(id)) st.open.push(id);
    if (st.step === "choose") for (const k of sys.knights) if (k.status === "field" || k.status === "alone") k.card = id;
    ctx.log(F("PDVF.Battle.Log.Imposed", { name: card.name }));
  } },

  /** Un chevalier prend une carte ouverte. */
  chooseCard: { who: "knight", fn: async ({ sys }, { index, id }) => {
    const st = sys.state;
    const k = sys.knights[Number(index)];
    const card = findEncounter(sys, id);
    if (!simple(sys) || st.step !== "choose" || !k || !card || !st.open.includes(id)) return false;
    if (st.imposed && st.selectedId && id !== st.selectedId) return false;
    if (!affordable(sys, card)) return false;
    k.card = id;
    if (k.posture && !simplePostureChoices(sys, k).includes(k.posture)) { k.posture = ""; k.pendingMorale = ""; }
  } },

  /** Compétence de la passe. */
  setWeapon: { who: "knight", fn: async ({ sys }, { index, key }) => {
    const k = sys.knights[Number(index)];
    if (!simple(sys) || sys.state.step !== "choose" || !k || !/^skill\.\w+$/.test(key ?? "")) return false;
    if (!knightActor(k)?.getRollable(key)) return false;
    k.weapon = key;
  } },

  /** Renfort demandé (+5 à la passe, payé en Moral à l'engagement). */
  reinforce: { who: "knight", fn: async ({ sys }, { index }) => {
    const k = sys.knights[Number(index)];
    if (!simple(sys) || sys.state.step !== "choose" || !k) return false;
    k.reinforced = !k.reinforced;
  } },

  /** Le commandant échange une carte ouverte contre une autre du paquet (coûte du Moral). */
  swapCard: { who: "commander", fn: async (ctx, { id }) => {
    const { sys } = ctx;
    const st = sys.state;
    const card = findEncounter(sys, id);
    if (!simple(sys) || st.step !== "choose" || !card || card.kind !== "opponent" || !st.open.includes(id) || st.imposed) return false;
    const cost = CFG().swapCost;
    if (sys.conroi.morale < cost) { ui.notifications.warn(L("PDVF.Battle.Simple.Notify.NoMorale")); return false; }
    const pool = activeOpponents(sys).filter(e => !st.open.includes(e.id));
    if (!pool.length) { ui.notifications.warn(L("PDVF.Battle.Simple.Notify.NoSwap")); return false; }
    const next = pool[Math.floor(Math.random() * pool.length)];
    st.open = st.open.map(x => (x === id ? next.id : x));
    for (const x of sys.knights) if (x.card === id) x.card = "";
    sys.conroi.morale = R.clampMorale(sys.conroi.morale - cost, sys.conroi.moraleStart);
    ctx.log(F("PDVF.Battle.Simple.Log.Swap", { from: card.name, to: next.name, cost }));
  } },

  /** Le commandant engage le conroi : perte de Moral (carte la plus exigeante), renforts payés. */
  engagePasses: { who: "commander", fn: async (ctx) => {
    const { sys, battle } = ctx;
    const st = sys.state;
    if (!simple(sys) || st.step !== "choose") return false;
    if (st.imposed && !st.selectedId) { ui.notifications.warn(L("PDVF.Battle.Simple.Notify.ImposeFirst")); return false; }
    const fighters = [];
    for (const k of sys.knights) {
      if (!canFight(k)) { k.card = ""; continue; }
      if (!k.card) {
        const first = st.open.map(id => findEncounter(sys, id)).find(c => c?.kind === "opponent" && affordable(sys, c));
        k.card = first?.id ?? "";
      }
      const card = findEncounter(sys, k.card);
      if (!card || !affordable(sys, card)) { k.card = ""; continue; }
      if (!k.posture || !simplePostureChoices(sys, k).includes(k.posture)) {
        k.posture = "valorous";
        k.pendingMorale = C().postures.valorous.morale;
        await knightActor(k)?.markExperience(C().postures.valorous.trait);
      }
      if (!k.weapon) k.weapon = defaultPassKey(knightActor(k), st.order);
      fighters.push(k);
    }
    if (!fighters.length) {
      ctx.log(L("PDVF.Battle.Simple.Log.NoFighter"));
      return retreatNow(ctx, L("PDVF.Battle.Simple.Card.NoFighter"));
    }
    const hardest = S.hardestCard(fighters.map(k => findEncounter(sys, k.card)));
    let loss = 0;
    if (st.immune) { st.moraleImmunityUsed = true; st.immune = false; }
    else if (hardest?.moraleLoss && hardest.moraleLoss !== "0") {
      loss = Math.max(0, await rollFormula(hardest.moraleLoss, F("PDVF.Battle.MoraleLossOf", { name: hardest.name }), battle) - st.moraleLossMod);
    }
    let cost = 0;
    for (const k of fighters) {
      if (!k.reinforced) continue;
      if (sys.conroi.morale - loss - cost >= CFG().reinforceCost) cost += CFG().reinforceCost;
      else k.reinforced = false;
    }
    st.moraleLoss = loss;
    st.selectedId = hardest?.id ?? "";
    sys.conroi.morale = R.clampMorale(sys.conroi.morale - loss - cost, sys.conroi.moraleStart);
    ctx.log(F("PDVF.Battle.Simple.Log.Engage", { loss, cost, morale: sys.conroi.morale }));
    if (sys.conroi.morale <= 0) return retreatNow(ctx, L("PDVF.Battle.Card.NoMorale"));
    for (const k of fighters) {
      k.participated = true;
      if (findEncounter(sys, k.card)?.kind === "opportunity") k.pass = "duel";
    }
    st.step = "pass";
    ctx.chat.push({
      title: L("PDVF.Battle.Simple.Engaged"), subtitle: F("PDVF.Battle.RoundN", { round: st.round }),
      lines: [
        ...fighters.map(k => F(k.pass === "duel" ? "PDVF.Battle.Simple.Card.FacesDuel" : "PDVF.Battle.Simple.Card.Faces", {
          name: knightActor(k)?.name ?? "?", card: findEncounter(sys, k.card)?.name ?? "?", posture: L(`PDVF.Battle.Posture.${k.posture}`),
          reinforced: k.reinforced ? L("PDVF.Battle.Simple.Card.Reinforced") : "" })),
        loss || cost ? F("PDVF.Battle.Simple.Card.MoraleSpent", { loss, cost, morale: sys.conroi.morale }) : F("PDVF.Battle.Card.Morale", { morale: sys.conroi.morale })
      ],
      buttons: [{ action: "pass", label: L("PDVF.Battle.Simple.Pass") }]
    });
  } },

  /** La passe d'un chevalier : un test opposé, victimes, Danger, revers. */
  pass: { who: "knight", fn: async (ctx, { index }) => {
    const { sys, battle } = ctx;
    const st = sys.state;
    const k = sys.knights[Number(index)];
    if (!simple(sys) || st.step !== "pass" || !k || !k.participated || k.pass || !canFight(k)) return false;
    const card = findEncounter(sys, k.card);
    const actor = knightActor(k);
    if (!card || card.kind !== "opponent" || !actor) return false;
    return resolvePass(ctx, Number(index), k, card, actor);
  } },

  /** Le MJ rejoue une passe (victimes du tour retirées ; dégâts : bouton Annuler de la carte). */
  resetPass: { who: "gm", fn: async (ctx, { index }) => {
    const k = ctx.sys.knights[Number(index)];
    if (!simple(ctx.sys) || ctx.sys.state.step !== "pass" || !k || !k.pass || k.pass === "duel") return false;
    k.kills = k.kills.filter(x => x.round !== ctx.sys.state.round);
    k.pass = "";
  } },

  /** « Annuler » de la carte de passe : victimes, Moral et état du chevalier rendus. */
  undoPass: { who: "gm", fn: async (ctx, { index, round, morale = 0, status = "" }) => {
    const { sys } = ctx;
    const k = sys.knights[Number(index)];
    if (!k || Number(round) !== sys.state.round) return false;
    k.kills = k.kills.filter(x => x.round !== sys.state.round);
    if (sys.state.step === "pass") k.pass = "";
    if (morale) sys.conroi.morale = R.clampMorale(sys.conroi.morale - Number(morale), sys.conroi.moraleStart);
    if (status) k.status = status;
    ctx.log(F("PDVF.Battle.Simple.Log.Undone", { name: knightActor(k)?.name ?? "?" }));
  } },

  /** Fin des passes : Moral des victimes et des postures, opportunités jouées, test d'Écuyer. */
  endPasses: { who: "gm", fn: async (ctx) => {
    const { sys, battle } = ctx;
    const st = sys.state;
    if (!simple(sys) || st.step !== "pass") return false;
    const kills = sys.knights.flatMap(k => k.kills.filter(x => x.round === st.round));
    const gain = R.moraleFromKills(kills);
    let delta = 0;
    for (const k of sys.knights) {
      if (!k.pendingMorale) continue;
      if (k.participated) {
        delta += await rollFormula(k.pendingMorale, F("PDVF.Battle.PostureMorale", {
          name: knightActor(k)?.name ?? "?", posture: L(`PDVF.Battle.Posture.${k.posture}`) }), battle);
      }
      k.pendingMorale = "";
    }
    sys.conroi.morale = R.clampMorale(sys.conroi.morale + gain + delta, sys.conroi.moraleStart);
    for (const k of sys.knights) {
      const card = findEncounter(sys, k.card);
      if (k.participated && card?.kind === "opportunity") card.used = true;
    }
    st.engagedLast = true;
    st.step = "squire";
    ctx.log(F("PDVF.Battle.Log.End", { name: L("PDVF.Battle.Simple.Passes"), kills: kills.length, gain, delta, morale: sys.conroi.morale }));
    ctx.chat.push({
      title: F("PDVF.Battle.Simple.EndOfRound", { round: st.round }),
      lines: [F("PDVF.Battle.Card.Defeated", { count: kills.length, gain }), F("PDVF.Battle.Card.Morale", { morale: sys.conroi.morale }), L("PDVF.Battle.Card.SquireOptional")],
      buttons: [{ action: "squireTest", label: L("PDVF.Battle.SquireTest") }]
    });
  } }
};

/* -------------------------------------------- */
/*  Résolution d'une passe                       */
/* -------------------------------------------- */

async function d20() {
  const r = new Roll("1d20");
  await r.evaluate();
  return r;
}

async function resolvePass(ctx, index, k, card, actor) {
  const { sys, battle } = ctx;
  const st = sys.state;
  const cfg = CFG();
  const undo = snapshot(actor);
  const prof = await profileOf(card, st.order);
  const key = k.weapon && actor.getRollable(k.weapon) ? k.weapon : defaultPassKey(actor, st.order);
  const rollable = actor.getRollable(key);
  const value = passValue(actor, key);
  const posture = S.postureProfile(k.posture, cfg);

  // Modificateurs : ordre, posture, renfort, inspiration, ivresse, chevalier isolé
  const parts = [];
  const add = (label, v) => { if (v) parts.push({ label, value: v }); };
  add(L("PDVF.Battle.Simple.Mod.order"), Number(st.orderBonus) || 0);
  add(L(`PDVF.Battle.Posture.${k.posture}`), Number(posture.skill) || 0);
  if (k.reinforced) add(L("PDVF.Battle.Simple.Mod.reinforced"), cfg.reinforceBonus);
  add(L("PDVF.Battle.Simple.Mod.inspiration"), actor.inspirationBonus(key));
  add(L("PDVF.Battle.Simple.Mod.condition"), actor.conditionModifier?.(key)?.value ?? 0);
  if (k.status === "alone") add(L("PDVF.Battle.Status.alone"), cfg.isolatedPenalty);
  const modifier = parts.reduce((s, p) => s + p.value, 0);

  const r1 = await d20();
  const r2 = await d20();
  const kr = resolveTest(value, modifier, r1.total);
  const er = resolveTest(prof.value, 0, r2.total);
  const outcome = S.passOutcome(kr, er);
  const fx = S.passEffects(outcome, cfg);
  const rolls = [r1, r2];
  const passLines = [
    F("PDVF.Battle.Simple.Line.Knight", { name: actor.name, label: rollable?.label ?? key, value: formatValue(value),
      mods: parts.length ? ` (${parts.map(p => `${p.label} ${signed(p.value)}`).join(", ")})` : "", die: kr.die, outcome: L(`PDVF.Outcome.${kr.outcome}`) }),
    F("PDVF.Battle.Simple.Line.Enemy", { name: card.name, value: formatValue(prof.value), attack: prof.attack ? ` (${prof.attack})` : "", die: er.die, outcome: L(`PDVF.Outcome.${er.outcome}`) })
  ];

  // Victimes (une capture sur un exploit si la carte a une rançon)
  const sharing = sys.knights.filter(x => x.participated && x.card === card.id).length;
  const n = S.victims(S.perKnightCount(card, sharing), k.posture, outcome, cfg);
  const glory = R.opponentGlory(card.glory, sys.tournament, C());
  for (let i = 0; i < n; i++) {
    const captured = !!fx.capture && i === 0 && !!card.ransom;
    k.kills.push({ name: card.name, kv: card.kv, glory, captured, round: st.round, ransom: captured ? card.ransom : "" });
  }
  const resultLines = [L(`PDVF.Battle.Simple.Outcome.${outcome}`)];
  if (n) resultLines.push(F("PDVF.Battle.Simple.Line.Victims", { n, glory: n * glory, captured: fx.capture && card.ransom ? L("PDVF.Battle.Simple.Line.Captive") : "" }));

  // Moral (mêlée confuse)
  const moraleBefore = sys.conroi.morale;
  if (fx.morale) sys.conroi.morale = R.clampMorale(sys.conroi.morale + fx.morale, sys.conroi.moraleStart);
  const moraleDelta = sys.conroi.morale - moraleBefore;
  if (moraleDelta) resultLines.push(F("PDVF.Battle.Simple.Line.Morale", { delta: signed(moraleDelta), morale: sys.conroi.morale }));

  // Expérience sur un critique
  if (kr.outcome === "critical" && rollable?.canXp && !actor.noSkillXp) {
    await actor.markExperience(key);
    resultLines.push(F("PDVF.Card.XpMarked", { name: actor.name, label: rollable.label }));
  }

  // Danger
  const sections = [{ title: L("PDVF.Battle.Simple.Section.Pass"), lines: passLines }, { title: L("PDVF.Battle.Simple.Section.Result"), lines: resultLines }];
  if (fx.damage !== "none") {
    const formula = S.postureDanger(prof.danger, k.posture, cfg);
    const dmg = new Roll(String(formula).replace(/D/g, "d"));
    await dmg.evaluate();
    rolls.push(dmg);
    const shield = fx.damage === "shield" ? Number(combatStats(actor).shield) || 0 : 0;
    const out = await receiveDamage(actor, { base: dmg.total, shield, shieldIsShield: true, source: card.name }, undo);
    rolls.push(...out.rolls);
    sections.push({ title: F("PDVF.Battle.Simple.Section.Danger", { formula, total: dmg.total }), lines: out.lines });
  }

  // Revers d'un échec critique
  const previousStatus = k.status;
  if (fx.setback) {
    const die = new Roll("1d6");
    await die.evaluate();
    rolls.push(die);
    const id = S.setback(die.total, cfg);
    const lines = [F(`PDVF.Battle.Simple.Setback.${id}`, { name: actor.name, die: die.total })];
    if (id === "unhorsed" && hasStatus(actor, STATUS.mounted)) {
      await setStatus(actor, STATUS.mounted, false);
      await setStatus(actor, STATUS.prone, true);
    } else if (id === "unhorsed") {
      await setStatus(actor, STATUS.prone, true);
    }
    if (id === "weapon") await setStatus(actor, STATUS.disarmed, true);
    if (id === "isolated") k.status = "alone";
    sections.push({ title: L("PDVF.Battle.Simple.Section.Setback"), lines });
  }

  k.pass = outcome;
  ctx.log(F("PDVF.Battle.Simple.Log.Pass", { name: actor.name, card: card.name, outcome: L(`PDVF.Battle.Simple.OutcomeShort.${outcome}`), n }));
  await postCombatCard({
    actor, title: F("PDVF.Battle.Simple.PassOf", { name: actor.name }), subtitle: `${card.name} — ${battle.name}`,
    sections, rolls, undo: [undo],
    flags: { battlePass: { battle: battle.uuid, index, round: st.round, morale: moraleDelta, status: k.status !== previousStatus ? previousStatus : "" } }
  });
}

