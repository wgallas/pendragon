/**
 * Vie de cour, côté Foundry : Engouement hors festin, tenues de Mode, amour courtois, séduction, ivresse.
 * Les boutons du bloc « Cour » de la fiche du chevalier appellent ces fonctions (le joueur sur son chevalier).
 */
import { PDVF, SYSTEM_ID } from "../config.mjs";
import * as C from "../rules/court.mjs";
import { resolveTest, formatValue, traitPair } from "../rules/resolution.mjs";
import { normalizeLabel } from "../rules/followers.mjs";
import { rollAttribute, rollPlain } from "../dice/tests.mjs";
import { domainIncome } from "../documents/domains.mjs";
import { gameYear } from "../documents/period.mjs";

const L = (k) => game.i18n.localize(k);
const F = (k, d) => game.i18n.format(k, d);
const { DialogV2 } = foundry.applications.api;
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const signed = (n) => (n > 0 ? `+${n}` : `${n}`);
const CARD = `systems/${SYSTEM_ID}/templates/chat/battle-card.hbs`;
export const THRESHOLDS = "seductionThresholds";

function day() {
  try { return Number(game.settings.get(SYSTEM_ID, "currentDay")) || 1; } catch (e) { return 1; }
}

async function card(actor, title, lines, { rolls = [], whisper = null } = {}) {
  const content = await foundry.applications.handlebars.renderTemplate(CARD, { title, subtitle: L("PDVF.Court.Title"), lines, buttons: [] });
  const data = { speaker: ChatMessage.getSpeaker({ actor }), content, rolls, flags: { [SYSTEM_ID]: { kind: "court" } } };
  if (whisper) data.whisper = whisper;
  return ChatMessage.implementation.create(data);
}

async function form(title, content, label = L("PDVF.Dialog.Ok")) {
  const r = await DialogV2.wait({
    window: { title }, classes: [SYSTEM_ID, "pdvf-dialog"], content, rejectClose: false,
    buttons: [{ action: "ok", label, default: true, callback: (e, b) => Object.fromEntries([...b.form.elements].filter(el => el.name).map(el => [el.name, el.type === "checkbox" ? el.checked : el.value])) },
      { action: "cancel", label: L("PDVF.Dialog.Cancel") }]
  });
  return r && r !== "cancel" ? r : null;
}

/** Test simple d'un trait (sans le trait opposé), avec un modificateur. */
async function traitTest(actor, key, { modifier = 0, title, notes = [] }) {
  const r = actor.getRollable(key);
  const cond = actor.conditionModifier(key);
  const res = await rollPlain({ actor, name: actor.name, label: r.label, value: r.value, modifier: modifier + cond.value + actor.inspirationBonus(key), title, subtitle: L("PDVF.Court.Title"), notes: [...notes, ...(cond.note ? [cond.note] : [])] });
  return res.result;
}

function resultOf(message) {
  return message?.flags?.[SYSTEM_ID]?.result ?? null;
}

/* -------------------------------------------- */
/*  Engouement                                   */
/* -------------------------------------------- */

export function engouementOf(actor) {
  const s = actor.system;
  const fashion = C.fashionCurrent(s.court.fashion, gameYear());
  const romantic = (s.idealEffects?.met ?? []).includes("romantic");
  const e = C.courtEngouement({ living: s.economy?.living ?? "ordinary", romantic, fashion, other: s.court.other, adjust: s.court.adjust, app: s.characteristics.app.value }, PDVF.feast);
  return { ...e, fashion, romantic };
}

