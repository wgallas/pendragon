/**
 * Cartes d'évènement de festin : bibliothèque importée par le MJ (fichier personnel, jamais dans le dépôt),
 * paquet de chaque festin, et résolution automatique d'une carte jouée.
 *
 * Format d'une carte (fichier « pendragon-vf.feastCards ») :
 *   { id, title, count, host, base, testLabel, paragraphs[], roll, effects }
 * roll :
 *   { kind: "none" }
 *   { kind: "test", keys[], choose?, random?[], modifier? }      → critical | success | failure | fumble
 *   { kind: "decision", left, right }                              → left(Critical) | right(Critical)
 *   { kind: "versus", left, right }  (deux Attributs du chevalier)  → left | right
 *   { kind: "opposed", keys[], choose?, opponent, count?, rerollTies? } → win(Critical) | lose | tie | oppCritical
 *                                                                         (count : perWin, allWin)
 *   { kind: "all", sub: "opposed" | "decision" | "drink", ... }    (tous les PJ, résolu par le MJ)
 * effets : { eng, glory, denarii, pounds, check[], honor, hp, skip, leave, keep{perRound, blocksDraw, note},
 *            noHost, drunk, lower, note, choice[{label, effect}], roll, special, then{roll, effects}, always }
 * Clés : « skill.x », « char.x », « trait.x.side », « best:passion », « best:skill », « best:hate »,
 *        « passion:choice », « a|b » (au choix), « used » (l'Attribut testé).
 */
import { PDVF, SYSTEM_ID } from "../config.mjs";
import { resolveTest, compareOpposed, formatValue } from "../rules/resolution.mjs";
import { normalizeLabel } from "../rules/followers.mjs";
import { loseHitPoints } from "../combat/damage.mjs";
import { raiseDrunk, applyDrinkOutcome } from "../court/court.mjs";

const L = (k) => game.i18n.localize(k);
const F = (k, d) => game.i18n.format(k, d);
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const signed = (n) => (n > 0 ? `+${n}` : `${n}`);
export const LIBRARY = "feastCards";
export const FORMAT = "pendragon-vf.feastCards";

/* -------------------------------------------- */
/*  Bibliothèque                                 */
/* -------------------------------------------- */

export function library() {
  try { return game.settings.get(SYSTEM_ID, LIBRARY)?.cards ?? []; } catch (e) { return []; }
}

export function cardById(id) {
  return library().find(c => c.id === id) ?? null;
}

/** Vérifie un fichier de cartes et le garde dans le monde (MJ). */
export async function importLibrary(text) {
  let data;
  try { data = JSON.parse(text); } catch (e) { throw new Error(L("PDVF.FeastCard.Import.BadJson")); }
  if (data?.format !== FORMAT || !Array.isArray(data.cards) || !data.cards.length) throw new Error(L("PDVF.FeastCard.Import.BadFormat"));
  const cards = data.cards.filter(c => c?.id && c.title && c.roll).map(c => ({
    id: String(c.id), title: String(c.title), count: Math.max(1, Number(c.count) || 1), host: !!c.host, base: Number(c.base) || 0,
    testLabel: String(c.testLabel ?? ""), paragraphs: (c.paragraphs ?? []).map(String), roll: c.roll, effects: c.effects ?? {}
  }));
  await game.settings.set(SYSTEM_ID, LIBRARY, { version: Number(data.version) || 1, source: String(data.source ?? ""), cards });
  return cards;
}

/** Nouveau paquet mélangé (tous les exemplaires, sauf ceux qu'on écarte). */
export function freshDeck(exclude = []) {
  const ids = [];
  for (const c of library()) for (let i = 0; i < c.count; i++) ids.push(c.id);
  for (const x of exclude) { const i = ids.indexOf(x); if (i >= 0) ids.splice(i, 1); }
  return shuffle(ids);
}

export function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** Vue d'une carte pour l'affichage. */
export function cardView(card) {
  if (!card) return null;
  return { ...card, baseLabel: signed(card.base), allPCs: card.roll?.kind === "all" };
}

/* -------------------------------------------- */
/*  Petits outils                                */
/* -------------------------------------------- */

async function dialogChoice(title, options) {
  if (!options.length) return null;
  if (options.length === 1) return options[0].value;
  const { DialogV2 } = foundry.applications.api;
  const r = await DialogV2.wait({
    window: { title }, classes: [SYSTEM_ID, "pdvf-dialog"], rejectClose: false,
    content: `<div class="form-group"><select name="v">${options.map(o => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join("")}</select></div>`,
    buttons: [{ action: "ok", label: L("PDVF.Dialog.Ok"), default: true, callback: (e, b) => b.form.elements.v.value }]
  });
  return r && r !== "cancel" ? r : options[0].value;
}

