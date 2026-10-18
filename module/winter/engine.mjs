/**
 * Phase d'hiver (Livre du joueur, chap. 14) : les étapes, appliquées à un chevalier.
 * L'état de l'hiver est gardé sur le chevalier (drapeau « winter ») : chaque jet n'est lancé
 * qu'une fois, et l'assistant peut être fermé puis repris.
 */
import { PDVF, SYSTEM_ID } from "../config.mjs";
import * as W from "../rules/winter.mjs";
import { compareOpposed, traitPair } from "../rules/resolution.mjs";
import { rollPlain } from "../dice/tests.mjs";
import { normalizeLabel } from "../rules/followers.mjs";
import { resolveFollowers, resolveHorses, knightHorseGlory } from "../documents/followers.mjs";
import { winterEvent, PASSION_MATCH, WINTER_EVENTS } from "./events.mjs";

const L = (k) => game.i18n.localize(k);
const F = (k, d) => game.i18n.format(k, d);
const C = () => PDVF.winter;

export const FLAG = "winter";
export const STEPS = ["solo", "event", "xp", "economy", "aging", "squire", "horses", "training", "glory", "prestige", "family", "end"];
export const SOCKET = `system.${SYSTEM_ID}`;
const CARD = `systems/${SYSTEM_ID}/templates/chat/battle-card.hbs`;
const D = 240; // deniers par livre

/** Année de l'hiver en cours (0 : pas d'hiver ouvert). */
export function winterYear() {
  try { return Number(game.settings.get(SYSTEM_ID, "winterYear")) || 0; } catch (e) { return 0; }
}

export function freshState(year) {
  return {
    year, step: 0, finished: false, glory: [],
    event: null, xp: null, economy: null, aging: null, followers: null, horses: null,
    training: { bonus: 0, skip: false, done: false, summary: "" },
    gloryDone: false, prestige: { uses: [], guarantee: "" },
    conception: { sure: false, mod: 0 }, family: null
  };
}

/** État de l'hiver du chevalier pour l'année donnée. */
export function getState(actor, year = winterYear()) {
  const s = actor.getFlag?.(SYSTEM_ID, FLAG);
  return s && s.year === year ? foundry.utils.deepClone(s) : freshState(year);
}

export async function saveState(actor, state) {
  return actor.setFlag(SYSTEM_ID, FLAG, state);
}

/* -------------------------------------------- */
/*  Outils                                       */
/* -------------------------------------------- */

async function dice(formula, flavor, actor) {
  const roll = await new Roll(String(formula).replace(/D/g, "d")).evaluate();
  if (flavor) await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor });
  return roll.total;
}

/** Carte de chat récapitulative. */
export async function postLines(actor, title, lines, subtitle = "") {
  const content = await foundry.applications.handlebars.renderTemplate(CARD, { title, subtitle, lines, buttons: [] });
  return ChatMessage.implementation.create({ speaker: ChatMessage.getSpeaker({ actor }), content, flags: { [SYSTEM_ID]: { kind: "winter" } } });
}

async function test(actor, key, { modifier = 0, title, subtitle = "" } = {}) {
  const r = actor.getRollable(key);
  if (!r) return null;
  const res = await rollPlain({ actor, name: actor.name, label: r.label, value: r.value, modifier, title: title ?? r.label, subtitle });
  return { ...res, rollable: r };
}

/** Index des passions dont le nom commence par l'un des motifs. */
export function passionIndexes(actor, match) {
  const prefixes = PASSION_MATCH[match] ?? [match];
  return (actor.system.passions ?? []).map((p, i) => ({ p, i }))
    .filter(({ p }) => prefixes.some(x => normalizeLabel(p.name).startsWith(normalizeLabel(x)))).map(({ i }) => i);
}

/** Clé testable : « passion:homage » devient « passion.3 » (la plus haute). */
export function resolveKey(actor, key) {
  if (!key?.startsWith("passion:")) return actor.getRollable(key) ? key : null;
  const idx = passionIndexes(actor, key.slice(8).replace("*", ""));
  if (!idx.length) return null;
  const best = idx.reduce((a, b) => (actor.system.passions[b].value > actor.system.passions[a].value ? b : a));
  return `passion.${best}`;
}

function opposite(key) {
  const [kind, id, side] = key.split(".");
  return kind === "trait" ? `trait.${id}.${side === "left" ? "right" : "left"}` : null;
}

/** Valeur stockée après un point de plus pour un Attribut (les traits gardent une somme de 20). */
function bumpUpdate(actor, key, delta) {
  const s = actor._source.system;
  const [kind, id, side] = key.split(".");
  switch (kind) {
    case "char": return { [`system.characteristics.${id}.value`]: s.characteristics[id].value + delta };
    case "skill": return { [`system.skills.${id}.value`]: Math.max(0, s.skills[id].value + delta) };
    case "trait": return { [`system.traits.${id}.value`]: s.traits[id].value + (side === "left" ? delta : -delta) };
    case "honor": return { "system.honor.value": Math.max(0, s.honor.value + delta) };
    case "extra": {
      const rows = foundry.utils.deepClone(s.extraSkills);
      rows[Number(id)].value = Math.max(0, rows[Number(id)].value + delta);
      return { "system.extraSkills": rows };
    }
    case "passion": {
      const rows = foundry.utils.deepClone(s.passions);
      rows[Number(id)].value = Math.max(0, rows[Number(id)].value + delta);
      return { "system.passions": rows };
    }
  }
  return {};
}