/** Test d'ATT ou d'une compétence de cour avec l'Engouement. */
export async function courtTest(actor) {
  const e = engouementOf(actor);
  const options = [`<option value="char.app">${esc(L("PDVF.Char.app.long"))} ${actor.system.characteristics.app.value}</option>`,
    ...PDVF.feast.engouementSkills.map(id => `<option value="skill.${id}">${esc(L(`PDVF.Skill.${id}`))} ${formatValue(actor.system.skills[id]?.value ?? 0)}</option>`)];
  const data = await form(`${actor.name} — ${L("PDVF.Court.Test")}`, `<div class="form-group"><label>${L("PDVF.Feast.Attribute")}</label><select name="key">${options.join("")}</select></div>
    <div class="form-group"><label>${L("PDVF.Court.ExtraModifier")}</label><input type="number" name="mod" value="0" step="1"></div>
    <p class="pdvf-hint">${F("PDVF.Feast.EngouementApplied", { mod: signed(e.total) })}</p>`);
  if (!data) return;
  return rollAttribute(actor, data.key, { modifier: e.total + (Number(data.mod) || 0), subtitle: L("PDVF.Court.Title"), notes: [F("PDVF.Feast.EngouementNote", { mod: signed(e.total) })] });
}

export async function adjustEngouement(actor, delta) {
  if (delta === "reset") return actor.update({ "system.court.adjust": 0 });
  return actor.update({ "system.court.adjust": (Number(actor.system.court.adjust) || 0) + Number(delta) });
}

/* -------------------------------------------- */
/*  Tenue de Mode (Table 5.3)                    */
/* -------------------------------------------- */

export async function fashionOutfit(actor) {
  const s = actor.system;
  const spend = C.rankSpend({ klass: s.biography.knightClass, income: domainIncome(actor) }, PDVF.court);
  const married = !!s.family.spouse?.name && s.family.spouse.alive !== false;
  const year = gameYear();
  const data = await form(`${actor.name} — ${L("PDVF.Court.Fashion.Title")}`, `
    <p class="pdvf-hint">${F("PDVF.Court.Fashion.Hint", { spend, market: PDVF.court.fashionMarket })}</p>
    <div class="form-group"><label>${L("PDVF.Court.Fashion.Pounds")}</label><input type="number" name="pounds" value="${spend}" min="0" step="1"></div>
    <div class="form-group"><label>${L("PDVF.Court.Fashion.Who")}</label><select name="who">
      <option value="self">${esc(F("PDVF.Court.Fashion.Self", { value: s.skills.fashion?.value ?? 0 }))}</option>
      ${married ? `<option value="spouse" selected>${esc(F("PDVF.Court.Fashion.Spouse", { name: s.family.spouse.name }))}</option>` : ""}
      <option value="other">${esc(L("PDVF.Court.Fashion.Other"))}</option></select></div>
    <div class="form-group"><label>${L("PDVF.Court.Fashion.Value")}</label><input type="number" name="value" value="12" min="0" step="1"></div>
    <div class="form-group"><label>${L("PDVF.Court.Fashion.Year")}</label><input type="number" name="year" value="${year}" step="1"></div>`);
  if (!data) return;
  const pounds = Math.max(0, Number(data.pounds) || 0);
  if (!pounds) return;
  const t = Number(s.economy.treasury) || 0;
  await actor.update({ "system.economy.treasury": t - Math.round(pounds * 240) });
  const lines = [F("PDVF.Court.Fashion.Spent", { pounds })];
  if (pounds > spend) { await actor.markExperience("trait.modest.right"); lines.push(L("PDVF.Court.Fashion.Proud")); }
  let outcome;
  if (data.who === "self") {
    const msg = await rollAttribute(actor, "skill.fashion", { subtitle: L("PDVF.Court.Fashion.Title") });
    outcome = resultOf(msg)?.outcome;
  } else {
    const res = await rollPlain({ actor, name: data.who === "spouse" ? s.family.spouse.name : L("PDVF.Court.Fashion.Other"), label: L("PDVF.Skill.fashion"), value: Number(data.value) || 0, title: L("PDVF.Court.Fashion.Title"), subtitle: actor.name });
    outcome = res.outcome;
  }
  if (!outcome) return;
  const ok = outcome === "success" || outcome === "critical";
  const bonus = ok ? C.fashionBonus(pounds, PDVF.court.fashion) : 0;
  await actor.update({ "system.court.fashion": { pounds, bonus, year: Number(data.year) || year, outcome } });
  lines.push(ok ? F("PDVF.Court.Fashion.Success", { bonus }) : L("PDVF.Court.Fashion.Failure"));
  return card(actor, L("PDVF.Court.Fashion.Title"), lines);
}

