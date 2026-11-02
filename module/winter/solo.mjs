/**
 * Étape 1 de la phase d'hiver : scénarios en solo (Livre du joueur, chap. 13).
 * Activité standard (Table 13.1, présence à la cour, événements inhabituels 13.2), visites (13.5, 13.6),
 * perdu dans les bois (13.3), folie (13.4) et pèlerinage (13.7, 13.8, miracles).
 * L'état est gardé dans l'état d'hiver du chevalier (`state.solo`).
 */
import { PDVF, SYSTEM_ID } from "../config.mjs";
import * as S from "./solo-tables.mjs";
import * as W from "../rules/winter.mjs";
import { resolveTest, traitPair } from "../rules/resolution.mjs";
import { normalizeLabel } from "../rules/followers.mjs";
import { bump, addPounds, opposite } from "./engine.mjs";

const L = (k) => game.i18n.localize(k);
const F = (k, d) => game.i18n.format(k, d);
const CARD = `systems/${SYSTEM_ID}/templates/chat/battle-card.hbs`;
const OK = (o) => o === "success" || o === "critical";

export function soloState(state) {
  state.solo ??= { runs: [], checked: [] };
  state.solo.checked ??= [];
  return state.solo;
}

/* -------------------------------------------- */
/*  Outils                                       */
/* -------------------------------------------- */

/** Clé de la fiche pour un Attribut des tables (passions par motif ; null si le chevalier ne l'a pas). */
export function soloKey(actor, key) {
  if (!key) return null;
  if (key.startsWith("passion:")) {
    const prefixes = S.SOLO_PASSIONS[key.slice(8)] ?? [key.slice(8)];
    let best = null;
    (actor.system.passions ?? []).forEach((p, i) => {
      if (!prefixes.some(x => normalizeLabel(p.name).startsWith(normalizeLabel(x)))) return;
      if (best === null || p.value > actor.system.passions[best].value) best = i;
    });
    return best === null ? null : `passion.${best}`;
  }
  return actor.getRollable(key) ? key : null;
}

function labelOf(actor, key) {
  if (key?.startsWith("passion:")) return L(`PDVF.Solo.Passion.${key.slice(8)}`);
  return actor.getRollable(key)?.label ?? key;
}

async function d(formula) {
  return new Roll(String(formula).replace(/D/g, "d")).evaluate();
}

async function card(actor, title, lines, rolls = [], subtitle = "") {
  const content = await foundry.applications.handlebars.renderTemplate(CARD, { title, subtitle, lines, buttons: [] });
  return ChatMessage.implementation.create({ speaker: ChatMessage.getSpeaker({ actor }), content, rolls, flags: { [SYSTEM_ID]: { kind: "winter" } } });
}

/** Test simple, sans carte (les résultats sont regroupés sur une seule carte). */
async function quietTest(actor, key, modifier = 0) {
  const r = actor.getRollable(key);
  if (!r) return null;
  const roll = await d("1d20");
  const res = resolveTest(r.value, modifier, roll.total);
  return { key, label: r.label, value: r.value, kind: r.kind, die: roll.total, outcome: res.outcome, roll };
}

/** Coche une case (une seule croix par Attribut et par hiver pour les scénarios en solo). */
async function check(actor, solo, key, lines) {
  const real = soloKey(actor, key);
  if (!real) return false;
  await actor.markExperience(real);
  if (!solo.checked.includes(real)) solo.checked.push(real);
  lines.push(F("PDVF.Solo.Line.Checked", { label: actor.getRollable(real)?.label ?? real }));
  return true;
}

/** Table 14.4 : diminution naturelle d'une caractéristique (1D6 ; 6 : aucune). */
async function decline(actor, lines, rolls) {
  const r = await d("1d6");
  rolls.push(r);
  const id = PDVF.winter.agingChars[r.total - 1];
  if (!id) { lines.push(F("PDVF.Solo.Line.DeclineNone", { die: r.total })); return null; }
  await bump(actor, `char.${id}`, -1);
  lines.push(F("PDVF.Solo.Line.Decline", { die: r.total, char: L(`PDVF.Char.${id}.long`) }));
  return id;
}