async function bump(actor, key, delta) {
  const u = bumpUpdate(actor, key, delta);
  if (Object.keys(u).length) await actor.update(u);
}

async function addPounds(actor, pounds) {
  const t = Number(actor.system.economy?.treasury) || 0;
  return actor.update({ "system.economy.treasury": t + Math.round(pounds * D) });
}

/** Coche les cases d'expérience (« passion:hate* » : toutes les Haines). */
async function checkKeys(actor, keys) {
  const done = [];
  for (const k of keys) {
    if (k.startsWith("passion:")) {
      const all = k.endsWith("*");
      const idx = passionIndexes(actor, k.slice(8).replace("*", ""));
      for (const i of all ? idx : idx.slice(0, 1)) { await actor.markExperience(`passion.${i}`); done.push(actor.system.passions[i].name); }
    } else {
      await actor.markExperience(k);
      done.push(actor.getRollable(k)?.label ?? k);
    }
  }
  return done;
}

/** Met à jour un suivant ou un cheval : directement si on en est propriétaire, sinon par le MJ. */
export async function updateLinked(knight, doc, changes) {
  if (doc.isOwner) return doc.update(changes);
  if (!game.users.activeGM) return ui.notifications.warn(L("PDVF.Winter.Notify.NoGM"));
  game.socket.emit(SOCKET, { type: "winterUpdate", knight: knight.uuid, uuid: doc.uuid, changes, user: game.user.id });
}

/** Côté MJ : mise à jour demandée par un joueur, pour un suivant ou un cheval de son chevalier. */
export async function onWinterUpdate(data) {
  if (!game.users.activeGM?.isSelf) return;
  const user = game.users.get(data.user);
  const knight = fromUuidSync(data.knight);
  if (!user || !knight?.testUserPermission(user, "OWNER")) return;
  const linked = [...(knight.system.followers ?? []), ...(knight.system.horses ?? [])].some(x => x.uuid === data.uuid);
  if (!linked) return;
  const doc = fromUuidSync(data.uuid);
  if (doc) await doc.update(data.changes);
}

/* -------------------------------------------- */
/*  Étape 2 : événement personnel                */
/* -------------------------------------------- */

/** Options de l'événement : pour le 19, seulement les passions de la fiche (Célèbres d'abord). */
export function eventOptions(actor, ev) {
  if (!ev) return [];
  if (ev.choice) return WINTER_EVENTS.filter(x => !x.choice).flatMap(x => x.options).filter(k => resolveKey(actor, k));
  let opts = ev.options.filter(k => resolveKey(actor, k));
  if (ev.famous) {
    const famous = opts.filter(k => actor.getRollable(resolveKey(actor, k))?.value >= 16);
    if (famous.length) opts = famous;
  }
  return opts;
}

export async function rollEvent(actor, state) {
  const roll = await dice("1D20", L("PDVF.Winter.EventRoll"), actor);
  state.event = { roll, key: "", outcome: "", opposite: null, active: true, applied: [], results: {} };
  const ev = winterEvent(roll);
  const opts = eventOptions(actor, ev);
  if (opts.length === 1) state.event.key = opts[0];
  return state;
}

/** Test de l'événement et règles d'expérience (p. 221). */
export async function testEvent(actor, state, key) {
  const e = state.event;
  if (!e || e.outcome) return state;
  const real = resolveKey(actor, key);
  if (!real) return state;
  e.key = key;
  // 20 : choix du joueur parmi les traits et passions de la table
  if (winterEvent(e.roll)?.choice) e.chosenRoll = WINTER_EVENTS.find(x => x.options?.includes(key))?.roll ?? null;
  const isTrait = key.startsWith("trait.");
  const t = await test(actor, real, { title: L("PDVF.Winter.Step.event") });
  e.outcome = t.outcome;
  e.value = t.rollable.value;
  const notes = [];
  if (t.outcome === "critical") {
    const d = await dice("1D20", F("PDVF.Winter.ImmediateXp", { label: t.rollable.label }), actor);
    if (W.experienceGain(t.rollable.value, d)) { await bump(actor, real, 1); notes.push(F("PDVF.Winter.XpGain", { label: t.rollable.label })); }
    await actor.markExperience(real);
  } else if (t.outcome === "success") {
    await actor.markExperience(real);
  } else if (isTrait) {
    const o = await test(actor, opposite(real), { title: L("PDVF.Winter.OppositeTest") });
    e.opposite = { key: opposite(real), outcome: o.outcome, label: o.rollable.label };
    if (["critical", "success"].includes(o.outcome)) await actor.markExperience(opposite(real));
  } else if (t.outcome === "fumble") {
    await bump(actor, real, -1);
    notes.push(F("PDVF.Winter.PassionLoss", { label: t.rollable.label }));
  }
  const outcomeData = eventOutcome(e);
  if (t.outcome === "failure" && isTrait) {
    const oppOk = ["critical", "success"].includes(e.opposite?.outcome);
    e.active = outcomeData?.ifOpposite === "fails" ? !oppOk : oppOk;
  }
  e.notes = notes;
  return state;
}

/** Résultat (texte et effets) de l'événement tiré. */
export function eventOutcome(e) {
  if (!e?.outcome || !e.key) return null;
  const ev = winterEvent(e.chosenRoll ?? e.roll);
  return ev?.outcomes?.[e.key]?.[e.outcome] ?? null;
}

/** Applique un effet de l'événement. Renvoie le texte du résultat. */
export async function applyEventEffect(actor, state, index) {
  const e = state.event;
  const out = eventOutcome(e);
  const fx = out?.effects?.[index];
  if (!fx || e.applied.includes(index) || !e.active) return state;
  e.results[index] = await applyEffect(actor, state, fx);
  e.applied.push(index);
  return state;
}

