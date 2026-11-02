/**
 * Étape 4 de la phase d'hiver, compléments : Industrie de la dame (Livre du joueur, Table 5.2),
 * solde du chevalier mercenaire (Table 1.2) et rançons (Tables 12.1 à 12.5, rançons des batailles).
 * Les rançons sont gardées sur le chevalier (drapeau « ransoms ») : une rançon non payée attend
 * l'hiver suivant (un an et un jour).
 */
import { PDVF, SYSTEM_ID } from "../config.mjs";
import * as R from "../rules/ransom.mjs";
import * as W from "../rules/winter.mjs";
import { resolveTest } from "../rules/resolution.mjs";
import { formatDenarii } from "../rules/horses.mjs";
import { domainIncome } from "../documents/domains.mjs";
import { addPounds, postLines } from "./engine.mjs";
import { soloKey } from "./solo.mjs";

const L = (k) => game.i18n.localize(k);
const F = (k, d) => game.i18n.format(k, d);
const C = () => PDVF.winter;
const D = 240;
const money = (den) => formatDenarii(Math.round(Number(den) || 0));

/* -------------------------------------------- */
/*  Solde du mercenaire                          */
/* -------------------------------------------- */

export function payInfo(actor, state) {
  const s = actor.system;
  if (s.biography.knightClass !== "mercenary") return null;
  const max = W.mercenaryBonusMax(s.gloryTotal, C());
  const saved = state.payCalc ?? {};
  const unit = saved.unit ?? C().mercenaryDefault.unit;
  const count = saved.count ?? C().mercenaryDefault.count;
  const bonus = saved.bonus ?? max;
  return {
    max, unit, count, bonus,
    units: Object.keys(C().mercenaryRates).map(u => ({ value: u, label: L(`PDVF.Winter.PayUnit.${u}`), rate: C().mercenaryRates[u], selected: u === unit })),
    denarii: W.mercenaryPay({ unit, count, bonus }, C())
  };
}

/* -------------------------------------------- */
/*  Industrie                                    */
/* -------------------------------------------- */

export function industryInfo(actor, state) {
  const s = actor.system;
  const married = !!s.family.spouse?.name && s.family.spouse.alive !== false;
  const workers = [];
  if (married) workers.push({ value: "spouse", label: F("PDVF.Winter.Industry.Spouse", { name: s.family.spouse.name }) });
  workers.push({ value: "other", label: L("PDVF.Winter.Industry.Other") });
  workers.push({ value: "self", label: F("PDVF.Winter.Industry.Self", { name: actor.name }) });
  const ind = state.industry;
  return {
    done: !!ind?.done, workers, married, value: C().industry.defaultValue,
    works: C().industry.works.map(w => ({ id: w, label: L(`PDVF.Winter.Industry.Work.${w}`), husbandOnly: w === "husband" })),
    rows: (ind?.rows ?? []).map(r => ({ ...r, work: L(`PDVF.Winter.Industry.Work.${r.work}`), outcomeLabel: L(`PDVF.Outcome.${r.outcome}`) })),
    lines: ind?.lines ?? []
  };
}

/**
 * Industrie de l'hiver : un test par ouvrage choisi. Vêtements de l'époux : seulement par l'épouse.
 * Le chevalier qui s'y livre perd 3 points d'Honneur. Les cases de la dame ne sont cochées que si c'est
 * le chevalier lui-même ; sinon elles sont notées.
 */