/** Obsession Peur (Fées) et œil perdu : Vigilance −5 la première fois. */
async function fae(actor, row, lines, rolls) {
  if (row.fear) lines.push(L("PDVF.Solo.Line.FearFae"));
  if (row.eye) {
    if (actor.getFlag(SYSTEM_ID, "lostEye")) lines.push(L("PDVF.Solo.Line.EyeAgain"));
    else {
      await bump(actor, "skill.awareness", -5);
      await actor.setFlag(SYSTEM_ID, "lostEye", true);
      lines.push(L("PDVF.Solo.Line.Eye"));
    }
  }
  if (row.decline) await decline(actor, lines, rolls);
}

/* -------------------------------------------- */
/*  Activités                                    */
/* -------------------------------------------- */

function activity(type, def, extra = {}) {
  return {
    id: foundry.utils.randomID(), type, keys: S.expandKeys(def.keys ?? []), slots: def.slots ?? [], special: def.special ?? "",
    critGlory: extra.critGlory ?? true, tested: false, results: [], picks: {}, extra: {}, roll: extra.roll ?? null, label: extra.label ?? ""
  };
}

function visitActivity(kind, d6) {
  const row = S.visitRow(kind, d6);
  const slots = [];
  if (row.court) slots.push({ pick: "court", n: row.court });
  if (row.traits) slots.push({ pick: "trait", n: row.traits });
  return activity(kind, { keys: [...row.pairs.map(p => `pair:${p}`), ...row.passions], slots }, { critGlory: false, roll: d6 });
}

/** Événement inhabituel (Table 13.2) : une activité, ou une relance de la Table 13.1 (fausse alerte). */
async function unusual(rolls, depth = 0) {
  const r = await d("2d6");
  rolls.push(r);
  const row = S.unusualRow(r.total);
  if (row.id === "falseAlarm" && depth < 3) {
    const out = [];
    let x;
    do { x = await d("1d20"); rolls.push(x); } while (x.total >= 17);
    const std = S.standardRow(x.total);
    out.push(activity("falseAlarm", { keys: [] }, { roll: r.total, label: "falseAlarm" }));
    out[0].done = true;
    out.push(...(await standardActivity(std, rolls, depth + 1)));
    return out;
  }
  if (row.id === "royalCity" || row.id === "lordVisit") {
    const v = await d("1d6");
    rolls.push(v);
    const a = visitActivity(row.id, v.total);
    a.unusualRoll = r.total;
    return [a];
  }
  const a = activity(row.id, S.ACTIVITIES[row.id], { roll: r.total, critGlory: row.id !== "localTournament" });
  return [a];
}

async function standardActivity(row, rolls, depth = 0) {
  if (row.special === "unusual") return unusual(rolls, depth);
  return [activity(row.id, row)];
}

/* -------------------------------------------- */
/*  Démarrer un scénario                         */
/* -------------------------------------------- */