/** Valeur d'une Gloire « app », « app3 », « honor2 »… */
export function gloryValue(actor, g) {
  if (typeof g === "number") return g;
  const app = Number(actor.system.characteristics.app.value) || 0;
  return { app, app2: 2 * app, app3: 3 * app, honor2: 2 * (Number(actor.system.honor.value) || 0) }[g] ?? 0;
}

async function applyEffect(actor, state, fx) {
  if (fx.glory !== undefined) {
    const v = gloryValue(actor, fx.glory);
    state.glory.push({ label: L("PDVF.Winter.Step.event"), value: v });
    return F("PDVF.Winter.Fx.GloryDone", { value: v });
  }
  if (fx.pounds !== undefined) { await addPounds(actor, fx.pounds); return F("PDVF.Winter.Fx.PoundsDone", { value: fx.pounds > 0 ? `+${fx.pounds}` : `${fx.pounds}` }); }
  if (fx.honor !== undefined) { await actor.adjustPassion("honor", fx.honor); return F("PDVF.Winter.Fx.HonorDone", { value: fx.honor }); }
  if (fx.passion) {
    let idx = passionIndexes(actor, fx.passion.match);
    if (!idx.length && fx.passion.fallback) idx = passionIndexes(actor, fx.passion.fallback);
    if (!idx.length) return L("PDVF.Winter.Fx.NoPassion");
    for (const i of fx.passion.all ? idx : idx.slice(0, 1)) await actor.adjustPassion(`passion.${i}`, fx.passion.delta);
    return F("PDVF.Winter.Fx.PassionDone", { names: (fx.passion.all ? idx : idx.slice(0, 1)).map(i => actor.system.passions[i].name).join(", "), value: fx.passion.delta });
  }
  if (fx.check) { const n = await checkKeys(actor, fx.check); return n.length ? F("PDVF.Winter.Fx.CheckDone", { names: n.join(", ") }) : L("PDVF.Winter.Fx.NoPassion"); }
  if (fx.duel) return duel(actor, state);
  if (fx.test) {
    const t = await test(actor, fx.test.key, { modifier: fx.test.mod ?? 0, title: L("PDVF.Winter.Step.event") });
    const ok = ["critical", "success"].includes(t.outcome);
    const sub = ok ? fx.test.success : fx.test.failure;
    const texts = [];
    for (const s of sub ?? []) texts.push(await applyEffect(actor, state, s));
    return `${L(`PDVF.Outcome.${t.outcome}`)}${texts.length ? ` : ${texts.join(" ; ")}` : ""}`;
  }
  if (fx.wound) {
    const dmg = await dice(fx.wound, L("PDVF.Winter.Fx.Wound"), actor);
    await actor.update({ "system.health.hp.value": Math.max(0, actor.system.health.hp.value - dmg), "system.health.debilitated": true });
    return F("PDVF.Winter.Fx.WoundDone", { value: dmg });
  }
  if (fx.training) { state.training.bonus += fx.training; return F("PDVF.Winter.Fx.TrainingDone", { value: fx.training }); }
  if (fx.skipTraining) { state.training.skip = true; return L("PDVF.Winter.Fx.SkipDone"); }
  if (fx.conception !== undefined) {
    if (fx.conception === "sure") state.conception.sure = true; else state.conception.mod += fx.conception;
    return L("PDVF.Winter.Fx.ConceptionDone");
  }
  if (fx.pair) {
    const left = `trait.${fx.pair.trait}.left`;
    const a = await test(actor, left, { title: L("PDVF.Winter.PairTest") });
    let side = ["critical", "success"].includes(a.outcome) ? "left" : null;
    if (!side) {
      const b = await test(actor, opposite(left), { title: L("PDVF.Winter.PairTest") });
      if (["critical", "success"].includes(b.outcome)) side = "right";
    }
    if (!side) return L("PDVF.Winter.Fx.PairNone");
    const texts = [];
    for (const s of fx.pair[side] ?? []) texts.push(await applyEffect(actor, state, s));
    const label = actor.getRollable(side === "left" ? left : opposite(left)).label;
    return `${F("PDVF.Winter.Fx.PairWins", { label })}${texts.length ? ` : ${texts.join(" ; ")}` : ""}`;
  }
  if (fx.note) return L(`PDVF.Winter.Note.${fx.note}`);
  return "";
}

/** Duel contre un rival (compétence 8+2D6) : victoire = deux fois sa compétence en Gloire ; défaite = −1 Honneur. */
async function duel(actor, state) {
  const weapons = ["sword", "spear", "greatWeapon", "hafted", "brawling"];
  const best = weapons.map(id => actor.getRollable(`skill.${id}`)).filter(Boolean).reduce((a, b) => (b.value > a.value ? b : a));
  const opp = await dice(C().duelSkill, L("PDVF.Winter.DuelRival"), actor);
  const me = await rollPlain({ actor, name: actor.name, label: best.label, value: best.value, title: L("PDVF.Winter.Duel") });
  const him = await rollPlain({ actor, name: L("PDVF.Winter.Rival"), label: best.label, value: opp, title: L("PDVF.Winter.Duel") });
  const cmp = compareOpposed(me.result, him.result);
  if (cmp.winner === "a") {
    state.glory.push({ label: L("PDVF.Winter.Duel"), value: 2 * opp });
    return F("PDVF.Winter.Fx.DuelWon", { value: 2 * opp });
  }
  if (cmp.winner === "b") { await actor.adjustPassion("honor", -1); return L("PDVF.Winter.Fx.DuelLost"); }
  return L("PDVF.Winter.Fx.DuelTie");
}

