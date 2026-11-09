/**
 * Duel stratégique : moteur côté MJ. L'état du duel vit dans les drapeaux d'un message du chat
 * (« carte du duel ») ; le MJ actif fait toutes les écritures, les joueurs passent par le socket.
 * Les choix d'intention restent dans les données du message, mais la fenêtre du duel ne montre
 * à chacun que ce qu'il a le droit de voir.
 */
import { PDVF, SYSTEM_ID } from "../config.mjs";
import * as D from "../rules/duel.mjs";
import { resolveTest, formatValue, compareOpposed, traitProcedure, attributeLevel } from "../rules/resolution.mjs";
import { addDice } from "../rules/combat.mjs";
import { protection } from "../rules/equipment.mjs";
import { combatStats, receiveDamage, postCombatCard, snapshot } from "../combat/damage.mjs";
import { weaponOptions } from "../combat/exchange.mjs";
import { STATUS, hasStatus, setStatus } from "../combat/status.mjs";

const L = (k) => game.i18n.localize(k);
const F = (k, d) => game.i18n.format(k, d);
const C = () => PDVF.duel;
export const SOCKET = `system.${SYSTEM_ID}`;
const CARD = `systems/${SYSTEM_ID}/templates/chat/duel-card.hbs`;
const OTHER = { a: "b", b: "a" };
const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0");

/* -------------------------------------------- */
/*  Acteurs et valeurs                           */
/* -------------------------------------------- */

/** Acteur d'un duelliste : celui du jeton (PNJ non liés), sinon l'acteur. */
export function sideActor(side) {
  if (!side) return null;
  try {
    if (side.token) {
      const t = fromUuidSync(side.token);
      if (t?.actor) return t.actor;
    }
    return side.actor ? fromUuidSync(side.actor) : null;
  } catch (err) { return null; }
}

/** L'utilisateur joue-t-il ce duelliste ? */
export function controls(user, side) {
  if (!user || !side) return false;
  if (user.isGM) return true;
  return !!sideActor(side)?.testUserPermission?.(user, "OWNER");
}

/** Armes possibles en duel (pas d'arme de tir). */
export function duelWeapons(actor) {
  return actor ? weaponOptions(actor).filter(o => !o.ranged && o.skill !== "charge") : [];
}

/** Arme par défaut : la meilleure arme portée (hors mains nues). */
export function defaultWeapon(actor) {
  const list = duelWeapons(actor);
  const armed = list.filter(o => !o.unarmed && o.equipped);
  return (armed.length ? armed : list).reduce((b, o) => (!b || o.skillValue > b.skillValue ? o : b), null)?.ref ?? "unarmed";
}

/** Arme utilisée à cette passe : mains nues si désarmé ou en corps à corps (Entrer contre Entrer). */
function weaponFor(actor, side, brawl = false) {
  const list = duelWeapons(actor);
  if (brawl || hasStatus(actor, STATUS.disarmed)) return list.find(o => o.unarmed) ?? list[0];
  return list.find(o => o.ref === side.weapon) ?? list.find(o => o.ref === defaultWeapon(actor)) ?? list[0];
}

/** Valeur d'un trait (« trait.prudent.left ») pour un chevalier ou un PNJ. */
export function traitValue(actor, key) {
  if (!actor) return 10;
  if (actor.type === "chevalier") return Number(actor.getRollable(key)?.value) || 0;
  const [, id, side] = key.split(".");
  const other = side === "left" ? "right" : "left";
  return D.npcTraitValue(actor.system?.traits, L(`PDVF.Trait.${id}.${side}`), L(`PDVF.Trait.${id}.${other}`));
}

function traitLabel(key) {
  const [, id, side] = key.split(".");
  return L(`PDVF.Trait.${id}.${side}`);
}

function hp(actor) {
  const h = actor?.system?.health?.hp ?? {};
  const max = actor?.type === "chevalier" ? Number(actor.system?.derived?.hpMax ?? h.max) : Number(actor?.system?.derived?.hp ?? h.max);
  return { value: Number(h.value) || 0, max: Number(max || h.max) || 0 };
}

export function atHalf(actor) {
  const h = hp(actor);
  return D.halfHp(h.value, h.max);
}

async function d20() {
  const r = new Roll("1d20");
  await r.evaluate();
  return r;
}

async function rollFormula(formula) {
  const r = new Roll(String(formula || "0").replace(/D/g, "d"));
  await r.evaluate();
  return r;
}

async function xp(actor, key) {
  if (actor?.type === "chevalier" && key) await actor.markExperience(key);
}

/** Test simple d'un trait (souffle, trait célèbre). */
async function simpleTrait(actor, key, ctx, modifier = 0) {
  const r = await d20();
  ctx.rolls.push(r);
  const res = resolveTest(traitValue(actor, key), modifier, r.total);
  ctx.lines.push(F("PDVF.Duel.Line.Trait", { name: actor.name, trait: traitLabel(key), value: formatValue(traitValue(actor, key)), die: res.die, outcome: L(`PDVF.Outcome.${res.outcome}`) }));
  return res;
}

/**
 * Procédure des traits (trait visé, puis trait opposé en cas d'échec ; un trait célèbre d'abord).
 * @returns {Promise<string|null>} clé du trait qui l'emporte, ou null (choix libre)
 */