export async function rollIndustry(actor, state, { worker = "spouse", value = 10, works = [], sell = true }) {
  if (state.industry?.done) return state;
  const cfg = C().industry;
  const self = worker === "self";
  const list = works.filter(w => cfg.works.includes(w) && (w !== "husband" || worker === "spouse"));
  if (!list.length) return state;
  const v = self ? Number(actor.system.skills.industry?.value) || 0 : Math.max(0, Number(value) || 0);
  const rolls = [];
  const rows = [];
  const lines = [];
  let pounds = 0;
  for (const w of list) {
    const r = await new Roll("1d20").evaluate();
    rolls.push(r);
    const res = resolveTest(v, 0, r.total);
    const fx = cfg[res.outcome]?.[w] ?? (res.outcome === "fumble" ? cfg.fumble : {});
    const parts = [];
    if (fx.attire) parts.push(F("PDVF.Winter.Industry.Attire", { pounds: fx.attire }));
    if (fx.app) {
      // +1 ATT pour un an : au chevalier s'il s'agit de ses vêtements (époux) ou s'il est l'ouvrier.
      if (w === "husband" || self) { await grantApp(actor, state.year); parts.push(L("PDVF.Winter.Industry.AppKnight")); }
      else parts.push(L("PDVF.Winter.Industry.AppLady"));
    }
    if (fx.check) {
      const key = fx.check === "devotion" ? "passion:devotion" : fx.check === "generous" ? "trait.generous.left" : null;
      const real = key ? soloKey(actor, key) : (soloKey(actor, "passion:station") ?? soloKey(actor, "passion:chivalry"));
      if (self && real) { await actor.markExperience(real); parts.push(F("PDVF.Solo.Line.Checked", { label: actor.getRollable(real).label })); }
      else parts.push(L(`PDVF.Winter.Industry.Check.${fx.check}`));
    }
    if (fx.sell) {
      if (sell) { pounds += fx.sell; parts.push(F("PDVF.Winter.Industry.Sold", { pounds: fx.sell })); }
      else parts.push(F("PDVF.Winter.Industry.Kept", { pounds: fx.sell }));
    }
    if (res.outcome === "failure") parts.push(L("PDVF.Winter.Industry.Poor"));
    if (fx.loss) { pounds -= fx.loss; parts.push(F("PDVF.Winter.Industry.Loss", { pounds: fx.loss })); }
    rows.push({ work: w, die: r.total, outcome: res.outcome, text: parts.join(" · ") });
    lines.push(`${L(`PDVF.Winter.Industry.Work.${w}`)} : ${r.total} — ${L(`PDVF.Outcome.${res.outcome}`)}${parts.length ? ` · ${parts.join(" · ")}` : ""}`);
  }
  if (pounds) await addPounds(actor, pounds);
  if (self) { await actor.adjustPassion("honor", cfg.knightHonor); lines.push(F("PDVF.Winter.Industry.Shame", { n: cfg.knightHonor })); }
  state.industry = { done: true, worker, value: v, rows, lines, pounds };
  const content = await foundry.applications.handlebars.renderTemplate(`systems/${SYSTEM_ID}/templates/chat/battle-card.hbs`,
    { title: L("PDVF.Winter.Industry.Title"), subtitle: L("PDVF.Winter.Step.economy"), lines, buttons: [] });
  await ChatMessage.implementation.create({ speaker: ChatMessage.getSpeaker({ actor }), content, rolls, flags: { [SYSTEM_ID]: { kind: "winter" } } });
  return state;
}

/** +1 ATT jusqu'à la clôture de l'hiver suivant (retiré par « Clore l'hiver »). */
async function grantApp(actor, year) {
  const cur = actor.getFlag(SYSTEM_ID, "appBonus");
  if (cur?.until === year + 1) return;
  await actor.update({ "system.characteristics.app.value": actor._source.system.characteristics.app.value + 1 });
  await actor.setFlag(SYSTEM_ID, "appBonus", { until: year + 1, value: 1 });
}

/** À la clôture de l'hiver `year` : retire les bonus d'ATT arrivés à échéance. */
export async function expireAppBonus(actor, year) {
  const b = actor.getFlag(SYSTEM_ID, "appBonus");
  if (!b || Number(b.until) > year) return;
  await actor.update({ "system.characteristics.app.value": Math.max(0, actor._source.system.characteristics.app.value - (Number(b.value) || 1)) });
  await actor.unsetFlag(SYSTEM_ID, "appBonus");
}

/* -------------------------------------------- */
/*  Rançons                                      */
/* -------------------------------------------- */

/** Rangs proposés (Tables 12.1 à 12.5), groupés. */
export function rankChoices() {
  const T = PDVF.ransoms;
  return ["knights", "nobles", "soldiers", "clergy", "saxons", "irish", "picts"].map(g => ({
    group: L(`PDVF.Ransom.Group.${g}`),
    options: Object.keys(T[g]).map(r => ({ value: `${g}.${r}`, label: `${L(`PDVF.Ransom.Rank.${g}.${r}`)} — ${money(T[g][r])}` }))
  }));
}

function ransoms(actor) {
  return foundry.utils.deepClone(actor.getFlag(SYSTEM_ID, "ransoms") ?? []);
}

/** Captifs faits dans les batailles de l'année, ajoutés à la liste du chevalier. */
export async function importCaptives(actor, year) {
  if (!actor.isOwner) return;
  const list = ransoms(actor);
  let changed = false;
  for (const b of game.items?.filter(i => i.type === "bataille") ?? []) {
    const by = Number(b.system.year) || null;
    if (by && by !== year) continue;
    for (const k of b.system.knights ?? []) {
      if (k.uuid !== actor.uuid) continue;
      k.kills.forEach((kill, i) => {
        if (!kill.captured) return;
        const id = `${b.id}.${i}`;
        if (list.some(x => x.id === id)) return;
        list.push({ id, name: kill.name, source: b.name, text: kill.ransom ?? "", year, rank: "", proposal: null, rollLabel: "", status: "pending" });
        changed = true;
      });
    }
  }
  if (changed) await actor.setFlag(SYSTEM_ID, "ransoms", list);
}