const rollable = (actor, key) => actor.getRollable(key);

/** Clé réelle d'un Attribut (meilleure passion, passion au choix, Haine…), ou null. */
async function realKey(actor, key, ctx) {
  const s = actor.system;
  if (key === "best:passion") {
    const rows = ["honor", ...s.passions.map((_, i) => `passion.${i}`)];
    return rows.reduce((a, b) => ((rollable(actor, b)?.value ?? 0) > (rollable(actor, a)?.value ?? 0) ? b : a));
  }
  if (key === "best:hate") {
    const rows = s.passions.map((p, i) => ({ p, i })).filter(({ p }) => normalizeLabel(p.name).startsWith("haine"));
    if (!rows.length) return null;
    return `passion.${rows.reduce((a, b) => (b.p.value > a.p.value ? b : a)).i}`;
  }
  if (key === "best:skill") {
    return Object.keys(PDVF.skills).map(id => `skill.${id}`).reduce((a, b) => ((s.skills[b.split(".")[1]]?.value ?? 0) > (s.skills[a.split(".")[1]]?.value ?? 0) ? b : a));
  }
  if (key === "passion:choice") {
    if (!ctx.prompt) return "honor";
    const opts = ["honor", ...s.passions.map((_, i) => `passion.${i}`)].map(k => ({ value: k, label: `${rollable(actor, k).label} ${formatValue(rollable(actor, k).value)}` }));
    return dialogChoice(L("PDVF.FeastCard.ChoosePassion"), opts);
  }
  if (key.includes("|")) {
    const opts = key.split("|").filter(k => rollable(actor, k)).map(k => ({ value: k, label: rollable(actor, k).label }));
    return ctx.prompt ? dialogChoice(L("PDVF.FeastCard.ChooseCheck"), opts) : opts[0]?.value ?? null;
  }
  return rollable(actor, key) ? key : null;
}

/** Modificateur d'un test pendant le festin : Engouement (ATT et compétences de cour), ivresse, inspiration. */
function testModifier(actor, key, ctx) {
  const [kind, id] = key.split(".");
  const court = key === "char.app" || (kind === "skill" && PDVF.feast.engouementSkills.includes(id));
  return (court ? Number(ctx.engouement) || 0 : 0) + (actor.conditionModifier?.(key)?.value ?? 0) + (actor.inspirationBonus?.(key) ?? 0);
}

/** Test d'un Attribut, sans carte de chat (les jets sont regroupés sur la carte de la carte jouée). */
async function quiet(actor, key, ctx, extra = 0) {
  const r = rollable(actor, key);
  if (!r) return null;
  const roll = await new Roll("1d20").evaluate();
  ctx.rolls.push(roll);
  const mod = testModifier(actor, key, ctx) + extra;
  const res = resolveTest(r.value, mod, roll.total);
  if (res.outcome === "critical" && r.canXp && !(r.kind === "skill" && actor.noSkillXp)) { await actor.markExperience(key); ctx.lines.push(F("PDVF.Card.XpMarked", { name: actor.name, label: r.label })); }
  ctx.lines.push(F("PDVF.FeastCard.Line.Test", { label: r.label, value: r.value, mod: mod ? ` ${signed(mod)}` : "", die: roll.total, outcome: L(`PDVF.Outcome.${res.outcome}`) }));
  return { ...res, key, die: roll.total, value: r.value, label: r.label };
}

async function formula(f, ctx) {
  const r = await new Roll(String(f).replace(/D/g, "d")).evaluate();
  ctx.rolls.push(r);
  return r.total;
}

/** Petite arithmétique des effets (« 2*die », « -(die-value) », « 5+rerolls »). */
function expr(v, vars) {
  if (typeof v === "number") return v;
  const src = String(v).replace(/[a-z]+/g, (n) => (n in vars ? `(${Number(vars[n]) || 0})` : "0"));
  if (!/^[\d\s+\-*/().]+$/.test(src)) return 0;
  try { return Math.round(Function(`"use strict"; return (${src});`)()); } catch (e) { return 0; }
}

/* -------------------------------------------- */
/*  Effets                                       */
/* -------------------------------------------- */