export async function startSolo(actor, state, kind) {
  const solo = soloState(state);
  if (!S.SOLO_KINDS.includes(kind)) return state;
  const rolls = [];
  const run = { id: foundry.utils.randomID(), kind, activities: [], lines: [], done: false, extra: {} };
  const lines = [];
  if (kind === "standard") {
    // Table 13.1 avec de vrais dés (17–20 : relances qui ignorent les résultats de 17 ou plus).
    const first = await d("1d20");
    rolls.push(first);
    const row = S.standardRow(first.total);
    const rows = [];
    if (row.rerolls) {
      while (rows.length < row.rerolls) {
        const x = await d("1d20");
        rolls.push(x);
        if (x.total >= 17) continue;
        rows.push(S.standardRow(x.total));
      }
    } else rows.push(row);
    run.dice = rolls.map(r => r.total);
    for (const r of rows) run.activities.push(...(await standardActivity(r, rolls)));
    const court = activity("court", S.COURT_PRESENCE);
    run.activities.push(court);
    lines.push(F("PDVF.Solo.Line.Standard", { dice: run.dice.join(", ") }));
    for (const a of run.activities) lines.push(activityTitle(a));
  } else if (kind === "royalCity" || kind === "lordVisit") {
    const v = await d("1d6");
    rolls.push(v);
    run.activities.push(visitActivity(kind, v.total));
    lines.push(activityTitle(run.activities[0]));
  } else if (kind === "lost") {
    run.extra = { seasons: [], carry: 0 };
  } else if (kind === "madness") {
    await madness(actor, state, run, lines, rolls);
  } else if (kind === "pilgrimage") {
    run.extra = { site: "", paid: null, devotion: "", miracles: 0, chosen: [] };
  }
  solo.runs.push(run);
  if (lines.length) await card(actor, L(`PDVF.Solo.Kind.${kind}`), lines, rolls, L("PDVF.Winter.Step.solo"));
  return state;
}

export function activityTitle(a) {
  const base = L(`PDVF.Solo.Activity.${a.type}`);
  return a.roll ? `${base} (${a.roll})` : base;
}

export async function removeRun(actor, state, runId) {
  const solo = soloState(state);
  const run = solo.runs.find(r => r.id === runId);
  if (!run || run.activities.some(a => a.tested) || run.extra?.seasons?.length || run.extra?.paid !== null && run.extra?.paid !== undefined) return state;
  solo.runs = solo.runs.filter(r => r.id !== runId);
  return state;
}

/* -------------------------------------------- */
/*  Choix et tests d'une activité                */
/* -------------------------------------------- */

/** Options d'un choix. */
export function slotOptions(actor, slot) {
  const s = actor.system;
  const has = (k) => !!actor.getRollable(k);
  let keys = [];
  switch (slot.pick) {
    case "court": keys = PDVF.tournament.courtSkills.map(id => `skill.${id}`); break;
    case "weapon": keys = ["sword", "spear", "hafted", "greatWeapon", "brawling", "bow", "crossbow", "thrown"].map(id => `skill.${id}`); break;
    case "trait": keys = PDVF.traits.flatMap(id => [`trait.${id}.left`, `trait.${id}.right`]); break;
    case "virtue": keys = (PDVF.religions[s.biography.religion]?.virtues ?? PDVF.religions.christian.virtues).map(v => `trait.${v}`); break;
    case "list": keys = slot.options ?? []; break;
  }
  if (slot.oneOf) keys = slot.oneOf;
  return keys.map(k => ({ key: k, real: soloKey(actor, k) }))
    .filter(o => o.real && has(o.real) && !(slot.exclude ?? []).includes(o.key))
    .filter(o => slot.min === undefined || (actor.getRollable(o.real)?.value ?? 0) >= slot.min)
    .map(o => ({ key: o.key, real: o.real, label: actor.getRollable(o.real).label, value: actor.getRollable(o.real).value }));
}

/** Nombre de choix d'un emplacement. */
export function slotCount(slot) {
  return slot.oneOf ? 1 : slot.n ?? 1;
}

/**
 * Teste une activité : Attributs fixes et choisis. Une seule croix par Attribut et par hiver :
 * ce qui est déjà coché par un scénario en solo n'est pas retesté.
 * @param {object} picks  { indexDuChoix: [clés] }
 */