async function traitProcedureTest(actor, key, ctx) {
  let first = key;
  let second = D.oppositeTrait(key);
  const famous = (k) => ["famous", "exalted"].includes(attributeLevel(traitValue(actor, k)));
  if (!famous(first) && famous(second)) [first, second] = [second, first];
  const r1 = await d20();
  ctx.rolls.push(r1);
  const res1 = resolveTest(traitValue(actor, first), 0, r1.total);
  ctx.lines.push(F("PDVF.Duel.Line.Trait", { name: actor.name, trait: traitLabel(first), value: formatValue(traitValue(actor, first)), die: res1.die, outcome: L(`PDVF.Outcome.${res1.outcome}`) }));
  let proc = traitProcedure(res1);
  if (proc.needSecond) {
    const r2 = await d20();
    ctx.rolls.push(r2);
    const res2 = resolveTest(traitValue(actor, second), 0, r2.total);
    ctx.lines.push(F("PDVF.Duel.Line.Trait", { name: actor.name, trait: traitLabel(second), value: formatValue(traitValue(actor, second)), die: res2.die, outcome: L(`PDVF.Outcome.${res2.outcome}`) }));
    proc = traitProcedure(res1, res2);
  }
  if (proc.xp) await xp(actor, proc.xp === "first" ? first : second);
  if (proc.acts === "first") return first;
  if (proc.acts === "second") return second;
  return null;
}

/* -------------------------------------------- */
/*  État                                         */
/* -------------------------------------------- */

export function newSide(actor, token, weapon) {
  return {
    actor: actor.uuid, token: token?.uuid ?? token ?? null, name: token?.name ?? actor.name, img: actor.img,
    weapon: weapon ?? defaultWeapon(actor),
    see: [], choice: "", revealed: false, forced: "", forcedNext: "", blocked: [], tested: [],
    breath: 0, fear: 0, grudge: false, rest: false, rearm: false, maxValue: 0, falseMercy: false, toDeath: false
  };
}

export function newDuel({ a, b, stakes = "outrance" }) {
  return {
    version: 1, phase: "challenge", stakes: C().stakes.includes(stakes) ? stakes : "outrance",
    passe: 0, first: null, bindNext: "", a, b, pending: null, surrender: null, result: null, battle: "", log: []
  };
}

/** Message d'un duel. */
export function duelOf(message) {
  return message?.getFlag?.(SYSTEM_ID, "duel") ?? message?.flags?.[SYSTEM_ID]?.duel ?? null;
}

/** Duels en cours. */
export function activeDuels() {
  return (game.messages?.contents ?? []).filter(m => { const d = duelOf(m); return d && !["over"].includes(d.phase); });
}

/* -------------------------------------------- */
/*  Demandes et socket                           */
/* -------------------------------------------- */

export function request(message, op, payload = {}) {
  if (game.user.isGM) return perform(message, op, payload, game.user.id);
  if (!game.users.activeGM) return ui.notifications.warn(L("PDVF.Combat.Notify.NoGM"));
  game.socket.emit(SOCKET, { type: "duel", op, message: message.id, payload, user: game.user.id });
}

export function onSocket(data) {
  if (data?.type === "duelOpen") {
    const message = game.messages.get(data.message);
    const d = duelOf(message);
    if (message && d && ["a", "b"].some(s => !game.user.isGM && controls(game.user, d[s]))) {
      game.pendragon?.duel?.openPanel?.(message);
    }
    return;
  }
  if (data?.type === "duelBreak") {
    if (game.users.activeGM?.isSelf) breakFor(data.attacker, data.target);
    return;
  }
  if (data?.type !== "duel" || !game.users.activeGM?.isSelf) return;
  const message = game.messages.get(data.message);
  if (message) perform(message, data.op, data.payload, data.user);
}

let queue = Promise.resolve();
export function perform(message, op, payload, userId) {
  queue = queue.then(() => run(message, op, payload ?? {}, userId)).catch(err => {
    console.error(`${SYSTEM_ID} | Duel : ${op}`, err);
    ui.notifications.error(`${L("PDVF.Duel.Title")} : ${err.message}`);
  });
  return queue;
}

async function run(message, op, payload, userId) {
  const def = ACTIONS[op];
  if (!def) return;
  const user = game.users.get(userId) ?? game.user;
  const st = foundry.utils.deepClone(duelOf(message));
  if (!st) return;
  if (!allowed(st, def.who, payload, user)) {
    console.warn(`${SYSTEM_ID} | Duel : action « ${op} » refusée pour ${user?.name}`);
    return;
  }
  const ctx = { message, st, user, lines: [], rolls: [], cards: [], log: (t) => st.log.push({ passe: st.passe, text: t }) };
  const keep = await def.fn(ctx, payload);
  if (keep === false) return;
  await save(message, st);
  for (const c of ctx.cards) await postCombatCard(c);
}

function allowed(st, who, payload, user) {
  if (user.isGM) return true;
  if (who === "side") return ["a", "b"].includes(payload.side) && controls(user, st[payload.side]);
  if (who === "defender") return controls(user, st.b);
  if (who === "any") return controls(user, st.a) || controls(user, st.b);
  return false;
}

async function save(message, st) {
  const content = await renderCard(st);
  await message.update({ content, [`flags.${SYSTEM_ID}.duel`]: st });
}