async function apply(actor, fx, ctx, vars = {}) {
  if (!fx) return;
  const out = ctx.out;
  if (fx.roll) { const n = await formula(fx.roll, ctx); ctx.lines.push(F("PDVF.FeastCard.Line.Roll", { formula: fx.roll, total: n })); }
  if (fx.eng) out.eng += Number(fx.eng) || 0;
  if (fx.glory !== undefined) { const g = expr(fx.glory, vars); if (g) out.glory += g; }
  if (fx.denarii !== undefined) {
    const d = expr(fx.denarii, vars);
    if (d) {
      await actor.update({ "system.economy.treasury": (Number(actor.system.economy?.treasury) || 0) + d });
      ctx.lines.push(F(d > 0 ? "PDVF.FeastCard.Line.Won" : "PDVF.FeastCard.Line.Lost", { d: Math.abs(d) }));
    }
  }
  if (fx.pounds) {
    await actor.update({ "system.economy.treasury": (Number(actor.system.economy?.treasury) || 0) + Math.round(fx.pounds * 240) });
    ctx.lines.push(F("PDVF.FeastCard.Line.Pounds", { pounds: fx.pounds }));
  }
  for (const k of fx.check ?? []) {
    const key = k === "used" ? vars.used : await realKey(actor, k, ctx);
    if (!key || !rollable(actor, key)) continue;
    await actor.markExperience(key);
    ctx.lines.push(F("PDVF.Solo.Line.Checked", { label: rollable(actor, key).label }));
  }
  if (fx.honor) { await actor.adjustPassion("honor", fx.honor); ctx.lines.push(F("PDVF.Solo.Line.Honor", { n: fx.honor })); }
  if (fx.lower) {
    const key = fx.lower === "used" ? vars.used : fx.lower;
    if (key) { await actor.adjustPassion(key, -1); ctx.lines.push(F("PDVF.FeastCard.Line.Lower", { label: rollable(actor, key)?.label ?? key })); }
  }
  if (fx.hp) {
    const n = await formula(fx.hp, ctx);
    const r = await loseHitPoints(actor, n);
    ctx.lines.push(...r.lines);
  }
  if (fx.drunk) { const lv = await raiseDrunk(actor); ctx.lines.push(F("PDVF.FeastCard.Line.Drunk", { state: L(`PDVF.Court.Drink.State.${lv}`) })); }
  if (fx.skip) out.skip = true;
  if (fx.leave) out.leave = true;
  if (fx.noHost) { out.noHost = true; ctx.lines.push(L("PDVF.FeastCard.Note.noHost")); }
  if (fx.keep) { out.keep = { perRound: Number(fx.keep.perRound) || 0, blocksDraw: !!fx.keep.blocksDraw, note: fx.keep.note ?? "" }; }
  if (fx.note) ctx.lines.push(L(`PDVF.FeastCard.Note.${fx.note}`));
  if (fx.special === "alms") await alms(actor, ctx);
  if (fx.choice?.length) {
    const pick = ctx.prompt ? await dialogChoice(L("PDVF.FeastCard.Choose"), fx.choice.map((c, i) => ({ value: String(i), label: L(`PDVF.FeastCard.Choice.${c.label}`) }))) : "0";
    const c = fx.choice[Number(pick)] ?? fx.choice[0];
    ctx.lines.push(F("PDVF.FeastCard.Line.Chosen", { choice: L(`PDVF.FeastCard.Choice.${c.label}`) }));
    await apply(actor, c.effect, ctx, vars);
  }
  if (fx.then) await resolveRoll(actor, fx.then.roll, fx.then.effects, ctx);
}

/** L'aumône : au moins 20 d. ; 5 Gloire par 120 d. ; Généreux coché dès 120 d. */
async function alms(actor, ctx) {
  let d = 20;
  if (ctx.prompt) {
    const { DialogV2 } = foundry.applications.api;
    const r = await DialogV2.wait({
      window: { title: L("PDVF.FeastCard.Alms") }, classes: [SYSTEM_ID, "pdvf-dialog"], rejectClose: false,
      content: `<div class="form-group"><label>${L("PDVF.FeastCard.AlmsAmount")}</label><input type="number" name="d" value="20" min="20" step="1"></div>`,
      buttons: [{ action: "ok", label: L("PDVF.Dialog.Ok"), default: true, callback: (e, b) => b.form.elements.d.value }]
    });
    d = Math.max(20, Number(r) || 20);
  }
  await actor.update({ "system.economy.treasury": (Number(actor.system.economy?.treasury) || 0) - d });
  const glory = Math.floor(d / 120) * 5;
  ctx.out.glory += glory;
  ctx.lines.push(F("PDVF.FeastCard.Line.Alms", { d, glory }));
  if (d >= 120) { await actor.markExperience("trait.generous.left"); ctx.lines.push(F("PDVF.Solo.Line.Checked", { label: rollable(actor, "trait.generous.left").label })); }
}