/* -------------------------------------------- */
/*  Amour courtois                               */
/* -------------------------------------------- */

/** Passion d'Adoration envers l'être aimé (index), ou -1. */
export function adorationIndex(actor) {
  const s = actor.system;
  const name = normalizeLabel(s.court.beloved);
  const rows = s.passions.map((p, i) => ({ p, i })).filter(({ p }) => normalizeLabel(p.name).startsWith("adoration"));
  const exact = rows.find(({ p }) => name && normalizeLabel(p.name).includes(name));
  return (exact ?? rows[0])?.i ?? -1;
}

export async function startCourtlyLove(actor) {
  const data = await form(`${actor.name} — ${L("PDVF.Court.Love.Start")}`, `<p class="pdvf-hint">${L("PDVF.Court.Love.StartHint")}</p>
    <div class="form-group"><label>${L("PDVF.Court.Love.Beloved")}</label><input type="text" name="beloved" autofocus></div>`);
  if (!data?.beloved?.trim()) return;
  const beloved = data.beloved.trim().slice(0, 60);
  const r = await new Roll(PDVF.court.adoration.start.replace(/D/g, "d")).evaluate();
  await r.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: F("PDVF.Court.Love.Roll", { beloved }) });
  const passions = foundry.utils.deepClone(actor._source.system.passions);
  passions.push({ court: "adoratio", name: `Adoration (${beloved})`, value: r.total, xp: false });
  await actor.update({ "system.passions": passions, "system.court.beloved": beloved, "system.court.consummated": false });
  return card(actor, L("PDVF.Court.Love.Title"), [F("PDVF.Court.Love.Started", { name: actor.name, beloved, value: r.total })]);
}

/** Don d'une récompense de Gloire à l'être aimé (prise sur la Gloire de session). */
export async function giveGlory(actor) {
  const s = actor.system;
  if (s.court.consummated) return ui.notifications.warn(L("PDVF.Court.Love.NoGift"));
  const i = adorationIndex(actor);
  if (i < 0) return ui.notifications.warn(L("PDVF.Court.Love.NoAdoration"));
  const data = await form(`${actor.name} — ${L("PDVF.Court.Love.Gift")}`, `<p class="pdvf-hint">${L("PDVF.Court.Love.GiftHint")}</p>
    <div class="form-group"><label>${L("PDVF.Court.Love.GiftAmount")}</label><input type="number" name="glory" value="10" min="1" step="1"></div>
    <div class="form-group"><label>${L("PDVF.Court.Love.GiftNote")}</label><input type="text" name="note"></div>`);
  if (!data) return;
  const glory = Math.max(0, Number(data.glory) || 0);
  if (!glory) return;
  const session = Number(s.glory.session) || 0;
  if (glory > session) return ui.notifications.warn(F("PDVF.Court.Love.NotEnough", { session }));
  const year = gameYear();
  const fx = C.adorationGift(glory, { raisedThisYear: s.court.adorationYear === year }, PDVF.court.adoration);
  const passions = foundry.utils.deepClone(actor._source.system.passions);
  const lines = [F("PDVF.Court.Love.Given", { name: actor.name, glory, beloved: s.court.beloved || passions[i].name })];
  if (fx.check) { passions[i].xp = true; lines.push(F("PDVF.Solo.Line.Checked", { label: passions[i].name })); }
  if (fx.raise) { passions[i].value += 1; lines.push(F("PDVF.Court.Love.Raised", { label: passions[i].name, value: passions[i].value })); }
  const gifts = [...foundry.utils.deepClone(actor._source.system.court.gifts), { year, glory, note: String(data.note ?? "").slice(0, 80) }];
  await actor.update({ "system.passions": passions, "system.glory.session": session - glory, "system.court.gifts": gifts, ...(fx.raise ? { "system.court.adorationYear": year } : {}) });
  return card(actor, L("PDVF.Court.Love.Title"), lines);
}