/** Carte du duel dans le chat (résumé tenu à jour). */
export async function renderCard(st) {
  const status = st.phase === "over" ? (st.result ? F(`PDVF.Duel.End.${st.result.reason}`, { winner: st[st.result.winner]?.name ?? "", loser: st[OTHER[st.result.winner]]?.name ?? "" }) : L("PDVF.Duel.Phase.over"))
    : st.phase === "challenge" ? F("PDVF.Duel.Card.Challenge", { a: st.a.name, b: st.b.name, stakes: L(`PDVF.Duel.Stakes.${st.stakes}`) })
      : F("PDVF.Duel.Card.Passe", { passe: st.passe, phase: L(`PDVF.Duel.Phase.${st.phase}`) });
  return foundry.applications.handlebars.renderTemplate(CARD, {
    title: F("PDVF.Duel.TitleOf", { a: st.a.name, b: st.b.name }), stakes: L(`PDVF.Duel.Stakes.${st.stakes}`), status,
    challenge: st.phase === "challenge", over: st.phase === "over"
  });
}

/** Annonce aux duellistes que la fenêtre du duel est ouverte. */
export function broadcastOpen(message) {
  game.socket.emit(SOCKET, { type: "duelOpen", message: message.id });
}

/* -------------------------------------------- */
/*  Déroulement                                  */
/* -------------------------------------------- */

function sideName(st, s) { return st[s].name; }

/** Peur en début de duel : créature, ou adversaire bien plus glorieux. */
function dreadful(actor, other) {
  if (!actor || !other) return false;
  if (other.type === "pnj" && other.system?.category === "creature") return true;
  if (actor.type === "chevalier" && other.type === "chevalier") {
    const g = Number(actor.system.gloryTotal) || 0;
    const o = Number(other.system.gloryTotal) || 0;
    return o >= 2 * g && o >= g + 1000;
  }
  return false;
}

async function startDuel(ctx) {
  const { st } = ctx;
  // Bataille liée : un jeton posé par « Placer les ennemis ».
  for (const s of ["a", "b"]) {
    try {
      const tok = st[s].token ? fromUuidSync(st[s].token) : null;
      const battle = tok?.getFlag?.(SYSTEM_ID, "battle");
      if (battle) { st.battle = battle; st.battleSide = s; }
    } catch (err) { /* sans jeton */ }
  }
  // Peur
  for (const s of ["a", "b"]) {
    const actor = sideActor(st[s]);
    const other = sideActor(st[OTHER[s]]);
    if (!dreadful(actor, other)) continue;
    const acts = await traitProcedureTest(actor, "trait.valorous.left", ctx);
    if (acts === "trait.valorous.right") {
      st[s].fear = C().fearPenalty;
      ctx.lines.push(F("PDVF.Duel.Line.Fear", { name: actor.name, mod: signed(st[s].fear) }));
    }
  }
  const mounted = ["a", "b"].some(s => hasStatus(sideActor(st[s]), STATUS.mounted));
  ctx.log(F("PDVF.Duel.Log.Start", { a: st.a.name, b: st.b.name, stakes: L(`PDVF.Duel.Stakes.${st.stakes}`) }));
  if (mounted) {
    st.phase = "mounted";
    ctx.lines.push(L("PDVF.Duel.Line.Mounted"));
    flushCard(ctx, L("PDVF.Duel.Accepted"));
    return;
  }
  flushCard(ctx, L("PDVF.Duel.Accepted"));
  await beginPasse(ctx);
}

/** Met les lignes en attente dans une carte de combat. */
function flushCard(ctx, title, subtitle = "", undo = []) {
  if (!ctx.lines.length && !ctx.rolls.length) return;
  const { st } = ctx;
  ctx.cards.push({ actor: null, title, subtitle: subtitle || F("PDVF.Duel.TitleOf", { a: st.a.name, b: st.b.name }),
    sections: [{ lines: ctx.lines.splice(0) }], rolls: ctx.rolls.splice(0), undo });
}