export async function testActivity(actor, state, runId, actId, picks = {}) {
  const solo = soloState(state);
  const run = solo.runs.find(r => r.id === runId);
  const act = run?.activities.find(a => a.id === actId);
  if (!act || act.tested) return null;
  if (act.special === "illness") return illness(actor, state, run, act);
  // Choix complets ?
  const chosen = [];
  for (const [i, slot] of act.slots.entries()) {
    const want = Math.min(slotCount(slot), slotOptions(actor, slot).length);
    const got = [...new Set((picks[i] ?? []).filter(Boolean))];
    if (got.length < want) return F("PDVF.Solo.ChooseMore", { n: want });
    chosen.push(...got.slice(0, want));
  }
  act.picks = picks;
  const keys = [...new Set([...act.keys, ...chosen])];
  const rolls = [];
  const lines = [];
  const results = [];
  let glory = 0;
  for (const k of keys) {
    const real = soloKey(actor, k);
    if (!real) { lines.push(F("PDVF.Solo.Line.Missing", { label: labelOf(actor, k) })); continue; }
    if (solo.checked.includes(real)) { lines.push(F("PDVF.Solo.Line.Already", { label: actor.getRollable(real).label })); results.push({ key: k, real, label: actor.getRollable(real).label, outcome: "already" }); continue; }
    const t = await quietTest(actor, real);
    if (!t) continue;
    rolls.push(t.roll);
    const kind = t.kind === "passion" ? "passion" : t.kind === "trait" ? "trait" : "skill";
    const fx = S.soloTestEffect(kind, t.outcome, { critGlory: act.critGlory });
    const parts = [];
    if (fx.check) { await actor.markExperience(real); solo.checked.push(real); parts.push(L("PDVF.Solo.Checked")); }
    if (fx.glory) { glory += fx.glory; parts.push(`+${fx.glory} ${L("PDVF.Glory")}`); }
    if (fx.opposite) { const o = opposite(real); await actor.markExperience(o); parts.push(F("PDVF.Solo.OppositeChecked", { label: actor.getRollable(o).label })); }
    if (fx.passionLoss) {
      if (real === "honor") await actor.adjustPassion("honor", -1); else await bump(actor, real, -1);
      parts.push("−1");
    }
    results.push({ key: k, real, label: t.label, value: t.value, die: t.die, outcome: t.outcome, note: parts.join(" · ") });
    lines.push(F("PDVF.Solo.Line.Test", { label: t.label, value: t.value, die: t.die, outcome: L(`PDVF.Outcome.${t.outcome}`) }) + (parts.length ? ` — ${parts.join(" · ")}` : ""));
  }
  act.results = results;
  act.tested = true;
  if (glory) state.glory.push({ label: F("PDVF.Solo.GloryLabel", { activity: activityTitle(act) }), value: glory });
  if (act.special === "tournament") {
    const g = S.localTournamentGlory(results);
    act.extra.glory = g;
    act.extra.won = S.wonLocalTournament(results);
    state.glory.push({ label: L("PDVF.Solo.Activity.localTournament"), value: g });
    lines.push(F("PDVF.Solo.Line.TournamentGlory", { glory: g }));
    if (act.extra.won) lines.push(L("PDVF.Solo.Line.TournamentWon"));
  }
  if (act.special === "revolt") {
    const won = (r) => !!r && (OK(r.outcome) || r.outcome === "already");
    act.extra.both = won(results.find(r => r.real === "skill.charge")) && won(results.find(r => chosen.includes(r.key) && r.real !== "skill.charge"));
  }
  await card(actor, activityTitle(act), lines.length ? lines : [L("PDVF.Solo.Line.Nothing")], rolls, L("PDVF.Winter.Step.solo"));
  return null;
}

/** Maladie : test de CON ; échec critique → Table 14.4 (sur un 6, deux formations à l'étape 8). */
async function illness(actor, state, run, act) {
  const rolls = [];
  const lines = [];
  const t = await quietTest(actor, "char.con");
  rolls.push(t.roll);
  lines.push(F("PDVF.Solo.Line.Test", { label: t.label, value: t.value, die: t.die, outcome: L(`PDVF.Outcome.${t.outcome}`) }));
  if (t.outcome === "fumble") {
    const id = await decline(actor, lines, rolls);
    if (!id) {
      state.training.extra = (Number(state.training.extra) || 0) + 1;
      lines.push(L("PDVF.Solo.Line.DoubleTraining"));
    }
  }
  act.tested = true;
  act.results = [{ key: "char.con", outcome: t.outcome, die: t.die, label: t.label }];
  await card(actor, activityTitle(act), lines, rolls, L("PDVF.Winter.Step.solo"));
  return null;
}