/** Union consommée : l'Adoration devient Amour à la moitié. */
export async function consummate(actor) {
  const i = adorationIndex(actor);
  if (i < 0) return ui.notifications.warn(L("PDVF.Court.Love.NoAdoration"));
  const s = actor.system;
  const passions = foundry.utils.deepClone(actor._source.system.passions);
  const ok = await DialogV2.confirm({ window: { title: L("PDVF.Court.Love.Consummate") }, classes: [SYSTEM_ID, "pdvf-dialog"],
    content: `<p>${F("PDVF.Court.Love.ConsummateConfirm", { passion: esc(passions[i].name) })}</p><label><input type="checkbox" name="married"> ${L("PDVF.Court.Love.Married")}</label>`,
    yes: { callback: (e, b) => ({ married: b.form.elements.married.checked }) } });
  if (!ok) return;
  const res = C.consummation(passions[i].value, { married: !!ok.married, beloved: s.court.beloved });
  const old = passions[i].name;
  passions[i] = { court: "adoratio", name: res.name, value: res.value, xp: false };
  await actor.update({ "system.passions": passions, "system.court.consummated": true });
  return card(actor, L("PDVF.Court.Love.Title"), [F("PDVF.Court.Love.Consummated", { old, name: res.name, value: res.value })]);
}

/* -------------------------------------------- */
/*  Séduction                                    */
/* -------------------------------------------- */

function thresholds() {
  try { return foundry.utils.deepClone(game.settings.get(SYSTEM_ID, THRESHOLDS) ?? {}); } catch (e) { return {}; }
}

export function thresholdFor(actor, id) {
  const v = thresholds()[`${actor.id}.${id}`];
  return v === undefined || v === null || v === "" ? null : Number(v);
}

export async function setThreshold(actor, id, value) {
  if (!game.user.isGM) return;
  const all = thresholds();
  const key = `${actor.id}.${id}`;
  if (value === "" || value === null) delete all[key]; else all[key] = Number(value) || 0;
  await game.settings.set(SYSTEM_ID, THRESHOLDS, all);
  actor.sheet?.render();
}

async function saveSeductions(actor, fn) {
  const list = foundry.utils.deepClone(actor._source.system.court.seductions);
  const out = await fn(list);
  await actor.update({ "system.court.seductions": list });
  return out;
}

export async function addSeduction(actor) {
  const data = await form(`${actor.name} — ${L("PDVF.Court.Seduce.Add")}`, `
    <div class="form-group"><label>${L("PDVF.Court.Seduce.Name")}</label><input type="text" name="name" autofocus></div>
    <div class="form-group"><label>${L("PDVF.Court.Seduce.Kind")}</label><select name="noble"><option value="1">${L("PDVF.Court.Seduce.Noble")}</option><option value="0">${L("PDVF.Court.Seduce.Commoner")}</option></select></div>
    <div class="form-group"><label><input type="checkbox" name="married"> ${L("PDVF.Court.Seduce.MarriedTarget")}</label></div>
    <p class="pdvf-hint">${L("PDVF.Court.Seduce.Warning")}</p>`);
  if (!data?.name?.trim()) return;
  await saveSeductions(actor, (list) => list.push({ id: foundry.utils.randomID(), name: data.name.trim().slice(0, 60), noble: data.noble === "1", married: !!data.married, favors: [], status: "", note: "" }));
}