/* -------------------------------------------- */
/*  Étape 3 : tests d'expérience                 */
/* -------------------------------------------- */

/** Attributs cochés. */
export function xpList(actor) {
  const s = actor.system;
  const keys = [];
  for (const id of Object.keys(PDVF.skills)) if (s.skills[id]?.xp) keys.push(`skill.${id}`);
  s.extraSkills.forEach((r, i) => { if (r.xp) keys.push(`extra.${i}`); });
  for (const id of PDVF.traits) {
    if (s.traits[id].xpLeft) keys.push(`trait.${id}.left`);
    if (s.traits[id].xpRight) keys.push(`trait.${id}.right`);
  }
  if (s.honor.xp) keys.push("honor");
  s.passions.forEach((p, i) => { if (p.xp) keys.push(`passion.${i}`); });
  return keys.map(k => ({ key: k, ...actor.getRollable(k) })).filter(r => r.label);
}

export async function rollExperience(actor, state) {
  if (state.xp?.done) return state;
  const list = xpList(actor);
  const src = actor._source.system;
  const skills = {};
  const traits = foundry.utils.deepClone(src.traits);
  const passions = foundry.utils.deepClone(src.passions);
  const extra = foundry.utils.deepClone(src.extraSkills);
  let honor = { ...src.honor };
  const rows = [];
  const rolls = [];
  for (const r of list) {
    const roll = await new Roll("1d20").evaluate();
    rolls.push(roll);
    const gain = W.experienceGain(r.value, roll.total);
    rows.push({ key: r.key, label: r.label, before: r.value, die: roll.total, gain });
    const [kind, id, side] = r.key.split(".");
    if (kind === "skill") skills[`system.skills.${id}`] = { value: src.skills[id].value + (gain ? 1 : 0), xp: false };
    if (kind === "extra") { extra[Number(id)].value += gain ? 1 : 0; extra[Number(id)].xp = false; }
    if (kind === "trait") { if (gain) traits[id].value += side === "left" ? 1 : -1; traits[id][side === "left" ? "xpLeft" : "xpRight"] = false; }
    if (kind === "passion") { passions[Number(id)].value += gain ? 1 : 0; passions[Number(id)].xp = false; }
    if (kind === "honor") honor = { value: honor.value + (gain ? 1 : 0), xp: false };
  }
  await actor.update({ ...skills, "system.traits": traits, "system.passions": passions, "system.extraSkills": extra, "system.honor": honor });
  const lines = rows.map(r => F(r.gain ? "PDVF.Winter.XpLineGain" : "PDVF.Winter.XpLine", { label: r.label, value: r.before, die: r.die }));
  const content = await foundry.applications.handlebars.renderTemplate(CARD, { title: L("PDVF.Winter.Step.xp"), lines: lines.length ? lines : [L("PDVF.Winter.NoXp")], buttons: [] });
  await ChatMessage.implementation.create({ speaker: ChatMessage.getSpeaker({ actor }), content, rolls, flags: { [SYSTEM_ID]: { kind: "winter" } } });
  state.xp = { done: true, rows };
  return state;
}

/* -------------------------------------------- */
/*  Étape 4 : situation économique               */
/* -------------------------------------------- */

export function economyInfo(actor) {
  const s = actor.system;
  const household = ["household", "squire"].includes(s.biography.knightClass);
  const squire = resolveFollowers(actor).some(f => f.actor?.type === "pnj" && f.actor.system.category === "squire");
  const married = !!s.family.spouse?.name && s.family.spouse.alive;
  const family = married || (s.family.children ?? []).some(c => c.alive);
  const column = W.upkeepColumn({ squire, family });
  const base = household ? (married ? C().householdUpkeep.married : C().householdUpkeep.single) : 0;
  return { household, squire, family, married, column, base, ordinary: W.upkeepFor("ordinary", column, C()) };
}

/** Entretien de l'année : revenus encaissés, dépense, niveau de vie, Gloire passive et somptuaire. */
export async function payUpkeep(actor, state, { spend = 0, income = 0 }) {
  if (state.economy?.done) return state;
  const info = economyInfo(actor);
  const own = Math.max(0, Number(spend) || 0);
  const total = info.base + own;
  const level = W.livingFromUpkeep(total, info.column, C());
  const s = actor.system;
  const destitute = level === "destitute" ? (Number(s.economy.destituteYears) || 0) + 1 : 0;
  await actor.update({
    "system.economy.treasury": (Number(s.economy.treasury) || 0) + Math.round(((Number(income) || 0) - own) * D),
    "system.economy.living": level,
    "system.economy.destituteYears": destitute,
    "system.glory.passiveLiving": C().livingPassive[level] ?? 0
  });
  const sumptuary = W.sumptuaryGlory(total, C());
  if (sumptuary) state.glory.push({ label: L("PDVF.Winter.Sumptuary"), value: sumptuary });
  state.economy = { done: true, spend: own, income: Number(income) || 0, total, level, column: info.column, sumptuary, effects: {} };
  await postLines(actor, L("PDVF.Winter.Step.economy"), [
    F("PDVF.Winter.UpkeepLine", { total: String(total).replace(".", ","), level: L(`PDVF.Living.${level}`) }),
    ...(sumptuary ? [F("PDVF.Winter.SumptuaryLine", { value: sumptuary })] : [])
  ]);
  return state;
}