/** Nouvelle passe : souffle, reddition des PNJ, lecture. */
async function beginPasse(ctx) {
  const { st } = ctx;
  st.passe += 1;
  st.phase = "choose";
  st.pending = null;
  for (const s of ["a", "b"]) {
    Object.assign(st[s], { see: [], choice: "", revealed: false, blocked: [], tested: [], rest: false, rearm: false, forced: st[s].forcedNext || "", forcedNext: "" });
  }
  const cfg = C();
  // Souffle
  if (st.passe >= cfg.breathFrom) {
    for (const s of ["a", "b"]) {
      const actor = sideActor(st[s]);
      const res = await simpleTrait(actor, "trait.energetic.left", ctx);
      if (!res.success) {
        st[s].breath += cfg.breathPenalty;
        ctx.lines.push(F("PDVF.Duel.Line.Breath", { name: actor.name, mod: signed(st[s].breath) }));
      }
    }
  }
  // Reddition des PNJ à la moitié de leurs PV (Livre du maître, p. 131)
  for (const s of ["a", "b"]) {
    const actor = sideActor(st[s]);
    if (actor?.type !== "pnj" || st[s].toDeath || !atHalf(actor)) continue;
    const r = await d20();
    ctx.rolls.push(r);
    const res = resolveTest(traitValue(actor, "trait.valorous.left"), 0, r.total);
    const what = D.surrenderCheck(res.outcome);
    ctx.lines.push(F("PDVF.Duel.Line.NpcCourage", { name: actor.name, die: res.die, outcome: L(`PDVF.Outcome.${res.outcome}`), what: L(`PDVF.Duel.Courage.${what}`) }));
    if (what === "toDeath") st[s].toDeath = true;
    if (what === "surrender") return endDuel(ctx, OTHER[s], "surrender");
    if (what === "flee") {
      const other = sideActor(st[OTHER[s]]);
      const ra = await d20(); const rb = await d20();
      ctx.rolls.push(ra, rb);
      const fa = resolveTest(actor.system.characteristics?.dex?.value ?? 10, 0, ra.total);
      const fb = resolveTest(other.system.characteristics?.dex?.value ?? 10, 0, rb.total);
      const cmp = compareOpposed(fa, fb);
      const escaped = cmp.winner === "a";
      ctx.lines.push(F(escaped ? "PDVF.Duel.Line.Fled" : "PDVF.Duel.Line.Caught", { name: actor.name }));
      if (escaped) return endDuel(ctx, OTHER[s], "fled");
    }
  }
  // Lecture
  if (st.bindNext) {
    const w = st.bindNext;
    st[w].see = D.revealRandom(cfg.bindCards);
    st.first = OTHER[w];
    ctx.lines.push(F("PDVF.Duel.Line.BindReading", { name: sideName(st, w), n: st[w].see.length }));
    st.bindNext = "";
  } else {
    const res = {};
    for (const s of ["a", "b"]) {
      const actor = sideActor(st[s]);
      const r = actor.getRollable("skill.awareness");
      const helm = actor.type === "chevalier" ? protection(actor.items.contents).vigilance : 0;
      const mod = helm + (actor.inspirationBonus?.("skill.awareness") ?? 0);
      const roll = await d20();
      ctx.rolls.push(roll);
      res[s] = resolveTest(Number(r?.value) || 0, mod, roll.total);
      ctx.lines.push(F("PDVF.Duel.Line.Reading", { name: actor.name, value: formatValue(r?.value ?? 0), mod: mod ? ` (${signed(mod)})` : "", die: res[s].die, outcome: L(`PDVF.Outcome.${res[s].outcome}`) }));
    }
    const rr = D.readingResult(res.a, res.b, cfg);
    st.a.see = D.revealRandom(rr.seeA);
    st.b.see = D.revealRandom(rr.seeB);
    st.first = rr.first;
  }
  ctx.lines.push(st.first ? F("PDVF.Duel.Line.First", { name: sideName(st, st.first) }) : L("PDVF.Duel.Line.Simultaneous"));
  ctx.log(F("PDVF.Duel.Log.Passe", { passe: st.passe }));
  flushCard(ctx, F("PDVF.Duel.PasseN", { passe: st.passe }));
}

/** Fin du duel : vainqueur, raison ; reddition et inconscience à outrance passent par le dénouement. */
async function endDuel(ctx, winner, reason) {
  const { st } = ctx;
  st.result = { winner, reason, glory: 0, captive: false, spared: null };
  if ((reason === "surrender" || reason === "unconscious") && st.stakes === "outrance") {
    st.phase = "aftermath";
    ctx.lines.push(F(`PDVF.Duel.End.${reason}`, { winner: st[winner].name, loser: st[OTHER[winner]].name }));
    ctx.lines.push(L("PDVF.Duel.Line.Aftermath"));
    flushCard(ctx, L("PDVF.Duel.Title"));
    return;
  }
  await conclude(ctx);
}

/** Bilan : Gloire (Table A.1 ou carte de bataille), captif, victime inscrite dans la bataille. */
async function conclude(ctx) {
  const { st } = ctx;
  const r = st.result;
  st.phase = "over";
  const winner = sideActor(st[r.winner]);
  const loserSide = OTHER[r.winner];
  const loser = sideActor(st[loserSide]);
  ctx.lines.push(F(`PDVF.Duel.End.${r.reason}`, { winner: st[r.winner].name, loser: st[loserSide].name }));
  const battle = st.battle && st.battleSide === loserSide ? await fromUuid(st.battle).catch(() => null) : null;
  if (battle && winner?.type === "chevalier") {
    const index = battle.system.knights.findIndex(k => k.uuid === winner.uuid);
    if (index >= 0) {
      await game.pendragon.battle.engine.perform(battle, "addKill", { index, captured: !!r.captive }, game.user.id);
      try { await fromUuidSync(st[loserSide].token)?.setFlag?.(SYSTEM_ID, "killCounted", true); } catch (err) { /* */ }
      ctx.lines.push(F("PDVF.Duel.Line.BattleKill", { name: winner.name, battle: battle.name }));
    }
  } else if (winner?.type === "chevalier" && r.reason !== "declined" && r.reason !== "broken" && r.reason !== "abandoned") {
    r.glory = D.duelGlory(st[loserSide].maxValue, st.stakes, PDVF.combatGlory, C());
    await winner.update({ "system.glory.session": (Number(winner.system.glory?.session) || 0) + r.glory });
    ctx.lines.push(F("PDVF.Duel.Line.Glory", { name: winner.name, glory: r.glory, value: formatValue(st[loserSide].maxValue) }));
  }
  if (r.captive && winner?.type === "chevalier") {
    const list = foundry.utils.deepClone(winner.getFlag(SYSTEM_ID, "ransoms") ?? []);
    const year = Number(game.settings.get(SYSTEM_ID, "currentYear")) || null;
    list.push({ id: foundry.utils.randomID(), name: st[loserSide].name, source: L("PDVF.Duel.Title"), text: "", year, rank: "", proposal: null, rollLabel: "", status: "pending" });
    await winner.setFlag(SYSTEM_ID, "ransoms", list);
    ctx.lines.push(F("PDVF.Duel.Line.Captive", { name: winner.name, captive: st[loserSide].name }));
  }
  if (["surrender", "unconscious", "killed"].includes(r.reason) && st.stakes === "outrance") ctx.lines.push(L("PDVF.Duel.Line.Spoils"));
  ctx.log(F("PDVF.Duel.Log.End", { winner: st[r.winner].name, reason: L(`PDVF.Duel.Reason.${r.reason}`) }));
  flushCard(ctx, L("PDVF.Duel.Over"));
}