/** Roturier : test de Romance (modificateurs du MJ), puis Chaste contre Luxurieux de la personne séduite. */
export async function seduceCommoner(actor, id) {
  const x = actor.system.court.seductions.find(y => y.id === id);
  if (!x || x.status) return;
  const app = actor.system.characteristics.app.value;
  const data = await form(`${actor.name} — ${L("PDVF.Court.Seduce.Try")}`, `<p class="pdvf-hint">${L("PDVF.Court.Seduce.CommonerHint")}</p>
    <div class="form-group"><label>${L("PDVF.Court.Seduce.Modifier")}</label><input type="number" name="mod" value="0" step="1"></div>
    <div class="form-group"><label>${L("PDVF.Court.Seduce.TargetChaste")}</label><input type="number" name="chaste" value="${PDVF.court.seduction.targetChaste}" min="0" max="20" step="1"></div>`);
  if (!data) return;
  const msg = await rollAttribute(actor, "skill.flirting", { modifier: Number(data.mod) || 0, subtitle: F("PDVF.Court.Seduce.TryOn", { name: x.name }), notes: [F("PDVF.Court.Seduce.AppNote", { app })] });
  const romance = resultOf(msg);
  if (!romance) return;
  let status = "failed";
  const lines = [F("PDVF.Court.Seduce.RomanceLine", { outcome: L(`PDVF.Outcome.${romance.outcome}`) })];
  const rolls = [];
  if (romance.success) {
    const chasteV = Math.max(0, Math.min(20, Number(data.chaste) || 0));
    const r1 = await new Roll("1d20").evaluate(); const r2 = await new Roll("1d20").evaluate();
    rolls.push(r1, r2);
    const chaste = resolveTest(chasteV, 0, r1.total);
    const lust = resolveTest(20 - chasteV, 0, r2.total);
    status = C.seductionResult(romance, chaste, lust);
    lines.push(F("PDVF.Court.Seduce.TargetLine", { name: x.name, chaste: chasteV, cd: r1.total, co: L(`PDVF.Outcome.${chaste.outcome}`), lust: 20 - chasteV, ld: r2.total, lo: L(`PDVF.Outcome.${lust.outcome}`) }));
  }
  lines.push(L(`PDVF.Court.Seduce.Result.${status}`));
  if (status === "seduced" && x.married) lines.push(L("PDVF.Court.Seduce.AdulteryWarning"));
  await saveSeductions(actor, (list) => { const y = list.find(z => z.id === id); if (y) y.status = status === "seduced" ? "seduced" : ""; });
  return card(actor, L("PDVF.Court.Seduce.Title"), lines, { rolls });
}

/** Noble : une Faveur rendue (cadeau, service, haut fait). Le MJ est prévenu quand le seuil secret est atteint. */
export async function addFavor(actor, id) {
  const x = actor.system.court.seductions.find(y => y.id === id);
  if (!x || x.status) return;
  const data = await form(`${actor.name} — ${L("PDVF.Court.Seduce.AddFavor")}`, `<p class="pdvf-hint">${L("PDVF.Court.Seduce.FavorHint")}</p>
    <div class="form-group"><label>${L("PDVF.Court.Seduce.FavorLabel")}</label><input type="text" name="label" autofocus></div>
    <div class="form-group"><label>${L("PDVF.Court.Seduce.FavorValue")}</label><input type="number" name="value" value="1" min="1" step="1"></div>`);
  if (!data) return;
  const value = Math.max(1, Number(data.value) || 1);
  const favors = [...x.favors, { label: String(data.label || L("PDVF.Court.Seduce.Favor")).slice(0, 60), value }];
  await saveSeductions(actor, (list) => { const y = list.find(z => z.id === id); if (y) y.favors = favors; });
  const th = thresholdFor(actor, id);
  const p = C.seductionProgress(favors, th);
  await card(actor, L("PDVF.Court.Seduce.Title"), [F("PDVF.Court.Seduce.FavorLine", { name: actor.name, target: x.name, label: favors.at(-1).label, value })]);
  if (p.reached) await card(actor, L("PDVF.Court.Seduce.Title"), [F("PDVF.Court.Seduce.Reached", { name: actor.name, target: x.name, total: p.total, threshold: th })],
    { whisper: game.users.filter(u => u.isGM).map(u => u.id) });
}