/** Effets de la pauvreté : test de CON, chevaux, perte d'Honneur. */
export async function povertyEffect(actor, state, kind) {
  const e = state.economy;
  if (!e || e.effects[kind]) return state;
  if (kind === "con") {
    const t = await test(actor, "char.con", { title: L("PDVF.Winter.PovertyCon") });
    if (!["critical", "success"].includes(t.outcome)) await bump(actor, "char.con", -1);
    e.effects.con = t.outcome;
  }
  if (kind === "honor") { await actor.adjustPassion("honor", -2); e.effects.honor = true; }
  if (kind === "horses") {
    const cfg = C().poorHorse;
    for (const h of resolveHorses(actor).map(x => x.actor).filter(a => a?.type === "cheval")) {
      await updateLinked(actor, h, {
        "system.move": Math.max(0, h.system.move + cfg.move),
        "system.characteristics.con.value": Math.max(0, h.system.characteristics.con.value + cfg.con),
        "system.charge": W.shiftDice(h.system.charge, cfg.chargeDice)
      });
    }
    e.effects.horses = true;
  }
  return state;
}

/* -------------------------------------------- */
/*  Étape 5 : vieillissement                     */
/* -------------------------------------------- */

export function nextAge(actor, year) {
  const b = actor.system.biography.born;
  return b ? year + 1 - b : null;
}

export async function rollAging(actor, state) {
  if (state.aging?.done) return state;
  const age = nextAge(actor, state.year);
  if (age === null || age < C().agingFrom) { state.aging = { done: true, age, skipped: true }; return state; }
  const r2 = await dice("2D6", L("PDVF.Winter.AgingRoll"), actor);
  const count = W.agingCount(r2, C());
  const hits = [];
  for (let i = 0; i < count; i++) hits.push(C().agingChars[(await dice("1D6", L("PDVF.Winter.AgingChar"), actor)) - 1]);
  const chars = Object.fromEntries(PDVF.characteristics.map(k => [k, actor.system.characteristics[k].value]));
  const res = W.applyAging(chars, hits, C());
  const update = Object.fromEntries(Object.entries(res.chars).map(([k, v]) => [`system.characteristics.${k}.value`, Math.max(0, v)]));
  let dead = res.dead;
  let decrepitDie = null;
  if (res.decrepit && !dead) {
    decrepitDie = await dice("1D6", L("PDVF.Winter.DecrepitudeRoll"), actor);
    dead = W.decrepitudeDeath(decrepitDie, res.chars.con);
  }
  if (dead) update["system.dates.died"] = state.year;
  await actor.update(update);
  state.aging = { done: true, age, r2, count, hits, losses: res.losses, infirm: res.infirm, decrepit: res.decrepit, decrepitDie, dead };
  const lost = Object.entries(res.losses).map(([k, n]) => `${L(`PDVF.Char.${k}.abbr`)} −${n}`).join(", ");
  await postLines(actor, L("PDVF.Winter.Step.aging"), [
    F("PDVF.Winter.AgingLine", { age, count }),
    ...(lost ? [lost] : []),
    ...(res.infirm ? [L("PDVF.Winter.Infirm")] : []), ...(res.decrepit ? [L("PDVF.Winter.Decrepit")] : []),
    ...(dead ? [L("PDVF.Winter.Death")] : [])
  ]);
  return state;
}

/* -------------------------------------------- */
/*  Étape 6 : écuyer et suite                    */
/* -------------------------------------------- */

export function followerRows(actor, year) {
  return resolveFollowers(actor).filter(f => f.actor?.type === "pnj").map(f => {
    const a = f.actor;
    const isSquire = a.system.category === "squire";
    const born = a.system.squire?.born;
    const age = isSquire && born ? year + 1 - born : null;
    return { index: f.index, uuid: f.uuid, actor: a, name: a.name, isSquire, esquire: !!a.system.squire?.esquire, age,
      skill: isSquire ? a.system.squireView?.skill : null, comesOfAge: isSquire && !a.system.squire?.esquire && age !== null && age >= PDVF.squireMaxAge };
  });
}

export async function rollFollowers(actor, state) {
  if (state.followers?.done) return state;
  const rows = [];
  for (const f of followerRows(actor, state.year)) {
    const row = { uuid: f.uuid, name: f.name, isSquire: f.isSquire, esquire: f.esquire, age: f.age, comesOfAge: f.comesOfAge };
    if (f.isSquire) {
      const d = await dice("1D20", F("PDVF.Winter.SquireProgress", { name: f.name }), actor);
      row.die = d;
      row.delta = W.supportImprovement(f.skill, d);
      if (row.delta) await updateLinked(actor, f.actor, { "system.squire.skillBonus": (Number(f.actor.system.squire.skillBonus) || 0) + row.delta });
      if (f.esquire) {
        const d2 = await dice("1D20", F("PDVF.Winter.EsquireLeave", { name: f.name }), actor);
        row.leaves = W.esquireLeaves(d2, f.age, C());
        row.leaveDie = d2;
      }
    } else {
      const d = await dice("1D20", F("PDVF.Winter.Departure", { name: f.name }), actor);
      row.die = d;
      row.departure = W.departure(d, C());
    }
    rows.push(row);
  }
  state.followers = { done: true, rows, decisions: {} };
  return state;
}

/* -------------------------------------------- */
/*  Étape 7 : survie des chevaux                 */
/* -------------------------------------------- */