/** Prix du tournoi local (deux critiques, si aucun autre PJ n'y parvient : au MJ de trancher). */
export async function tournamentPrize(actor, state, runId, actId) {
  const act = soloState(state).runs.find(r => r.id === runId)?.activities.find(a => a.id === actId);
  if (!act?.extra?.won || act.extra.prize) return state;
  const r = await d(S.LOCAL_TOURNAMENT.prize.replace(/D/g, "d"));
  await addPounds(actor, r.total);
  act.extra.prize = r.total;
  await card(actor, L("PDVF.Solo.Activity.localTournament"), [F("PDVF.Solo.Line.Prize", { pounds: r.total })], [r]);
  return state;
}

/** Révolte paysanne : n traits cochés dans l'ordre, 60 d. chacun (120 si Charge et arme ont réussi). */
export async function revoltSpoils(actor, state, runId, actId, n) {
  const act = soloState(state).runs.find(r => r.id === runId)?.activities.find(a => a.id === actId);
  if (!act?.tested || act.extra.spoils !== undefined) return state;
  const count = Math.max(0, Math.min(S.REVOLT.traits.length, Number(n) || 0));
  const lines = [];
  for (const k of S.REVOLT.traits.slice(0, count)) { await actor.markExperience(k); lines.push(F("PDVF.Solo.Line.Checked", { label: actor.getRollable(k).label })); }
  const den = S.revoltPay(count, !!act.extra.both);
  if (den) await addPounds(actor, den / 240);
  act.extra.spoils = den;
  lines.push(F("PDVF.Solo.Line.Spoils", { d: den }));
  await card(actor, L("PDVF.Solo.Activity.revolt"), lines);
  return state;
}

/* -------------------------------------------- */
/*  Perdu dans les bois                          */
/* -------------------------------------------- */

export async function lostSeason(actor, state, runId) {
  const run = soloState(state).runs.find(r => r.id === runId);
  if (!run || run.kind !== "lost" || run.done) return state;
  const ex = run.extra;
  const rolls = [];
  const lines = [];
  const hunt = await quietTest(actor, "skill.hunting");
  const aware = await quietTest(actor, "skill.awareness");
  rolls.push(hunt.roll, aware.roll);
  const mod = (ex.carry || 0) + S.lostTestMod(hunt.outcome) + S.lostTestMod(aware.outcome);
  const r = await d("1d20");
  rolls.push(r);
  const total = r.total + mod;
  const row = S.lostRow(total);
  const season = ex.seasons.length + 1;
  lines.push(F("PDVF.Solo.Line.LostTests", { hunt: L(`PDVF.Outcome.${hunt.outcome}`), aware: L(`PDVF.Outcome.${aware.outcome}`), carry: ex.carry || 0 }));
  lines.push(F("PDVF.Solo.Line.LostRoll", { die: r.total, mod: mod >= 0 ? `+${mod}` : `${mod}`, total, text: L(`PDVF.Solo.Lost.${row.id}`) }));
  ex.carry = row.next ?? 0;
  if (row.con) { await bump(actor, "char.con", row.con); lines.push(L("PDVF.Solo.Line.ConLost")); }
  for (const k of row.check ?? []) await check(actor, soloState(state), k, lines);
  if (row.conTest) {
    const t = await quietTest(actor, "char.con");
    rolls.push(t.roll);
    lines.push(F("PDVF.Solo.Line.Test", { label: t.label, value: t.value, die: t.die, outcome: L(`PDVF.Outcome.${t.outcome}`) }));
    if (!OK(t.outcome)) await decline(actor, lines, rolls);
  }
  await fae(actor, row, lines, rolls);
  if (row.ride) {
    const t = await quietTest(actor, "skill.horsemanship");
    rolls.push(t.roll);
    lines.push(F("PDVF.Solo.Line.Test", { label: t.label, value: t.value, die: t.die, outcome: L(`PDVF.Outcome.${t.outcome}`) }));
    if (!OK(t.outcome)) lines.push(L("PDVF.Solo.Line.HorseLost"));
  }
  ex.seasons.push({ season, die: r.total, mod, total, id: row.id });
  if (row.home) { run.done = true; ex.home = true; lines.push(L("PDVF.Solo.Line.Home")); }
  else if (row.far) { run.done = true; ex.far = true; }
  else if (season >= 4) { run.done = true; ex.still = true; lines.push(L("PDVF.Solo.Line.StillLost")); }
  await card(actor, F("PDVF.Solo.SeasonTitle", { season }), lines, rolls, L("PDVF.Solo.Kind.lost"));
  return state;
}