export async function setSeductionStatus(actor, id, status) {
  await saveSeductions(actor, (list) => {
    const y = list.find(z => z.id === id);
    if (!y) return;
    if (status === "remove") list.splice(list.indexOf(y), 1);
    else y.status = status;
  });
  if (["seduced", "discovered"].includes(status)) {
    const x = actor.system.court.seductions.find(y => y.id === id);
    const lines = [F(`PDVF.Court.Seduce.Status.${status}Line`, { name: actor.name, target: x?.name ?? "?" })];
    if (status === "discovered") lines.push(L(x?.married ? "PDVF.Court.Seduce.DiscoveredMarried" : "PDVF.Court.Seduce.DiscoveredHint"));
    return card(actor, L("PDVF.Court.Seduce.Title"), lines);
  }
}

/* -------------------------------------------- */
/*  Ivresse (Tables 3.11 et 3.12)                */
/* -------------------------------------------- */

function drunk(actor) {
  return foundry.utils.deepClone(actor._source.system.court.drunk);
}

/** Boire : test de Bon-vivant (boisson, ennemis, festin royal) → état d'ivresse. */
export async function drink(actor) {
  const st = actor.drinkState();
  if (st.immune) return ui.notifications.info(L("PDVF.Court.Drink.ImmuneTip"));
  const cfg = PDVF.court.drink;
  const data = await form(`${actor.name} — ${L("PDVF.Court.Drink.Drink")}`, `
    <div class="form-group"><label>${L("PDVF.Court.Drink.What")}</label><select name="drink">${Object.keys(cfg.drinks).map(d => `<option value="${d}">${L(`PDVF.Court.Drink.Drinks.${d}`)} (${signed(cfg.drinks[d])})</option>`).join("")}</select></div>
    <div class="form-group"><label><input type="checkbox" name="enemies"> ${L("PDVF.Court.Drink.Enemies")} (${cfg.enemies})</label></div>
    <div class="form-group"><label><input type="checkbox" name="royal"> ${L("PDVF.Court.Drink.Royal")} (${cfg.royal})</label></div>
    <div class="form-group"><label>${L("PDVF.Court.ExtraModifier")}</label><input type="number" name="extra" value="0" step="1"></div>`);
  if (!data) return;
  const mod = C.drinkModifier({ drink: data.drink, enemies: !!data.enemies, royal: !!data.royal, extra: data.extra }, cfg);
  const res = await traitTest(actor, "trait.temperate.right", { modifier: mod, title: L("PDVF.Court.Drink.Drink") });
  const level = C.drunkLevel(res.outcome);
  const d = drunk(actor);
  const today = day();
  const fresh = d.day !== today;
  const order = ["sober", "drunk", "deadDrunk"];
  const prev = fresh ? "sober" : d.level;
  const next = level === "immune" ? prev : (order.indexOf(level) > order.indexOf(prev) ? level : prev);
  await actor.update({ "system.court.drunk": { ...d, day: today, level: next, immune: level === "immune" || (!fresh && d.immune),
    activity: fresh ? "" : d.activity, passedOut: fresh ? false : d.passedOut, hangoverChecked: fresh ? false : d.hangoverChecked } });
  return card(actor, L("PDVF.Court.Drink.Title"), [F("PDVF.Court.Drink.Result", { name: actor.name, state: L(`PDVF.Court.Drink.State.${level === "immune" ? "immune" : next}`) })]);
}

/** Toutes les deux heures : test d'Énergique → niveau d'activité (le pire compte). */
export async function stayAwake(actor) {
  const st = actor.drinkState();
  if (st.level === "sober" && !st.activity) return ui.notifications.info(L("PDVF.Court.Drink.NotDrunk"));
  const cfg = PDVF.court.drink;
  const mod = C.energeticModifier({ level: st.level, debilitated: !!actor.system.health.debilitated }, cfg);
  const res = await traitTest(actor, "trait.energetic.left", { modifier: mod, title: L("PDVF.Court.Drink.Awake") });
  const d = drunk(actor);
  const n = C.nextActivity(d.activity, res.outcome, cfg);
  const passedOut = n.activity === "unconscious" || n.activity === "comatose" || d.passedOut;
  await actor.update({ "system.court.drunk": { ...d, day: day(), level: n.sober ? "sober" : d.level, activity: n.activity, passedOut } });
  return card(actor, L("PDVF.Court.Drink.Title"), [F("PDVF.Court.Drink.ActivityLine", { name: actor.name, activity: L(`PDVF.Court.Drink.State.${n.sober ? "sober" : (n.activity || d.level)}`) })]);
}