/** Fin par l'état d'un duelliste (mort, inconscient) ou par l'enjeu (premier sang, premier tombé). */
async function checkEnd(ctx, hits) {
  const { st } = ctx;
  for (const s of ["a", "b"]) {
    const actor = sideActor(st[s]);
    if (!actor) continue;
    const winner = OTHER[s];
    if (hasStatus(actor, STATUS.dead) || hp(actor).value <= 0 && actor.type === "pnj") { await endDuel(ctx, winner, "killed"); return true; }
    const wounded = !!hits?.[s];
    const prone = hasStatus(actor, STATUS.prone);
    if (D.stakesMet(st.stakes, { wounded, prone })) { await endDuel(ctx, winner, st.stakes === "firstBlood" ? "firstBlood" : "firstFall"); return true; }
    if (hasStatus(actor, STATUS.unconscious)) { await endDuel(ctx, winner, "unconscious"); return true; }
  }
  return false;
}

/** Coup porté (dégâts de l'arme, bouclier ou non). */
async function strike(ctx, fromSide, toSide, { extraDice = 0, shield = false, brawl = false, source = "" }) {
  const { st } = ctx;
  const attacker = sideActor(st[fromSide]);
  const target = sideActor(st[toSide]);
  const opt = weaponFor(attacker, st[fromSide], brawl);
  const tOpt = weaponFor(target, st[toSide], brawl);
  const formula = addDice(opt.formula || "1D6", extraDice);
  const roll = await rollFormula(formula);
  ctx.rolls.push(roll);
  const stats = combatStats(target);
  const prot = shield ? Math.max(Number(stats.shield) || 0, Number(tOpt?.parry) || 0) : 0;
  const undo = snapshot(target);
  const out = await receiveDamage(target, { base: roll.total, shield: prot, shieldIsShield: prot === Number(stats.shield), half: st.stakes === "blunted",
    source: source || attacker.name }, undo);
  ctx.rolls.push(...out.rolls);
  ctx.lines.push(F("PDVF.Duel.Line.Strike", { name: attacker.name, weapon: opt.name, formula, total: roll.total }));
  ctx.lines.push(...out.lines);
  ctx.undo.push(out.undo);
  // Rancune : blessé, le duelliste peut garder rancune à son adversaire.
  if (out.real > 0 && !st[toSide].grudge && !hasStatus(target, STATUS.unconscious) && !hasStatus(target, STATUS.dead)) {
    const acts = await traitProcedureTest(target, "trait.forgiving.right", ctx);
    if (acts === "trait.forgiving.right") {
      st[toSide].grudge = true;
      ctx.lines.push(F("PDVF.Duel.Line.Grudge", { name: target.name, bonus: signed(C().grudgeBonus) }));
    }
  }
  return out;
}