/* -------------------------------------------- */
/*  Résolution                                   */
/* -------------------------------------------- */

const pick = (effects, ...names) => { for (const n of names) if (effects?.[n]) return effects[n]; return null; };

async function resolveRoll(actor, roll, effects, ctx) {
  switch (roll?.kind) {
    case "none": return apply(actor, effects.none, ctx);
    case "test": {
      let key = roll.keys?.[0];
      if (roll.random?.length) {
        const n = await formula(`1d${roll.random.length}`, ctx);
        key = roll.random[n - 1];
      } else if (roll.choose) {
        const opts = [];
        for (const k of roll.keys) { const rk = await realKey(actor, k, ctx); if (rk) opts.push({ value: rk, label: `${rollable(actor, rk).label} ${formatValue(rollable(actor, rk).value)}` }); }
        key = ctx.prompt ? await dialogChoice(L("PDVF.FeastCard.ChooseTest"), opts) : opts.sort((a, b) => rollable(actor, b.value).value - rollable(actor, a.value).value)[0]?.value;
      } else key = await realKey(actor, key, ctx);
      if (!key) { ctx.lines.push(L("PDVF.FeastCard.Line.NoAttribute")); return; }
      const t = await quiet(actor, key, ctx, Number(roll.modifier) || 0);
      const fx = t.outcome === "critical" ? pick(effects, "critical", "success") : t.outcome === "success" ? pick(effects, "success")
        : t.outcome === "fumble" ? pick(effects, "fumble", "failure") : pick(effects, "failure");
      return apply(actor, fx, ctx, { used: key, die: t.die, value: t.value });
    }
    case "decision": case "versus": {
      const left = await realKey(actor, roll.left, ctx);
      const right = await realKey(actor, roll.right, ctx);
      let side = null, crit = false;
      if (roll.kind === "versus") {
        const a = left ? await quiet(actor, left, ctx) : null;
        const b = right ? await quiet(actor, right, ctx) : null;
        if (a && b) { const c = compareOpposed(a, b); side = c.winner === "a" ? "left" : c.winner === "b" ? "right" : null; }
        else side = a?.success ? "left" : b?.success ? "right" : null;
      } else {
        const a = left ? await quiet(actor, left, ctx) : null;
        if (a?.success) { side = "left"; crit = a.outcome === "critical"; }
        else if (a?.outcome === "fumble") side = "right";
        else {
          const b = right ? await quiet(actor, right, ctx) : null;
          if (b?.success) { side = "right"; crit = b.outcome === "critical"; }
          else if (b?.outcome === "fumble") side = "left";
        }
      }
      if (!side && ctx.prompt) {
        side = await dialogChoice(L("PDVF.FeastCard.PlayerChoice"), [{ value: "left", label: rollable(actor, left)?.label ?? "—" }, { value: "right", label: rollable(actor, right)?.label ?? "—" }]);
      }
      if (!side) { ctx.lines.push(L("PDVF.FeastCard.Line.NoSide")); return; }
      ctx.lines.push(F("PDVF.FeastCard.Line.Side", { label: rollable(actor, side === "left" ? left : right)?.label ?? "" }));
      return apply(actor, crit ? pick(effects, `${side}Critical`, side) : pick(effects, side), ctx, { used: side === "left" ? left : right });
    }
    case "opposed": {
      let key;
      if (roll.choose) {
        const opts = roll.keys.filter(k => rollable(actor, k)).map(k => ({ value: k, label: `${rollable(actor, k).label} ${formatValue(rollable(actor, k).value)}` }));
        key = ctx.prompt ? await dialogChoice(L("PDVF.FeastCard.ChooseTest"), opts) : opts[0]?.value;
      } else key = await realKey(actor, roll.keys[0], ctx);
      if (!key) { ctx.lines.push(L("PDVF.FeastCard.Line.NoAttribute")); return; }
      const n = roll.count ? await formula(roll.count, ctx) : 1;
      let wins = 0, rerolls = 0, last = null;
      for (let i = 0; i < n; i++) {
        const ov = await formula(roll.opponent, ctx);
        let me, them, cmp;
        do {
          me = await quiet(actor, key, ctx);
          const or = await new Roll("1d20").evaluate();
          ctx.rolls.push(or);
          them = resolveTest(ov, 0, or.total);
          cmp = compareOpposed(me, them);
          ctx.lines.push(F("PDVF.FeastCard.Line.Opponent", { value: ov, die: or.total, outcome: L(`PDVF.Outcome.${them.outcome}`), result: L(`PDVF.FeastCard.Result.${cmp.winner === "a" ? "win" : cmp.winner === "b" ? "lose" : "tie"}`) }));
          if (cmp.winner || !roll.rerollTies) break;
          rerolls++;
        } while (rerolls < 10);
        if (cmp.winner === "a") wins++;
        last = { me, them, cmp };
      }
      const vars = { used: key, rerolls, wins };
      if (roll.count) {
        for (let i = 0; i < wins; i++) await apply(actor, effects.perWin, ctx, vars);
        if (wins === n) await apply(actor, effects.allWin, ctx, vars);
        ctx.lines.push(F("PDVF.FeastCard.Line.Wins", { wins, n }));
      } else {
        const { cmp, me, them } = last;
        if (cmp.winner === "a") await apply(actor, me.outcome === "critical" ? pick(effects, "winCritical", "win") : pick(effects, "win"), ctx, vars);
        else if (cmp.winner === "b") {
          await apply(actor, pick(effects, "lose"), ctx, vars);
          if (them.outcome === "critical") await apply(actor, effects.oppCritical, ctx, vars);
        } else await apply(actor, pick(effects, "tie"), ctx, vars);
      }
      return apply(actor, effects.always, ctx, vars);
    }
  }
}