/** Le lendemain d'une perte de connaissance : test de CON (−5, −10 si comateux) ou gueule de bois (−5). */
export async function hangover(actor) {
  const st = actor.drinkState();
  if (!st.hangoverPending) return;
  const cfg = PDVF.court.drink.hangover;
  const d = drunk(actor);
  const mod = d.activity === "comatose" ? cfg.comatose : cfg.con;
  const r = actor.getRollable("char.con");
  const res = await rollPlain({ actor, name: actor.name, label: r.label, value: r.value, modifier: mod, title: L("PDVF.Court.Drink.Hangover"), subtitle: L("PDVF.Court.Title") });
  const bad = !res.result.success;
  await actor.update({ "system.court.drunk": { ...d, hangoverChecked: true, hangoverDay: day(), hangover: bad } });
  return card(actor, L("PDVF.Court.Drink.Title"), [L(bad ? "PDVF.Court.Drink.HangoverBad" : "PDVF.Court.Drink.HangoverOk")]);
}

export async function soberUp(actor) {
  const d = drunk(actor);
  return actor.update({ "system.court.drunk": { ...d, level: "sober", activity: "", immune: false, passedOut: false, hangover: false } });
}

/* -------------------------------------------- */
/*  Vue pour la fiche                            */
/* -------------------------------------------- */

export function courtView(actor) {
  const s = actor.system;
  const e = engouementOf(actor);
  const st = actor.drinkState();
  const ai = adorationIndex(actor);
  const isGM = game.user.isGM;
  const year = gameYear();
  return {
    engouement: signed(e.total), start: signed(e.start), adjust: s.court.adjust, adjustLabel: signed(Number(s.court.adjust) || 0), other: s.court.other,
    fashionLine: s.court.fashion.year !== null && s.court.fashion.pounds
      ? F("PDVF.Court.Fashion.Line", { pounds: s.court.fashion.pounds, bonus: e.fashion, year: s.court.fashion.year, outcome: L(`PDVF.Outcome.${s.court.fashion.outcome || "failure"}`) }) : "",
    romantic: e.romantic, app: s.characteristics.app.value,
    love: {
      beloved: s.court.beloved, consummated: s.court.consummated, adoration: ai >= 0 ? s.passions[ai] : null,
      raisedThisYear: s.court.adorationYear === year,
      gifts: s.court.gifts.slice(-5).reverse().map(g => F("PDVF.Court.Love.GiftRow", { year: g.year, glory: g.glory, note: g.note || "" }))
    },
    seductions: s.court.seductions.map(x => {
      const th = isGM ? thresholdFor(actor, x.id) : null;
      const p = C.seductionProgress(x.favors, isGM ? th : null);
      return { ...x, total: p.total, reached: p.reached, threshold: th ?? "", statusLabel: x.status ? L(`PDVF.Court.Seduce.Status.${x.status}`) : "",
        kindLabel: L(x.noble ? "PDVF.Court.Seduce.Noble" : "PDVF.Court.Seduce.Commoner"), favorsText: x.favors.map(f => `${f.label} (F${f.value})`).join(", ") };
    }),
    drink: {
      state: st, sober: st.level === "sober" && !st.activity,
      label: st.activity ? L(`PDVF.Court.Drink.State.${st.activity}`) : L(`PDVF.Court.Drink.State.${st.level}`),
      immune: st.immune, hangoverPending: st.hangoverPending, hangover: st.hangover,
      skillsNote: (() => { const c = actor.conditionModifier("skill.sword"); return c.value ? signed(c.value) : ""; })()
    },
    isGM
  };
}