/* -------------------------------------------- */
/*  Folie                                        */
/* -------------------------------------------- */

async function madness(actor, state, run, lines, rolls) {
  const r = await d("1d20");
  rolls.push(r);
  const row = S.madnessRow(r.total);
  run.extra = { roll: r.total };
  lines.push(`${r.total} — ${L(`PDVF.Solo.Madness.${r.total}`)}`);
  const solo = soloState(state);
  for (const k of row.check ?? []) await check(actor, solo, k, lines);
  if (row.either) {
    const best = row.either.reduce((a, b) => ((actor.getRollable(b)?.value ?? 0) > (actor.getRollable(a)?.value ?? 0) ? b : a));
    await check(actor, solo, best, lines);
  }
  if (row.honor) { await actor.adjustPassion("honor", row.honor); lines.push(F("PDVF.Solo.Line.Honor", { n: row.honor })); }
  await fae(actor, row, lines, rolls);
  if (row.gear) lines.push(L("PDVF.Solo.Line.Gear"));
  if (row.cured) lines.push(L("PDVF.Solo.Line.Cured"));
  if (row.visit) {
    const v = await d("1d6");
    rolls.push(v);
    run.activities.push(visitActivity(row.visit, v.total));
    lines.push(activityTitle(run.activities.at(-1)));
  } else run.done = true;
}

/* -------------------------------------------- */
/*  Pèlerinage                                   */
/* -------------------------------------------- */

export function pilgrimageSites(actor) {
  const rel = actor.system.biography.religion;
  const first = rel === "christian" ? "christian" : "pagan";
  return [first, first === "christian" ? "pagan" : "christian"].flatMap(group => S.PILGRIMAGE[group].map(s => ({ ...s, group })));
}

/**
 * Pèlerinage : à la façon des nobles (dépense, 1 £ par 80 km aller-retour) ou en ascète (Modeste et
 * Dévotion cochés, jet de vieillissement) ; cases du lieu saint, puis test de Dévotion (miracles).
 */