/**
 * Joue une carte pour un chevalier : jets, effets sur sa fiche (cases, Honneur, trésor, PV, ivresse),
 * et ce qu'il faut noter au festin (Engouement de la carte, Gloire, départ, tour sauté, carte conservée).
 * @param {Actor} actor
 * @param {object} card
 * @param {{engouement:number, prompt?:boolean}} opts
 */
export async function resolveCard(actor, card, { engouement = 0, prompt = true } = {}) {
  const ctx = { prompt, engouement, rolls: [], lines: [], out: { eng: 0, glory: 0, skip: false, leave: false, keep: null, noHost: false } };
  await resolveRoll(actor, card.roll, card.effects ?? {}, ctx);
  return { ...ctx.out, lines: ctx.lines, rolls: ctx.rolls };
}

/**
 * Carte « tous les PJ » (résolue par le MJ) : un résultat par invité.
 * opposed : chacun teste, le meilleur succès l'emporte (critique), les autres succès sont partiels ;
 * decision : test du trait de gauche puis de droite ; drink : test de Bon-vivant (bière).
 * @param {{actor:Actor, engouement:number}[]} people
 */
export async function resolveAll(card, people) {
  const roll = card.roll;
  const results = [];
  if (roll.sub === "opposed") {
    const key = roll.keys[0];
    const tests = [];
    for (const p of people) {
      const ctx = { prompt: false, engouement: p.engouement, rolls: [], lines: [], out: { eng: 0, glory: 0, skip: false, leave: false, keep: null, noHost: false } };
      const t = await quiet(p.actor, key, ctx);
      tests.push({ p, ctx, t });
    }
    const best = Math.max(-1, ...tests.filter(x => x.t?.outcome === "success").map(x => x.t.adjusted ?? x.t.die));
    for (const x of tests) {
      let o = x.t?.outcome ?? "failure";
      if (o === "success" && (x.t.adjusted ?? x.t.die) < best) o = "partial";
      await apply(x.p.actor, card.effects[o], x.ctx, { used: key });
      results.push({ actor: x.p.actor, outcome: o, ...x.ctx.out, lines: x.ctx.lines, rolls: x.ctx.rolls });
    }
    return results;
  }
  for (const p of people) {
    const ctx = { prompt: false, engouement: p.engouement, rolls: [], lines: [], out: { eng: 0, glory: 0, skip: false, leave: false, keep: null, noHost: false } };
    if (roll.sub === "drink") {
      const t = await quiet(p.actor, "trait.temperate.right", ctx, PDVF.court.drink.drinks.beer);
      const lv = await applyDrinkOutcome(p.actor, t.outcome);
      ctx.lines.push(F("PDVF.FeastCard.Line.Drunk", { state: L(`PDVF.Court.Drink.State.${lv}`) }));
    } else if (roll.sub === "decision") {
      await resolveRoll(p.actor, { kind: "decision", left: roll.left, right: roll.right }, card.effects, ctx);
    }
    results.push({ actor: p.actor, ...ctx.out, lines: ctx.lines, rolls: ctx.rolls });
  }
  return results;
}