export function horseRows(actor) {
  const living = actor.system.economy?.living ?? "ordinary";
  return resolveHorses(actor).filter(h => h.actor?.type === "cheval").map(h => {
    const s = h.actor.system;
    return { uuid: h.uuid, actor: h.actor, name: h.actor.name, needs: W.needsSurvival(s, PDVF.horseTypes, C()) && s.health.hp.value > 0,
      mod: W.survivalModifier({ weakened: s.weakened, living, destituteYears: actor.system.economy?.destituteYears }) };
  });
}

export async function rollHorses(actor, state) {
  if (state.horses?.done) return state;
  const rows = [];
  for (const h of horseRows(actor)) {
    if (!h.needs) { rows.push({ uuid: h.uuid, name: h.name, needs: false }); continue; }
    const d = await dice("1D20", F("PDVF.Winter.HorseSurvival", { name: h.name }), actor);
    const total = d + h.mod;
    const row = { uuid: h.uuid, name: h.name, needs: true, die: d, mod: h.mod, total, result: W.survivalResult(total) };
    let fx = row.result === "dead" ? { dead: true } : null;
    if (row.result === "test") {
      const t = await test(actor, "skill.horsemanship", { title: F("PDVF.Winter.HorseTest", { name: h.name }) });
      row.test = t.outcome;
      fx = W.survivalTest(t.outcome);
    }
    if (fx) {
      const s = h.actor.system;
      const changes = {};
      if (fx.dead) changes["system.health.hp.value"] = 0;
      if (fx.weakened) changes["system.weakened"] = (Number(s.weakened) || 0) + fx.weakened;
      if (fx.hpDice) {
        row.hpLoss = await dice(`${fx.hpDice}D6`, F("PDVF.Winter.HorseHp", { name: h.name }), actor);
        changes["system.hpLoss"] = (Number(s.hpLoss) || 0) + row.hpLoss;
      }
      if (fx.chargeDice) changes["system.charge"] = W.shiftDice(s.charge, fx.chargeDice);
      if (Object.keys(changes).length) await updateLinked(actor, h.actor, changes);
      row.effect = fx.dead ? "dead" : fx.weakened ? (fx.chargeDice ? "weakened2" : "weakened") : "fine";
    } else row.effect = "fine";
    rows.push(row);
  }
  state.horses = { done: true, rows };
  await postLines(actor, L("PDVF.Winter.Step.horses"), rows.filter(r => r.needs).map(r => F("PDVF.Winter.HorseLine", { name: r.name, effect: L(`PDVF.Winter.HorseEffect.${r.effect}`) })));
  return state;
}

/* -------------------------------------------- */
/*  Étape 8 : formation et entraînement          */
/* -------------------------------------------- */

/** Applique l'amélioration choisie. Renvoie un message d'erreur ou null. */
export async function applyTraining(actor, state, choice, data) {
  const cfg = C();
  const s = actor._source.system;
  const age = nextAge(actor, state.year);
  const tr = state.training;
  if (tr.done) return null;
  if (tr.skip) return L("PDVF.Winter.TrainingSkipped");
  const update = {};
  let summary = "";
  if (choice === "trait") {
    const [, id, side] = String(data.key).split(".");
    const pair = traitPair(s.traits[id]?.value ?? 10);
    if (!s.traits[id] || pair[side] >= cfg.trainingTraitMax) return L("PDVF.Winter.TrainingMax");
    Object.assign(update, bumpUpdate(actor, data.key, 1));
    summary = actor.getRollable(data.key).label;
  } else if (choice === "passion") {
    const i = Number(String(data.key).split(".")[1]);
    const p = s.passions[i];
    const delta = Number(data.delta) || 1;
    if (!p) return L("PDVF.Winter.TrainingMax");
    if (delta > 0 && p.value >= cfg.trainingPassionMax) return L("PDVF.Winter.TrainingMax");
    const rows = foundry.utils.deepClone(s.passions);
    rows[i].value += delta;
    const court = rows.filter(x => x.court === p.court).reduce((a, x) => a + x.value, 0);
    if (delta > 0 && court > PDVF.passionCourtMax) {
      const j = Number(data.lower);
      if (!rows[j] || j === i || rows[j].court !== p.court) return L("PDVF.Winter.CourtFull");
      rows[j].value -= 1;
    }
    update["system.passions"] = rows;
    summary = `${p.name} ${delta > 0 ? "+1" : "−1"}`;
  } else if (choice === "char") {
    if (age !== null && age > cfg.trainingCharMaxAge) return L("PDVF.Winter.TooOld");
    if (!cfg.trainingChars.includes(data.key)) return L("PDVF.Winter.TrainingMax");
    update[`system.characteristics.${data.key}.value`] = s.characteristics[data.key].value + 1;
    summary = L(`PDVF.Char.${data.key}.long`);
  } else if (choice === "embonpoint") {
    const level = W.embonpointLevel(s.biography.distinctiveFeatures, cfg);
    if (level >= cfg.embonpoint.length) return L("PDVF.Winter.TrainingMax");
    if (age !== null && age <= cfg.embonpointFrom) return L("PDVF.Winter.TooYoung");
    const next = cfg.embonpoint[level];
    update["system.characteristics.siz.value"] = s.characteristics.siz.value + 1;
    if (next.dex) update["system.characteristics.dex.value"] = s.characteristics.dex.value + next.dex;
    if (next.con) update["system.characteristics.con.value"] = s.characteristics.con.value + next.con;
    update["system.biography.distinctiveFeatures"] = W.embonpointFeatures(s.biography.distinctiveFeatures, level + 1, cfg);
    summary = next.feature;
  } else if (choice === "skills") {
    const points = data.points ?? {};
    const spent = Object.values(points).reduce((a, v) => a + (Number(v) || 0), 0);
    if (spent !== cfg.trainingSkillPoints) return F("PDVF.Winter.SpendAll", { n: cfg.trainingSkillPoints });
    for (const [id, v] of Object.entries(points)) {
      const n = Number(v) || 0;
      if (!n) continue;
      const cur = s.skills[id]?.value;
      if (cur === undefined || n < 0 || cur >= cfg.trainingSkillCap || cur + n > cfg.trainingSkillCap) return L("PDVF.Winter.TrainingMax");
      update[`system.skills.${id}.value`] = cur + n;
    }
    summary = Object.entries(points).filter(([, v]) => Number(v)).map(([id, v]) => `${L(`PDVF.Skill.${id}`)} +${v}`).join(", ");
  } else if (choice === "skill20") {
    const id = data.key;
    const cur = s.skills[id]?.value;
    if (cur === undefined || cur < cfg.trainingSkillCap || cur >= cfg.trainingSkillMax) return L("PDVF.Winter.TrainingMax");
    update[`system.skills.${id}.value`] = cur + 1;
    summary = `${L(`PDVF.Skill.${id}`)} +1`;
  } else return L("PDVF.Winter.ChooseTraining");
  // Points en plus (Énergique, critique) : n'importe quelles compétences, 20 au plus.
  if (tr.bonus) {
    const bonus = data.bonus ?? {};
    const spent = Object.values(bonus).reduce((a, v) => a + (Number(v) || 0), 0);
    if (spent !== tr.bonus) return F("PDVF.Winter.SpendBonus", { n: tr.bonus });
    for (const [id, v] of Object.entries(bonus)) {
      const n = Number(v) || 0;
      if (!n) continue;
      const key = `system.skills.${id}.value`;
      const cur = update[key] ?? s.skills[id]?.value;
      if (cur === undefined || n < 0 || cur + n > cfg.trainingSkillMax) return L("PDVF.Winter.TrainingMax");
      update[key] = cur + n;
    }
    summary += ` · ${L("PDVF.Winter.Bonus")} ${Object.entries(bonus).filter(([, v]) => Number(v)).map(([id, v]) => `${L(`PDVF.Skill.${id}`)} +${v}`).join(", ")}`;
  }
  await actor.update(update);
  tr.done = true;
  tr.choice = choice;
  tr.summary = summary;
  await postLines(actor, L("PDVF.Winter.Step.training"), [`${L(`PDVF.Winter.Training.${choice}`)} : ${summary}`]);
  return null;
}