export async function pilgrimage(actor, state, runId, { site, mode = "paid", pounds = 1 }) {
  const run = soloState(state).runs.find(r => r.id === runId);
  if (!run || run.kind !== "pilgrimage" || run.extra.devotion) return state;
  const where = pilgrimageSites(actor).find(s => s.id === site);
  if (!where) return state;
  const solo = soloState(state);
  const rolls = [];
  const lines = [where.name];
  if (mode === "ascetic") {
    for (const k of S.PILGRIMAGE.ascetic) await check(actor, solo, k, lines);
    const r2 = await d("2d6");
    rolls.push(r2);
    const count = W.agingCount(r2.total, PDVF.winter);
    const hits = [];
    for (let i = 0; i < count; i++) { const x = await d("1d6"); rolls.push(x); hits.push(PDVF.winter.agingChars[x.total - 1]); }
    const chars = Object.fromEntries(PDVF.characteristics.map(k => [k, actor.system.characteristics[k].value]));
    const res = W.applyAging(chars, hits, PDVF.winter);
    await actor.update(Object.fromEntries(Object.entries(res.chars).map(([k, v]) => [`system.characteristics.${k}.value`, Math.max(0, v)])));
    const lost = Object.entries(res.losses).map(([k, n]) => `${L(`PDVF.Char.${k}.abbr`)} −${n}`).join(", ");
    lines.push(F("PDVF.Solo.Line.Ascetic", { r: r2.total, lost: lost || "—" }));
    run.extra.paid = 0;
  } else {
    const p = Math.max(0, Number(String(pounds).replace(",", ".")) || 0);
    if (p) await addPounds(actor, -p);
    run.extra.paid = p;
    lines.push(F("PDVF.Solo.Line.PilgrimPaid", { pounds: String(p).replace(".", ",") }));
  }
  for (const k of where.check) {
    if (k === "skill.literacy" && !(actor.system.skills.literacy?.value > 0)) continue;
    await check(actor, solo, k, lines);
  }
  run.extra.site = site;
  const dev = soloKey(actor, "passion:devotion");
  let outcome = "failure";
  if (dev) {
    const t = await quietTest(actor, dev);
    rolls.push(t.roll);
    outcome = t.outcome;
    lines.push(F("PDVF.Solo.Line.Test", { label: t.label, value: t.value, die: t.die, outcome: L(`PDVF.Outcome.${t.outcome}`) }));
    if (outcome === "critical") await actor.markExperience(dev);
  } else lines.push(L("PDVF.Solo.Line.NoDevotion"));
  run.extra.devotion = outcome;
  run.extra.miracles = S.PILGRIMAGE.miracles[outcome] ?? 0;
  if (outcome === "fumble") {
    const b = await d(S.PILGRIMAGE.banned.replace(/D/g, "d"));
    rolls.push(b);
    run.extra.banned = b.total;
    lines.push(F("PDVF.Solo.Line.Banned", { years: b.total }));
  }
  lines.push(F("PDVF.Solo.Line.Miracles", { n: run.extra.miracles }));
  if (!run.extra.miracles) run.done = true;
  await card(actor, L("PDVF.Solo.Kind.pilgrimage"), lines, rolls, L("PDVF.Winter.Step.solo"));
  return state;
}

/** Un miracle choisi (autant que le test de Dévotion en accorde, chacun une fois). */
export async function miracle(actor, state, runId, id, { char = "" } = {}) {
  const run = soloState(state).runs.find(r => r.id === runId);
  const ex = run?.extra;
  if (!ex || ex.chosen.length >= ex.miracles || ex.chosen.includes(id) || !S.MIRACLES.includes(id)) return state;
  const rolls = [];
  let line = L(`PDVF.Solo.Miracle.${id}`);
  const formula = S.MIRACLE_DICE[id];
  let value = null;
  if (formula) { const r = await d(formula.replace(/D/g, "d")); rolls.push(r); value = r.total; }
  if (id === "cure") await actor.update({ "system.health.debilitated": false });
  if (id === "hp") {
    const h = actor.system.health.hp;
    await actor.update({ "system.health.hp.value": Math.min(h.max, h.value + value) });
  }
  if (id === "char") {
    if (!PDVF.characteristics.includes(char)) return state;
    await bump(actor, `char.${char}`, value);
    line += ` : ${L(`PDVF.Char.${char}.long`)}`;
  }
  if (value !== null) line += ` (+${value})`;
  ex.chosen.push(id);
  ex.results ??= {};
  ex.results[id] = value;
  if (ex.chosen.length >= ex.miracles) run.done = true;
  await card(actor, L("PDVF.Solo.MiracleTitle"), [line], rolls);
  return state;
}

/* -------------------------------------------- */
/*  Vue pour l'assistant                         */
/* -------------------------------------------- */