export function ransomInfo(actor, state) {
  const list = ransoms(actor);
  const year = state.year;
  const s = actor.system;
  const own = state.ownRansom ?? null;
  const ownProposal = R.knightRansom({ klass: s.biography.knightClass, income: domainIncome(actor) }, PDVF.ransoms);
  return {
    rows: list.filter(x => x.status === "pending" || x.year === year).map(x => {
      const parsed = R.parseRansom(x.text);
      return {
        ...x, pending: x.status === "pending", canRoll: !!parsed.formula && x.proposal === null,
        proposalLabel: x.proposal !== null ? money(x.proposal) : "—",
        amountPounds: x.proposal !== null ? +(x.proposal / D).toFixed(2) : "",
        late: x.status === "pending" && x.year < year - PDVF.ransoms.delayYears,
        receivedLabel: x.received !== undefined ? money(x.received) : "",
        statusLabel: L(`PDVF.Ransom.Status.${x.status}`)
      };
    }),
    ranks: rankChoices(),
    own, ownProposal: +(ownProposal / D).toFixed(2), ownProposalLabel: money(ownProposal),
    payers: ["lord", "treasury", "family", "vassals"].map(p => ({ value: p, label: L(`PDVF.Ransom.Payer.${p}`),
      selected: p === (["household", "squire", "retainer"].includes(s.biography.knightClass) ? "lord" : s.biography.knightClass === "mercenary" ? "treasury" : "vassals") }))
  };
}

/** Ajoute un captif à la main. */
export async function addCaptive(actor, state, { name = "", rank = "" }) {
  const list = ransoms(actor);
  const [g, r] = String(rank).split(".");
  const proposal = R.ransomFor(g, r, PDVF.ransoms);
  list.push({ id: foundry.utils.randomID(), name: String(name || L("PDVF.Ransom.Captive")).slice(0, 80), source: "", text: "", year: state.year,
    rank, proposal, rollLabel: rank ? L(`PDVF.Ransom.Rank.${g}.${r}`) : "", status: "pending" });
  await actor.setFlag(SYSTEM_ID, "ransoms", list);
  return state;
}

/** Proposition : rang choisi (Tables 12.x) ou table de la rencontre tirée aux dés. */
export async function proposeRansom(actor, state, id, { rank = "", roll = false }) {
  const list = ransoms(actor);
  const x = list.find(y => y.id === id);
  if (!x || x.status !== "pending") return state;
  if (roll) {
    const parsed = R.parseRansom(x.text);
    if (!parsed.formula) return state;
    const r = await new Roll(parsed.formula.replace(/D/g, "d")).evaluate();
    await r.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: F("PDVF.Ransom.RollFlavor", { name: x.name }) });
    const row = R.ransomRow(parsed, r.total);
    x.proposal = row?.denarii ?? 0;
    x.rollLabel = row ? `${r.total} : ${row.label}` : String(r.total);
  } else if (rank) {
    const [g, rr] = rank.split(".");
    const v = R.ransomFor(g, rr, PDVF.ransoms);
    if (v === null) return state;
    x.rank = rank;
    x.proposal = v;
    x.rollLabel = L(`PDVF.Ransom.Rank.${g}.${rr}`);
  }
  await actor.setFlag(SYSTEM_ID, "ransoms", list);
  return state;
}

/**
 * Encaisse une rançon : somme ajustée (£), part du chevalier (nombre de preneurs ou part fixée),
 * payée par le captif, par le roi (captif noble : la moitié) ou par un arrangeur (la moitié tout de suite).
 */
export async function collectRansom(actor, state, id, { amount, captors = 1, share = "", payer = "captive" }) {
  const list = ransoms(actor);
  const x = list.find(y => y.id === id);
  if (!x || x.status !== "pending") return state;
  const den = Math.round((Number(String(amount).replace(",", ".")) || 0) * D);
  const shareDen = share === "" || share === null ? null : Math.round((Number(String(share).replace(",", ".")) || 0) * D);
  const take = R.ransomTake({ amount: den, captors, share: shareDen, payer }, PDVF.ransoms);
  if (take) await addPounds(actor, take / D);
  x.status = "paid";
  x.received = take;
  x.amount = den;
  x.payer = payer;
  x.paidYear = state.year;
  await actor.setFlag(SYSTEM_ID, "ransoms", list);
  await postLines(actor, L("PDVF.Ransom.Title"), [F(`PDVF.Ransom.Line.${payer}`, { name: x.name, amount: money(den), take: money(take) })]);
  return state;
}

/** Le captif est relâché sans rançon (sur parole, échange, mort…) : il sort de la liste. */
export async function releaseCaptive(actor, state, id) {
  const list = ransoms(actor);
  const x = list.find(y => y.id === id);
  if (!x || x.status !== "pending") return state;
  x.status = "released";
  x.paidYear = state.year;
  await actor.setFlag(SYSTEM_ID, "ransoms", list);
  return state;
}

/** Rançon du chevalier lui-même, s'il a été pris cette année : payée par le seigneur, son trésor, sa famille ou ses vassaux. */
export async function payOwnRansom(actor, state, { amount, payer = "lord" }) {
  if (state.ownRansom) return state;
  const pounds = Math.max(0, Number(String(amount).replace(",", ".")) || 0);
  if (payer === "treasury" && pounds) await addPounds(actor, -pounds);
  state.ownRansom = { pounds, payer };
  await postLines(actor, L("PDVF.Ransom.OwnTitle"), [F("PDVF.Ransom.OwnLine", { name: actor.name, amount: money(pounds * D), payer: L(`PDVF.Ransom.Payer.${payer}`) })]);
  return state;
}
