/**
 * Vie de cour : Engouement hors festin, tenues de Mode, amour courtois, séduction, ivresse.
 * Module pur, testable sans Foundry.
 */
import { compareOpposed, resolveTest, roundPendragon } from "./resolution.mjs";
import { startingEngouement } from "./feast.mjs";

/** Table 5.3 : bonus d'Engouement d'une tenue selon la dépense (£). */
export function fashionBonus(pounds, table) {
  let b = 0;
  for (const r of table) if ((Number(pounds) || 0) >= r.pounds) b = r.bonus;
  return b;
}

/** Bonus encore valable : entier l'année où la tenue est portée, puis un niveau de moins par an. */
export function fashionCurrent(fashion, year) {
  if (!fashion?.bonus || fashion.year === null || fashion.year === undefined) return 0;
  return Math.max(0, fashion.bonus - Math.max(0, (Number(year) || 0) - fashion.year));
}

/** Dépense attendue du rang (Table 5.3) : au-delà, le chevalier s'habille au-dessus de son rang. */
export function rankSpend({ klass = "household", income = 0 }, cfg) {
  const r = cfg.rankSpend;
  if (klass === "banneret") return income >= 600 ? r.richBaron : income >= 300 ? r.baron : r.banneret;
  return (Number(income) || 0) >= 50 ? r.richKnight : r.knight;
}

/**
 * Engouement à la cour : départ (vêtements du niveau de vie, Romantique, tenue de Mode, autres bonus)
 * plus ce qui a été gagné ou perdu à cette cour ; jamais plus que l'ATT.
 */
export function courtEngouement({ living = "ordinary", romantic = false, fashion = 0, other = 0, adjust = 0, app = 10 }, feastCfg) {
  const start = startingEngouement({ living, romantic, other: (Number(fashion) || 0) + (Number(other) || 0), app }, feastCfg);
  return { start, total: Math.min(Number(app) || 0, start + (Number(adjust) || 0)) };
}

/** Don de Gloire à l'être aimé : case cochée dès 10, +1 dès 100 (une fois par an). */
export function adorationGift(glory, { raisedThisYear = false } = {}, cfg) {
  const g = Number(glory) || 0;
  return { check: g >= cfg.giftCheck, raise: g >= cfg.giftRaise && !raisedThisYear };
}

/** Union consommée : l'Adoration devient Amour (conjoint ou personne) à la moitié de sa valeur. */
export function consummation(adorationValue, { married = false, beloved = "" } = {}) {
  return { name: married ? "Amour (Conjoint)" : `Amour (${beloved || "?"})`, value: roundPendragon((Number(adorationValue) || 0) / 2) };
}

/**
 * Séduire un roturier : test de Romance, puis test opposé Chaste / Luxurieux de la personne séduite.
 * @returns {"seduced"|"resisted"|"failed"}
 */
export function seductionResult(romance, chaste, lustful) {
  if (!romance.success) return "failed";
  const cmp = compareOpposed(lustful, chaste);
  return cmp.winner === "a" ? "seduced" : "resisted";
}

/** Faveurs accumulées et seuil (secret, fixé par le MJ). */
export function seductionProgress(favors = [], threshold = null) {
  const total = favors.reduce((t, f) => t + (Number(f.value) || 0), 0);
  return { total, reached: threshold !== null && threshold !== undefined && threshold !== "" && total >= Number(threshold) };
}

/* -------------------------------------------- */
/*  Ivresse (Tables 3.11 et 3.12)                */
/* -------------------------------------------- */

/** Modificateur du test de Bon-vivant. */
export function drinkModifier({ drink = "beer", enemies = false, royal = false, extra = 0 }, cfg) {
  return (cfg.drinks[drink] ?? 0) + (enemies ? cfg.enemies : 0) + (royal ? cfg.royal : 0) + (Number(extra) || 0);
}

/** Table 3.11 : état d'après le test de Bon-vivant. */
export function drunkLevel(outcome) {
  return { critical: "deadDrunk", success: "drunk", failure: "sober", fumble: "immune" }[outcome] ?? "sober";
}

/** Modificateur du test d'Énergique (toutes les deux heures). */
export function energeticModifier({ level = "sober", debilitated = false }, cfg) {
  return (cfg.energetic[level] ?? 0) + (debilitated ? cfg.energetic.debilitated : 0);
}

/** Table 3.12 : niveau d'activité ; le pire résultat des tests précédents compte (critique : redevenu sobre). */
export function nextActivity(current, outcome, cfg) {
  if (outcome === "critical") return { activity: "", sober: true };
  const res = { success: "groggy", failure: "unconscious", fumble: "comatose" }[outcome] ?? "";
  const order = cfg.activityOrder;
  return { activity: order.indexOf(res) > order.indexOf(current ?? "") ? res : (current ?? ""), sober: false };
}

/**
 * État du jour : ivresse et niveau d'activité valent le jour où l'on a bu ; la gueule de bois le jour où
 * elle a été constatée. `today` : jour du monde.
 */
export function drinkState(drunk, today) {
  const d = drunk ?? {};
  const same = Number(d.day) === Number(today);
  return {
    level: same ? (d.level || "sober") : "sober",
    immune: same && !!d.immune,
    activity: same ? (d.activity || "") : "",
    hangoverPending: !same && Number(d.day) === Number(today) - 1 && !!d.passedOut && !d.hangoverChecked,
    hangover: Number(d.hangoverDay) === Number(today) && !!d.hangover,
    comatose: same && d.activity === "comatose"
  };
}

/**
 * Modificateur d'un test selon l'ivresse, l'activité et la gueule de bois.
 * Compétences : malus généraux, Romance et Éloquence favorisées par l'ivresse.
 * Traits : Luxurieux, Téméraire, Bon-vivant, Valeureux favorisés ; leurs opposés défavorisés.
 * @param {string} key  « skill.x », « trait.x.left|right »…
 * @returns {{value:number, parts:{label:string, value:number}[]}}
 */
export function conditionModifier(state, key, cfg) {
  const parts = [];
  const [kind, id, side] = String(key).split(".");
  const lv = cfg.levels[state.level];
  if (lv) {
    if (kind === "skill") parts.push({ label: state.level, value: lv.boosted[id] ?? lv.skills });
    if (kind === "trait") {
      const own = lv.traits[`${id}.${side}`];
      const other = lv.traits[`${id}.${side === "left" ? "right" : "left"}`];
      if (own) parts.push({ label: state.level, value: own });
      else if (other) parts.push({ label: state.level, value: -other });
    }
  }
  if (kind === "skill" && cfg.activity[state.activity]) parts.push({ label: state.activity, value: cfg.activity[state.activity] });
  if (kind === "skill" && state.hangover) parts.push({ label: "hangover", value: cfg.hangover.penalty });
  return { value: parts.reduce((t, p) => t + p.value, 0), parts };
}

/** Pas de croix d'expérience pour les compétences en état d'ivresse. */
export function noSkillXp(state) {
  return state.level === "drunk" || state.level === "deadDrunk";
}

export { resolveTest };