/** Résolution d'une passe une fois les deux intentions posées. */
async function resolvePasse(ctx) {
  const { st } = ctx;
  const cfg = C();
  ctx.undo = [];
  const ia = st.a.choice, ib = st.b.choice;
  const brawl = ia === "close" && ib === "close";
  const cyc = D.cycleModifiers(ia, ib, cfg.cyclePenalty);
  const res = {};
  for (const s of ["a", "b"]) {
    const actor = sideActor(st[s]);
    const opt = weaponFor(actor, st[s], brawl);
    const key = `skill.${opt.skill}`;
    const parts = [];
    const add = (label, v) => { if (v) parts.push({ label, value: v }); };
    add(L("PDVF.Duel.Mod.cycle"), cyc[s]);
    add(L("PDVF.Duel.Mod.breath"), st[s].breath);
    add(L("PDVF.Duel.Mod.fear"), st[s].fear);
    if (st[s].grudge) add(L("PDVF.Duel.Mod.grudge"), cfg.grudgeBonus);
    if (actor.type === "chevalier") {
      add(L("PDVF.Duel.Mod.inspiration"), actor.inspirationBonus(key));
      add(L("PDVF.Duel.Mod.condition"), actor.conditionModifier?.(key)?.value ?? 0);
    }
    const mod = parts.reduce((t, p) => t + p.value, 0);
    const value = Number(opt.skillValue) || 0;
    st[s].maxValue = Math.max(Number(st[s].maxValue) || 0, value + mod);
    const roll = await d20();
    ctx.rolls.push(roll);
    res[s] = resolveTest(value, mod, roll.total);
    ctx.lines.push(F("PDVF.Duel.Line.Roll", { name: actor.name, intent: L(`PDVF.Duel.Intent.${st[s].choice}`), weapon: opt.name, value: formatValue(value),
      mods: parts.length ? ` (${parts.map(p => `${p.label} ${signed(p.value)}`).join(", ")})` : "", die: res[s].die, outcome: L(`PDVF.Outcome.${res[s].outcome}`) }));
    if (res[s].outcome === "critical" && actor.type === "chevalier" && !actor.noSkillXp) await xp(actor, key);
  }
  const pr = D.passResult(res.a, res.b);
  // Échec critique : arme lâchée (Table 7.1)
  for (const s of pr.fumbles) {
    const actor = sideActor(st[s]);
    if (!weaponFor(actor, st[s]).unarmed) {
      await setStatus(actor, STATUS.disarmed, true);
      ctx.lines.push(F("PDVF.Duel.Line.Drops", { name: actor.name }));
    }
  }
  st.last = { a: ia, b: ib, kind: pr.kind, winner: pr.winner };
  const hits = {};
  if (pr.kind === "victory") {
    const w = pr.winner;
    ctx.lines.push(F("PDVF.Duel.Line.Winner", { name: sideName(st, w), intent: L(`PDVF.Duel.Intent.${st[w].choice}`) }));
    st.pending = { winner: w, partial: pr.loserPartial, critical: pr.critical, brawl };
    st.phase = "winner";
    flushCard(ctx, F("PDVF.Duel.PasseN", { passe: st.passe }), "", ctx.undo);
    return;
  }
  if (pr.kind === "tie") {
    ctx.lines.push(L("PDVF.Duel.Line.Tie"));
    for (const s of ["a", "b"]) {
      if (!D.strikes(st[s].choice)) continue;
      const out = await strike(ctx, s, OTHER[s], { shield: true, brawl });
      hits[OTHER[s]] = out.real > 0;
    }
  } else ctx.lines.push(L("PDVF.Duel.Line.MutualFailure"));
  flushCard(ctx, F("PDVF.Duel.PasseN", { passe: st.passe }), "", ctx.undo);
  await afterPasse(ctx, hits);
}

/** Fin de passe : soins du souffle et de l'arme reprise, fin éventuelle, passe suivante. */
async function afterPasse(ctx, hits = {}) {
  const { st } = ctx;
  for (const s of ["a", "b"]) {
    const actor = sideActor(st[s]);
    if (st[s].rest) { st[s].breath = 0; await xp(actor, "trait.energetic.right"); ctx.lines.push(F("PDVF.Duel.Line.Rested", { name: actor.name })); }
    if (st[s].rearm) { await setStatus(actor, STATUS.disarmed, false); ctx.lines.push(F("PDVF.Duel.Line.Rearmed", { name: actor.name })); }
    if (st[s].grudge && hits[OTHER[s]]) st[s].grudge = false;
  }
  if (await checkEnd(ctx, hits)) return;
  await beginPasse(ctx);
}

/* -------------------------------------------- */
/*  Actions                                      */
/* -------------------------------------------- */

const inPlay = (st) => ["mounted", "choose", "winner", "surrender"].includes(st.phase);

