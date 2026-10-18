/**
 * Phase d'hiver, étape 4 : revenus des terres (Livre des Nobles, chap. 3).
 * La rente fait vivre la maisonnée ; chaque domaine teste sa Gestion pour les fonds privés
 * (Table 3.2), puis viennent les paysans, la charité, les gages et l'entretien des embellissements.
 * Les embellissements donnent aussi leurs tests annuels, juste avant les tests d'expérience.
 * L'état est gardé dans celui de l'hiver (state.lands, state.enhChecks).
 */
import { PDVF, SYSTEM_ID } from "../config.mjs";
import * as R from "../rules/domains.mjs";
import { compareOpposed } from "../rules/resolution.mjs";
import { rollPlain } from "../dice/tests.mjs";
import { domainsOf, checkLabel } from "../documents/domains.mjs";
import { postLines, resolveKey, checkKeys } from "./engine.mjs";

const L = (k) => game.i18n.localize(k);
const F = (k, d) => game.i18n.format(k, d);
const M = () => PDVF.manor;
const D = 240;
const num = (v) => String(Math.round(v * 100) / 100).replace(".", ",");

function lands(state) {
  state.lands ??= { rolls: {}, gentleUsed: false, peasants: null, done: false };
  return state.lands;
}

function isPagan(actor) {
  return (actor.system.biography?.religion || "christian") !== "christian";
}

/** Total des manoirs tenus (les revenus « par manoir » de la p. 69). */
export function manorCount(actor) {
  return domainsOf(actor).reduce((s, d) => s + Math.max(1, Number(d.system.manors) || 1), 0);
}

/** Qui peut tester la Gestion d'un domaine : le chevalier (avec le bonus de Lettres), ses intendants, un autre. */
export function rollersFor(actor, domain) {
  const s = actor.system;
  const stew = Number(actor.getRollable?.("skill.stewardship")?.value ?? s.skills?.stewardship?.value) || 0;
  const lit = R.literacyBonus(s.skills?.literacy?.value);
  const out = [{ id: "knight", name: actor.name, value: stew + lit, label: F("PDVF.Manor.Winter.Knight", { value: stew + lit }) }];
  domain.system.professionals.forEach((p, i) => {
    if (p.type !== "steward") return;
    const name = p.name || L("PDVF.Manor.Professional.steward");
    out.push({ id: `pro.${i}`, name, value: p.skill, label: F("PDVF.Manor.Winter.StewardOpt", { name, value: p.skill }) });
  });
  const st = domain.system.steward;
  if (st?.name && st.skill > 0 && !out.some(o => o.name === st.name)) {
    out.push({ id: "steward", name: st.name, value: st.skill, label: F("PDVF.Manor.Winter.StewardOpt", { name: st.name, value: st.skill }) });
  }
  out.push({ id: "other", name: L("PDVF.Manor.Winter.Other"), value: null, label: L("PDVF.Manor.Winter.Other") });
  return out;
}

/** Ce que l'assistant affiche pour les terres. */
export function landsInfo(actor, state) {
  const m = M();
  const st = lands(state);
  const domains = domainsOf(actor).map(d => {
    const roll = st.rolls[d.id] ?? null;
    return {
      id: d.id, name: d.name, manors: d.system.manors, rent: d.system.income, harvest: d.system.harvest,
      rollers: rollersFor(actor, d), roll,
      partsText: roll ? roll.parts.map(p => `${partLabel(p, roll)} ${p.value >= 0 ? "+" : ""}${num(p.value)}`).join(" · ") : "",
      canReroll: !!roll && roll.gentle && !st.gentleUsed && ["failure", "fumble"].includes(roll.outcome) && !st.done,
      famineThreat: !!roll?.harvest?.famineThreat, famineAvoided: !!roll?.famineAvoided,
      famineCost: m.famine.preventCost * Math.max(1, d.system.manors)
    };
  });
  const sys = domainsOf(actor).map(d => d.system);
  const manors = manorCount(actor);
  const just = Number(actor.system.traits?.just?.value) || 0;
  const charityCost = manors * m.charity.largesse.cost;
  return {
    domains, manors, done: st.done, allRolled: domains.every(d => d.roll),
    peasants: st.peasants, mustBeJust: just >= 16,
    squeeze: R.squeezeTraits(actor.system.traits, m).map(t => ({ ...t, label: checkLabel(t.key) })),
    charityCost,
    wages: sys.reduce((s, x) => s + R.staffCost(x, m), 0),
    maintenance: sys.reduce((s, x) => s + R.enhancementUpkeep(x, m, state.year), 0),
    upkeep: R.landsUpkeep(sys, PDVF.domainRanks),
    net: st.net ?? null, lines: st.lines ?? []
  };
}