/* -------------------------------------------- */
/*  Étape 9 : décompte de Gloire                 */
/* -------------------------------------------- */

export function gloryRows(actor, state) {
  const s = actor.system;
  const horses = knightHorseGlory(actor).total;
  const rows = [];
  if (s.glory.session) rows.push({ label: L("PDVF.Winter.GlorySession"), value: s.glory.session });
  for (const g of state.glory) if (g.value) rows.push({ label: g.label, value: g.value });
  rows.push({ label: L("PDVF.Winter.GloryPassive"), value: s.passive.total + horses });
  return rows;
}

export async function recordGlory(actor, state) {
  if (state.gloryDone) return state;
  const rows = gloryRows(actor, state);
  const chron = foundry.utils.deepClone(actor._source.system.chronicle);
  const living = L(`PDVF.Living.${actor.system.economy?.living ?? "ordinary"}`);
  for (const r of rows) chron.push({ year: state.year, event: r.label, living, glory: r.value });
  await actor.update({ "system.chronicle": chron, "system.glory.session": 0 });
  state.gloryDone = true;
  const total = rows.reduce((a, r) => a + r.value, 0);
  await postLines(actor, L("PDVF.Winter.Step.glory"), [...rows.map(r => `${r.label} : ${r.value}`), F("PDVF.Winter.GloryTotal", { value: total })]);
  return state;
}

/* -------------------------------------------- */
/*  Étape 10 : récompenses de prestige           */
/* -------------------------------------------- */

export function prestigeAvailable(actor) {
  return Math.max(0, (actor.system.prestigeEarned ?? 0) - (actor.system.glory.prestigeUsed ?? 0));
}

export async function usePrestige(actor, state, kind, { key = "", sex = "" } = {}) {
  if (prestigeAvailable(actor) < 1) return state;
  let label = "";
  if (kind === "raise") {
    const r = actor.getRollable(key);
    if (!r || r.kind === "glory") return state;
    await bump(actor, key, 1);
    label = `${r.label} +1`;
  } else if (kind === "lower") {
    const r = actor.getRollable(key);
    if (!r || r.kind !== "passion") return state;
    await bump(actor, key, -1);
    label = `${r.label} −1`;
  } else if (kind === "child") {
    if (!["m", "f"].includes(sex)) return state;
    state.prestige.guarantee = sex;
    label = L(`PDVF.Winter.GuaranteeSex.${sex}`);
  } else return state;
  await actor.update({ "system.glory.prestigeUsed": (actor.system.glory.prestigeUsed ?? 0) + 1 });
  state.prestige.uses.push({ kind, label });
  await postLines(actor, L("PDVF.Winter.Step.prestige"), [label]);
  return state;
}

/* -------------------------------------------- */
/*  Étape 11 : famille                           */
/* -------------------------------------------- */