export function soloView(actor, state) {
  const solo = soloState(state);
  const oc = (o) => (o && o !== "already" ? L(`PDVF.Outcome.${o}`) : o === "already" ? L("PDVF.Solo.AlreadyShort") : "");
  return {
    kinds: S.SOLO_KINDS.map(id => ({ id, label: L(`PDVF.Solo.Kind.${id}`), hint: L(`PDVF.Solo.KindHint.${id}`) })),
    runs: solo.runs.map(run => ({
      ...run, title: L(`PDVF.Solo.Kind.${run.kind}`), removable: !run.activities.some(a => a.tested) && !run.extra?.seasons?.length && (run.extra?.paid === null || run.extra?.paid === undefined) && run.kind !== "madness",
      isLost: run.kind === "lost", isPilgrimage: run.kind === "pilgrimage", isMadness: run.kind === "madness",
      madnessText: run.kind === "madness" ? `${run.extra.roll} — ${L(`PDVF.Solo.Madness.${run.extra.roll}`)}` : "",
      seasons: (run.extra?.seasons ?? []).map(s => ({ ...s, text: L(`PDVF.Solo.Lost.${s.id}`) })),
      lostCarry: run.extra?.carry ?? 0, lostStatus: run.extra?.home ? L("PDVF.Solo.Line.Home") : run.extra?.far ? L("PDVF.Solo.Lost.woodsman") : run.extra?.still ? L("PDVF.Solo.Line.StillLost") : "",
      sites: run.kind === "pilgrimage" ? pilgrimageSites(actor).map(s => ({ id: s.id, label: s.name, group: s.group, selected: s.id === run.extra.site })) : [],
      siteName: run.kind === "pilgrimage" ? pilgrimageSites(actor).find(s => s.id === run.extra.site)?.name ?? "" : "",
      devotionLabel: run.extra?.devotion ? L(`PDVF.Outcome.${run.extra.devotion}`) : "",
      miraclesLeft: run.kind === "pilgrimage" ? Math.max(0, (run.extra.miracles ?? 0) - (run.extra.chosen?.length ?? 0)) : 0,
      miracleOptions: S.MIRACLES.filter(m => !(run.extra?.chosen ?? []).includes(m)).map(m => ({ id: m, label: L(`PDVF.Solo.Miracle.${m}`) })),
      chosenMiracles: (run.extra?.chosen ?? []).map(m => L(`PDVF.Solo.Miracle.${m}`) + (run.extra.results?.[m] ? ` (+${run.extra.results[m]})` : "")),
      charOptions: PDVF.characteristics.map(k => ({ id: k, label: L(`PDVF.Char.${k}.long`) })),
      activities: run.activities.map(a => ({
        ...a, title: activityTitle(a),
        fixed: a.keys.map(k => { const real = soloKey(actor, k); return { label: real ? actor.getRollable(real).label : labelOf(actor, k), missing: !real, already: !!real && solo.checked.includes(real) }; }),
        slotViews: a.slots.map((slot, i) => ({ i, n: slotCount(slot), label: L(`PDVF.Solo.Slot.${slot.oneOf ? "oneOf" : slot.pick}`), options: slotOptions(actor, slot).map(o => ({ ...o, text: `${o.label} ${o.value}` })),
          range: Array.from({ length: Math.min(slotCount(slot), slotOptions(actor, slot).length) }, (_, j) => j) })),
        isIllness: a.special === "illness", isTournament: a.special === "tournament", isRevolt: a.special === "revolt", isFalse: a.type === "falseAlarm",
        resultRows: a.results.map(r => ({ ...r, outcomeLabel: oc(r.outcome) })),
        revoltChoices: a.special === "revolt" ? Array.from({ length: S.REVOLT.traits.length + 1 }, (_, n) => ({ n, label: n ? S.REVOLT.traits.slice(0, n).map(k => actor.getRollable(k).label).join(", ") : L("PDVF.Solo.NoSpoils") })) : [],
        payEach: a.extra?.both ? S.REVOLT.payBoth : S.REVOLT.pay
      }))
    })),
    extraTraining: Number(state.training?.extra) || 0
  };
}