function partLabel(p, roll) {
  if (p.id === "harvest") return F("PDVF.Manor.Winter.PartHarvest", { outcome: L(`PDVF.Outcome.${roll.outcome}`) });
  if (p.id === "famine") return L("PDVF.Manor.Winter.PartFamine");
  if (p.id === "improvements") return L("PDVF.Manor.Winter.PartImprovements");
  return L(`PDVF.Manor.Period.${p.label}`);
}

/** Test de Gestion d'un domaine. */
export async function landRoll(actor, state, domainId, opts = {}) {
  const st = lands(state);
  if (st.done || st.rolls[domainId]) return state;
  const domain = actor.items.get(domainId);
  if (!domain) return state;
  const r = await rollLand(actor, state, domain, opts);
  st.rolls[domainId] = r;
  return state;
}

/** Une dame relance une fois par hiver un test de Gestion raté. */
export async function landReroll(actor, state, domainId) {
  const st = lands(state);
  const prev = st.rolls[domainId];
  if (st.done || !prev?.gentle || st.gentleUsed || !["failure", "fumble"].includes(prev.outcome)) return state;
  const domain = actor.items.get(domainId);
  st.rolls[domainId] = { ...(await rollLand(actor, state, domain, prev)), rerolled: true };
  st.gentleUsed = true;
  return state;
}

async function rollLand(actor, state, domain, { roller = "knight", value = null, war = "none", weather = "normal", brownie = "none", pestilence = "none", gentle = false }) {
  const m = M();
  const who = rollersFor(actor, domain).find(o => o.id === roller) ?? rollersFor(actor, domain)[0];
  const base = who.id === "other" ? Math.max(0, Number(value) || 0) : who.value;
  let modifier = R.stewardshipModifier({ war, brownie }, m);
  let weatherDie = 0;
  if (m.weather[weather]) {
    const w = await new Roll(m.weather[weather].replace(/^[+]/, "")).evaluate();
    weatherDie = w.total;
    await w.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `${domain.name} — ${L(`PDVF.Manor.Weather.${weather}`)}` });
    modifier += weatherDie;
  }
  const t = await rollPlain({
    actor, name: who.id === "knight" ? actor.name : who.name, label: L("PDVF.Skill.stewardship"), value: base, modifier,
    title: `${L("PDVF.Manor.Winter.Title")} — ${domain.name}`
  });
  const b = R.privyBreakdown(domain.system, t.outcome, state.year, { pestilence }, m);
  return {
    roller: who.id, rollerName: who.name, value: base, modifier, war, weather, weatherDie, brownie, pestilence, gentle: !!gentle,
    outcome: t.outcome, parts: b.parts, total: b.total, harvest: b.harvest, famineAvoided: false
  };
}

/** Payer 1 £ par manoir pour éviter la famine annoncée (payé à l'encaissement). */
export function avoidFamine(actor, state, domainId) {
  const r = lands(state).rolls[domainId];
  if (r?.harvest?.famineThreat && !lands(state).done) r.famineAvoided = true;
  return state;
}