const ACTIONS = {
  /** Le défié accepte (son arme). */
  accept: { who: "defender", fn: async (ctx, { weapon }) => {
    const { st } = ctx;
    if (st.phase !== "challenge") return false;
    if (weapon) st.b.weapon = weapon;
    await startDuel(ctx);
    broadcastOpen(ctx.message);
  } },
  decline: { who: "defender", fn: async (ctx) => {
    const { st } = ctx;
    if (st.phase !== "challenge") return false;
    st.phase = "over";
    st.result = { winner: "a", reason: "declined", glory: 0 };
    ctx.log(F("PDVF.Duel.Log.Declined", { name: st.b.name }));
  } },
  /** Arme d'un duelliste (avant de choisir son intention). */
  weapon: { who: "side", fn: async ({ st }, { side, ref }) => {
    if (!inPlay(st) || st[side].choice) return false;
    if (!duelWeapons(sideActor(st[side])).some(o => o.ref === ref)) return false;
    st[side].weapon = ref;
  } },
  /** Pied à terre : fin des charges, début du duel. */
  dismount: { who: "any", fn: async (ctx) => {
    const { st } = ctx;
    if (st.phase !== "mounted") return false;
    for (const s of ["a", "b"]) await setStatus(sideActor(st[s]), STATUS.mounted, false);
    ctx.lines.push(L("PDVF.Duel.Line.Dismount"));
    await beginPasse(ctx);
  } },
  /** Choix d'une intention (ou souffler, reprendre son arme : en garde). */
  choose: { who: "side", fn: async (ctx, { side, intent, mode = "" }) => {
    const { st } = ctx;
    const me = st[side];
    const other = st[OTHER[side]];
    if (st.phase !== "choose" || me.choice) return false;
    if (st.first && st.first !== side && !other.choice) { ui.notifications.warn(L("PDVF.Duel.Notify.WaitFirst")); return false; }
    const actor = sideActor(me);
    if (mode === "rest" || mode === "rearm") intent = "defend";
    if (mode === "rearm" && !hasStatus(actor, STATUS.disarmed)) return false;
    if (!D.INTENTS.includes(intent)) return false;
    if (me.forced && intent !== me.forced) { ui.notifications.warn(F("PDVF.Duel.Notify.Forced", { intent: L(`PDVF.Duel.Intent.${me.forced}`) })); return false; }
    if (me.grudge && intent === "defend") { ui.notifications.warn(L("PDVF.Duel.Notify.Grudge")); return false; }
    if (me.blocked.includes(intent)) return false;
    // Un trait célèbre contraint le choix (sauf pour souffler ou reprendre son arme)
    const conflict = mode ? null : D.famousConflict(intent, (k) => traitValue(actor, k), C().famousAt);
    if (conflict && !me.tested.includes(intent)) {
      me.tested.push(intent);
      const res = await simpleTrait(actor, conflict, ctx);
      if (res.success) {
        me.blocked.push(intent);
        ctx.lines.push(F("PDVF.Duel.Line.Famous", { name: actor.name, trait: traitLabel(conflict), intent: L(`PDVF.Duel.Intent.${intent}`) }));
        flushCard(ctx, L("PDVF.Duel.FamousTrait"));
        return;
      }
    }
    me.choice = intent;
    me.rest = mode === "rest";
    me.rearm = mode === "rearm";
    if (!mode) await xp(actor, D.INTENT_TRAIT[intent]);
    if (st.first === side) me.revealed = other.see.includes(intent);
    if (conflict) flushCard(ctx, L("PDVF.Duel.FamousTrait"));
    if (st.a.choice && st.b.choice) await resolvePasse(ctx);
  } },
  /** Le vainqueur applique l'effet de son intention, ou fait un geste à la place. */
  effect: { who: "side", fn: async (ctx, { side, close = "strike", gesture = "", trait = "" }) => {
    const { st } = ctx;
    const p = st.pending;
    if (st.phase !== "winner" || !p || p.winner !== side) return false;
    const loserSide = OTHER[side];
    const intent = st[side].choice;
    const loser = sideActor(st[loserSide]);
    ctx.undo = [];
    const hits = {};
    if (gesture === "provoke") {
      if (!D.PROVOKABLE.includes(trait)) return false;
      ctx.lines.push(F("PDVF.Duel.Line.Provoke", { name: sideName(st, side), target: loser.name, trait: traitLabel(trait) }));
      const acts = await traitProcedureTest(loser, trait, ctx);
      if (acts === "trait.valorous.right" && atHalf(loser)) {
        ctx.lines.push(F("PDVF.Duel.Line.Mercy", { name: loser.name }));
        flushCard(ctx, F("PDVF.Duel.PasseN", { passe: st.passe }));
        st.pending = null;
        return endDuel(ctx, side, "surrender");
      }
      if (acts) {
        st[loserSide].forcedNext = D.PROVOKE[acts];
        ctx.lines.push(F("PDVF.Duel.Line.Provoked", { name: loser.name, trait: traitLabel(acts), intent: L(`PDVF.Duel.Intent.${D.PROVOKE[acts]}`) }));
      } else ctx.lines.push(F("PDVF.Duel.Line.NotProvoked", { name: loser.name }));
    } else if (intent === "bind") {
      st.bindNext = side;
      ctx.lines.push(F("PDVF.Duel.Line.Bind", { name: sideName(st, side), target: loser.name }));
    } else if (intent === "defend") {
      ctx.lines.push(F("PDVF.Duel.Line.Defend", { name: sideName(st, side) }));
    } else if (intent === "close" && close === "disarm") {
      await setStatus(loser, STATUS.disarmed, true);
      ctx.lines.push(F("PDVF.Duel.Line.Disarm", { name: sideName(st, side), target: loser.name }));
    } else if (intent === "close" && close === "knockdown") {
      await setStatus(loser, STATUS.mounted, false);
      await setStatus(loser, STATUS.prone, true);
      ctx.lines.push(F("PDVF.Duel.Line.Knockdown", { name: sideName(st, side), target: loser.name }));
    } else {
      const s = D.strikeOf(intent, st[loserSide].choice, { partial: p.partial, critical: p.critical, closeOption: "strike" });
      if (s) {
        const out = await strike(ctx, side, loserSide, { extraDice: s.extraDice, shield: s.shield, brawl: p.brawl });
        hits[loserSide] = out.real > 0;
      }
    }
    st.pending = null;
    flushCard(ctx, F("PDVF.Duel.PasseN", { passe: st.passe }), "", ctx.undo);
    await afterPasse(ctx, hits);
  } },
  /** Fausse merci (une fois par duel) : l'adversaire Méfiant la déjoue ; sinon coup en traître. */
  falseMercy: { who: "side", fn: async (ctx, { side }) => {
    const { st } = ctx;
    const me = st[side];
    if (st.phase !== "choose" || me.choice || me.falseMercy) return false;
    me.falseMercy = true;
    const actor = sideActor(me);
    const other = sideActor(st[OTHER[side]]);
    ctx.undo = [];
    ctx.lines.push(F("PDVF.Duel.Line.FalseMercy", { name: actor.name }));
    await xp(actor, "trait.honest.right");
    if (actor.type === "chevalier") await actor.adjustPassion("honor", -C().dishonor);
    const acts = await traitProcedureTest(other, "trait.trusting.right", ctx);
    if (acts === "trait.trusting.right") ctx.lines.push(F("PDVF.Duel.Line.SeenThrough", { name: other.name }));
    else {
      ctx.lines.push(F("PDVF.Duel.Line.Fooled", { name: other.name }));
      const out = await strike(ctx, side, OTHER[side], { shield: false });
      flushCard(ctx, L("PDVF.Duel.FalseMercy"), "", ctx.undo);
      if (await checkEnd(ctx, { [OTHER[side]]: out.real > 0 })) return;
      return;
    }
    flushCard(ctx, L("PDVF.Duel.FalseMercy"));
  } },
  /** Un duelliste se rend : sans déshonneur à la moitié de ses PV ou moins. */
  surrender: { who: "side", fn: async (ctx, { side }) => {
    const { st } = ctx;
    if (!["choose", "winner", "mounted"].includes(st.phase)) return false;
    const actor = sideActor(st[side]);
    const honorable = atHalf(actor);
    if (!honorable) await xp(actor, "trait.valorous.right");
    st.surrender = { side, honorable, phase: st.phase };
    st.phase = "surrender";
    ctx.lines.push(F(honorable ? "PDVF.Duel.Line.Surrenders" : "PDVF.Duel.Line.SurrendersEarly", { name: actor.name }));
    flushCard(ctx, L("PDVF.Duel.Surrender"));
  } },
  /** Réponse à la reddition : l'accepter (Miséricordieux) ou la refuser (Cruel). */
  answer: { who: "side", fn: async (ctx, { side, accept }) => {
    const { st } = ctx;
    const sr = st.surrender;
    if (st.phase !== "surrender" || !sr || OTHER[sr.side] !== side) return false;
    const actor = sideActor(st[side]);
    st.surrender = null;
    if (accept) {
      await xp(actor, "trait.merciful.left");
      st.result = { winner: side, reason: "surrender", glory: 0, captive: true, spared: true };
      ctx.lines.push(F("PDVF.Duel.Line.Accepts", { name: actor.name }));
      return conclude(ctx);
    }
    await xp(actor, "trait.merciful.right");
    ctx.lines.push(F("PDVF.Duel.Line.Refuses", { name: actor.name }));
    st.phase = sr.phase === "winner" ? "winner" : sr.phase;
    flushCard(ctx, L("PDVF.Duel.Surrender"));
  } },
  /** Dénouement : épargner (captif) ou achever le vaincu. */
  fate: { who: "side", fn: async (ctx, { side, spare }) => {
    const { st } = ctx;
    if (st.phase !== "aftermath" || st.result?.winner !== side) return false;
    const actor = sideActor(st[side]);
    const loser = sideActor(st[OTHER[side]]);
    if (spare) {
      await xp(actor, "trait.merciful.left");
      st.result.captive = true;
      st.result.spared = true;
      ctx.lines.push(F("PDVF.Duel.Line.Spares", { name: actor.name, loser: loser.name }));
    } else {
      await xp(actor, "trait.merciful.right");
      if (st.result.reason === "surrender" && actor.type === "chevalier") {
        await actor.adjustPassion("honor", -C().dishonor);
        ctx.lines.push(F("PDVF.Duel.Line.Dishonor", { name: actor.name, n: C().dishonor }));
      }
      await loser.update({ "system.health.hp.value": Math.min(0, hp(loser).value) });
      await setStatus(loser, STATUS.unconscious, false);
      await setStatus(loser, STATUS.dead, true);
      st.result.spared = false;
      st.result.reason = "killed";
      ctx.lines.push(F("PDVF.Duel.Line.Finishes", { name: actor.name, loser: loser.name }));
    }
    await conclude(ctx);
  } },
  /** Le MJ arrête le duel (rupture du défi, abandon). */
  stop: { who: "gm", fn: async (ctx, { reason = "abandoned" }) => {
    const { st } = ctx;
    if (st.phase === "over") return false;
    st.phase = "over";
    st.result = { winner: "a", reason: reason === "broken" ? "broken" : "abandoned", glory: 0 };
    ctx.lines.push(L(`PDVF.Duel.Reason.${st.result.reason}`));
    ctx.log(L(`PDVF.Duel.Reason.${st.result.reason}`));
    flushCard(ctx, L("PDVF.Duel.Over"));
  } }
};

/* -------------------------------------------- */
/*  Rupture du défi                              */
/* -------------------------------------------- */

/**
 * Un tiers engage l'un des duellistes (échange ordinaire) : le défi est rompu, le combat
 * redevient un combat ordinaire. Appelé par l'échange, côté MJ ou par le socket.
 */
export async function breakFor(attackerUuid, targetUuid) {
  for (const m of activeDuels()) {
    const st = duelOf(m);
    const ids = ["a", "b"].map(s => sideActor(st[s])?.uuid).filter(Boolean);
    const involved = ids.includes(attackerUuid) || ids.includes(targetUuid);
    const between = ids.includes(attackerUuid) && ids.includes(targetUuid);
    if (involved && !between && st.phase !== "challenge") await perform(m, "stop", { reason: "broken" }, game.users.activeGM?.id ?? game.user.id);
  }
}

/** Demande de rupture envoyée au MJ (un joueur engage un duelliste). */
export function requestBreak(attackerUuid, targetUuid) {
  if (!activeDuels().length) return;
  if (game.user.isGM) return breakFor(attackerUuid, targetUuid);
  game.socket.emit(SOCKET, { type: "duelBreak", attacker: attackerUuid, target: targetUuid });
}