/** La mère (épouse, ou la dame elle-même) et ses données de conception. */
export function familyInfo(actor, state) {
  const s = actor.system;
  const sp = s.family.spouse;
  const isDame = s.biography.title === "dame";
  const married = !!sp?.name && sp.alive;
  const motherBorn = isDame ? s.biography.born : sp?.born;
  const con = isDame ? s.characteristics.con.value : (sp?.con ?? C().conceptionCon);
  const children = s.family.children ?? [];
  const childLastYear = children.some(c => c.born === state.year - 1);
  const possible = married && !sp.barren;
  const target = W.conceptionTarget({
    con, motherAge: motherBorn ? state.year - motherBorn : null, childLastYear,
    living: s.economy?.living, destituteYears: s.economy?.destituteYears, eventMod: state.conception.mod
  }, C());
  return { married, possible, target, childLastYear, firstConception: !children.length, isDame };
}

export async function rollFamily(actor, state, { conceive = true } = {}) {
  if (state.family?.done) return state;
  const info = familyInfo(actor, state);
  const s = actor._source.system;
  const children = foundry.utils.deepClone(s.family.children ?? []);
  const spouse = foundry.utils.deepClone(s.family.spouse);
  const lines = [];
  const births = [];
  let outcome = null;
  const add = (sex, extra = {}) => { const c = { name: "", sex, born: state.year, blessing: "", alive: true, died: null, notes: "", ...extra }; children.push(c); births.push(c); };

  if (info.possible && conceive) {
    if (state.prestige.guarantee) {
      outcome = "guaranteed";
      add(state.prestige.guarantee, { notes: L("PDVF.Winter.PrestigeBirth") });
    } else if (info.target <= 0) {
      outcome = "impossible";
    } else {
      const t = await rollPlain({ actor, name: info.isDame ? actor.name : spouse.name, label: L("PDVF.Winter.Conception"), value: info.target, title: L("PDVF.Winter.Conception") });
      outcome = state.conception.sure && !["critical", "success"].includes(t.outcome) ? "success" : t.outcome;
      if (outcome === "critical") {
        const d6 = await dice("1D6", L("PDVF.Winter.CriticalBirth"), actor);
        if (d6 <= 4) {
          const d20 = await dice("1D20", L("PDVF.Winter.MultipleBirth"), actor);
          const trip = d20 === 20 ? [await dice("1D6", "", actor), await dice("1D6", "", actor), await dice("1D6", "", actor)] : [];
          const m = W.multipleBirth(d20, trip);
          for (const sex of m.sexes) add(sex, { notes: m.identical ? L("PDVF.Winter.Identical") : L("PDVF.Winter.Twin") });
        } else {
          const b = await dice("1D20", L("PDVF.Winter.BlessedBirth"), actor);
          const bl = C().blessings[b - 1];
          add(d6 === 5 ? "m" : "f", { blessing: bl.char ? `${L(`PDVF.Char.${bl.char}.abbr`)} +1` : `${L(`PDVF.Skill.${bl.skill}`)} +5` });
        }
      } else if (outcome === "success") {
        add(W.sexFromDie(t.result.die));
      } else if (outcome === "fumble" && !info.childLastYear) {
        const d6 = await dice("1D6", L("PDVF.Winter.Tragedy"), actor);
        const tr = W.tragedy(d6, info.firstConception);
        if (tr.child === "alive") add(W.sexFromDie(await dice("1D6", "", actor)));
        if (tr.child === "dead") lines.push(L("PDVF.Winter.ChildLost"));
        if (tr.mother === "dead") { if (info.isDame) lines.push(L("PDVF.Winter.MotherDiesDame")); else spouse.alive = false; lines.push(L("PDVF.Winter.MotherDies")); }
        if (tr.mother === "barren" || tr.mother === "barrenMarriage") { spouse.barren = true; lines.push(L(tr.mother === "barren" ? "PDVF.Winter.MotherBarren" : "PDVF.Winter.MarriageBarren")); }
        outcome = "tragedy";
      }
    }
  }
  for (const c of births) lines.unshift(F("PDVF.Winter.BirthLine", { sex: L(`PDVF.Winter.Sex.${c.sex}`), blessing: c.blessing ? ` (${c.blessing})` : "" }));

  // Survie des enfants de 1 à 5 ans (les naissances bénies en sont dispensées)
  const living = actor.system.economy?.living ?? "ordinary";
  const survival = [];
  for (const c of children) {
    if (!c.alive || c.born === null || c.blessing || c.born === state.year) continue;
    const age = state.year - c.born;
    if (age < 1 || age > 5) continue;
    const d = await dice("1D20", F("PDVF.Winter.ChildSurvival", { name: c.name || L(`PDVF.Winter.Sex.${c.sex}`) }), actor);
    const dies = W.childDies(age, d, living, C());
    if (dies) {
      const cause = W.deathCause(await dice("1D6", L("PDVF.Winter.DeathCause"), actor));
      Object.assign(c, { alive: false, died: state.year, notes: [c.notes, L(`PDVF.Winter.Cause.${cause}`)].filter(Boolean).join(" · ") });
      lines.push(F("PDVF.Winter.ChildDied", { name: c.name || L(`PDVF.Winter.Sex.${c.sex}`), cause: L(`PDVF.Winter.Cause.${cause}`) }));
    }
    survival.push({ name: c.name, age, die: d, dies: !!dies });
  }
  await actor.update({ "system.family.children": children, "system.family.spouse": spouse });
  state.family = { done: true, outcome, births: births.length, survival, lines };
  await postLines(actor, L("PDVF.Winter.Step.family"), lines.length ? lines : [L("PDVF.Winter.NoFamilyEvent")]);
  return state;
}