/** Les paysans : Folklore contre Rang (motiver), ou test de Juste (les laisser en paix). */
export async function peasants(actor, state, choice, { traits = [] } = {}) {
  const st = lands(state);
  if (st.done) return state;
  const m = M();
  const manors = manorCount(actor);
  const just = Number(actor.system.traits?.just?.value) || 0;
  if (choice === "motivate" && !st.peasants) {
    if (just >= 16) return state;
    const folk = actor.getRollable("skill.folklore");
    const stationKey = resolveKey(actor, "passion:station");
    const station = stationKey ? actor.getRollable(stationKey) : null;
    const title = L("PDVF.Manor.Winter.Peasants");
    const a = await rollPlain({ actor, name: actor.name, label: folk?.label ?? L("PDVF.Skill.folklore"), value: folk?.value ?? 0, title });
    const b = await rollPlain({ actor, name: actor.name, label: station?.label ?? L("PDVF.Winter.PassionName.station"), value: station?.value ?? 10, title });
    const cmp = compareOpposed(a.result, b.result);
    if (cmp.winner === "a") st.peasants = { kind: "motivated", pounds: m.peasantry.motivated * manors, line: F("PDVF.Manor.Winter.Motivated", { pounds: m.peasantry.motivated * manors }) };
    else if (cmp.winner === "b") st.peasants = { kind: "station", pounds: 0, pending: true, line: L("PDVF.Manor.Winter.StationWins") };
    else st.peasants = { kind: "tie", pounds: 0, line: L("PDVF.Manor.Winter.Tie") };
    if (!station) st.peasants.noStation = true;
  } else if (choice === "squeeze" && st.peasants?.pending) {
    const all = R.squeezeTraits(actor.system.traits, m);
    const keys = all.filter(t => t.forced || traits.includes(t.key)).map(t => t.key);
    await checkKeys(actor, keys);
    const pounds = keys.length * m.peasantry.squeezePerTrait * manors;
    st.peasants = { kind: "squeezed", pounds, line: F("PDVF.Manor.Winter.Squeezed", { pounds, traits: keys.map(checkLabel).join(", ") || "—" }) };
  } else if (choice === "spare" && st.peasants?.pending) {
    const forced = R.squeezeTraits(actor.system.traits, m).filter(t => t.forced);
    // Un trait Célèbre (16+) impose de pressurer.
    if (forced.length) return peasants(actor, state, "squeeze", { traits: [] });
    st.peasants = { kind: "spared", pounds: 0, line: L("PDVF.Manor.Winter.NotSqueezed") };
  } else if (choice === "just" && !st.peasants) {
    const t = await rollPlain({ actor, name: actor.name, label: L("PDVF.Trait.just.left"), value: just, title: L("PDVF.Manor.Winter.Peasants") });
    if (["critical", "success"].includes(t.outcome)) await actor.markExperience("trait.just.left");
    st.peasants = { kind: "just", pounds: 0, line: F("PDVF.Manor.Winter.JustDone", { outcome: L(`PDVF.Outcome.${t.outcome}`) }) };
  }
  return state;
}

/**
 * Encaissement : fonds privés, paysans, famine évitée, charité, gages, entretien des embellissements.
 * Met à jour l'état des récoltes et le registre de chaque domaine.
 */
export async function collectLands(actor, state, { charity = {}, maintain = true } = {}) {
  const st = lands(state);
  if (st.done) return state;
  const m = M();
  const doms = domainsOf(actor);
  if (doms.some(d => !st.rolls[d.id])) { ui.notifications.warn(L("PDVF.Manor.Winter.RollAll")); return state; }
  const manors = manorCount(actor);
  const lines = [];
  let net = 0;
  const ruined = [];
  let wages = 0, maint = 0, famineCost = 0;
  for (const d of doms) {
    const r = st.rolls[d.id];
    const s = d.system;
    net += r.total;
    lines.push(F("PDVF.Manor.Winter.Line", { name: d.name, privy: num(r.total) }));
    if (r.famineAvoided) famineCost += m.famine.preventCost * Math.max(1, s.manors);
    if (r.harvest.famineStarts) lines.push(F("PDVF.Manor.Winter.FamineStarts", { name: d.name }));
    if (r.harvest.famineEnds) lines.push(L("PDVF.Manor.Winter.FamineEnds"));
    wages += R.staffCost(s, m);
    maint += maintain ? R.enhancementUpkeep(s, m, state.year) : 0;
    const enh = R.maintainEnhancements(d._source.system.enhancements, state.year, maintain, m);
    enh.filter(e => e.ruinedNow).forEach(e => ruined.push(e.name || L(`PDVF.Manor.Enhancement.${e.type}`)));
    const ledger = foundry.utils.deepClone(d._source.system.ledger ?? []);
    ledger.push({ year: state.year, income: r.total, note: `${L("PDVF.Skill.stewardship")} : ${L(`PDVF.Outcome.${r.outcome}`)}` });
    await d.update({
      "system.harvest": {
        fumbles: r.harvest.fumbles, famine: r.harvest.famine,
        famineNext: r.harvest.famineThreat && !r.famineAvoided, hunger: r.outcome === "fumble"
      },
      "system.enhancements": enh.map(({ ruinedNow, ...e }) => e),
      "system.ledger": ledger
    });
  }
  const pz = st.peasants?.pending ? 0 : (st.peasants?.pounds ?? 0);
  if (pz) { net += pz; lines.push(F("PDVF.Manor.Winter.LinePeasants", { pounds: pz })); }
  if (famineCost) { net -= famineCost; lines.push(F("PDVF.Manor.Winter.LineFamine", { pounds: famineCost })); }
  const gifts = ["largesse", "poor", "church"].filter(k => charity[k]);
  if (gifts.length) {
    const cost = gifts.reduce((s, k) => s + m.charity[k].cost * manors, 0);
    net -= cost;
    lines.push(F("PDVF.Manor.Winter.LineCharity", { pounds: cost }));
    await checkKeys(actor, gifts.map(k => R.checkKey(m.charity[k].check)));
  }
  if (wages) { net -= wages; lines.push(F("PDVF.Manor.Winter.LineWages", { pounds: num(wages) })); }
  if (maint) { net -= maint; lines.push(F("PDVF.Manor.Winter.LineMaintain", { pounds: maint })); }
  ruined.forEach(n => lines.push(F("PDVF.Manor.Winter.LineRuined", { name: n })));
  await actor.update({ "system.economy.treasury": (Number(actor.system.economy.treasury) || 0) + Math.round(net * D) });
  st.done = true;
  st.net = net;
  st.charity = gifts;
  st.lines = lines;
  await postLines(actor, L("PDVF.Manor.Winter.Title"), [...lines, F("PDVF.Manor.Winter.Collected", { net: num(net) })]);
  return state;
}

/** Tests annuels des embellissements (et investissements qui en donnent), avant l'expérience. */
export async function enhancementChecks(actor, state) {
  if (state.enhChecks?.done || state.xp?.done) return state;
  const keys = R.annualChecks(domainsOf(actor).map(d => d.system), state.year, M(), { pagan: isPagan(actor) });
  const rows = [];
  for (const k of keys) {
    const real = k.startsWith("passion:") ? resolveKey(actor, k) : k;
    const r = real ? actor.getRollable(real) : null;
    if (!r) { rows.push({ key: k, label: checkLabel(k), outcome: "" }); continue; }
    const t = await rollPlain({ actor, name: actor.name, label: r.label, value: r.value, title: L("PDVF.Manor.Winter.EnhRolls") });
    if (["critical", "success"].includes(t.outcome)) await actor.markExperience(real);
    rows.push({ key: k, label: r.label, outcome: t.outcome });
  }
  state.enhChecks = { done: true, rows };
  return state;
}

/** Les tests des embellissements à faire cet hiver (pour l'affichage). */
export function enhancementCheckList(actor, state) {
  return R.annualChecks(domainsOf(actor).map(d => d.system), state.year, M(), { pagan: isPagan(actor) }).map(checkLabel);
}

/** Gloire de la suite : gages des professionnels qui voyagent avec le chevalier (100 au plus). */
export function entourageGloryOf(actor) {
  const pros = domainsOf(actor).flatMap(d => d.system.professionals ?? []);
  return R.entourageGlory(pros, M());
}
