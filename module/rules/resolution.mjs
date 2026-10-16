/**
 * Résolution des tests de Pendragon (chapitre 2 du Livre du joueur).
 * Module pur, sans dépendance à Foundry, pour pouvoir être testé seul.
 */

export const OUTCOME = Object.freeze({
  CRITICAL: "critical",
  SUCCESS: "success",
  FAILURE: "failure",
  FUMBLE: "fumble"
});

/**
 * Valeur effective d'un Attribut après modificateur.
 * - au-delà de 20, l'excédent devient un bonus de critique (+x) ;
 * - en dessous de 0, la valeur vaut 0 mais chaque point manquant élargit
 *   la plage d'échec critique.
 * @param {number} value  valeur de base
 * @param {number} [modifier=0]
 */
export function effectiveTarget(value, modifier = 0) {
  const total = Math.round(Number(value || 0) + Number(modifier || 0));
  const target = Math.max(0, Math.min(20, total));
  const critBonus = Math.max(0, total - 20);
  const fumbleFrom = total < 0 ? Math.max(1, 20 + total) : 20;
  return { total, target, critBonus, fumbleFrom };
}

/**
 * Résultat d'un d20 contre une valeur.
 * @param {number} value
 * @param {number} modifier
 * @param {number} die  résultat brut du d20 (1–20)
 * @returns {{die:number, adjusted:number, target:number, critBonus:number, total:number, outcome:string, success:boolean}}
 */
export function resolveTest(value, modifier, die) {
  const { total, target, critBonus, fumbleFrom } = effectiveTarget(value, modifier);
  const adjusted = die + critBonus;
  let outcome;
  if (target >= 20) {
    // Valeur 20 ou plus : aucun échec critique possible.
    outcome = adjusted >= 20 ? OUTCOME.CRITICAL : OUTCOME.SUCCESS;
  } else if (target > 0 && die === target) {
    outcome = OUTCOME.CRITICAL;
  } else if (target > 0 && die < target) {
    outcome = OUTCOME.SUCCESS;
  } else if (die >= fumbleFrom) {
    outcome = OUTCOME.FUMBLE;
  } else {
    outcome = OUTCOME.FAILURE;
  }
  const success = outcome === OUTCOME.CRITICAL || outcome === OUTCOME.SUCCESS;
  return { die, adjusted, target, critBonus, total, outcome, success };
}

/**
 * Comparaison de deux tests (résolution avec opposition).
 * Tous les critiques se valent et battent les succès normaux.
 * @returns {{a:string, b:string, winner:"a"|"b"|null, kind:string}}
 *   kind : "victory" | "tie" | "mutualFailure"
 *   a/b  : "victory" | "partial" | "defeat" | "tie" | "failure"
 */
export function compareOpposed(a, b) {
  if (!a.success && !b.success) {
    return { a: "failure", b: "failure", winner: null, kind: "mutualFailure" };
  }
  if (a.success && !b.success) return { a: "victory", b: "defeat", winner: "a", kind: "victory" };
  if (!a.success && b.success) return { a: "defeat", b: "victory", winner: "b", kind: "victory" };

  const aCrit = a.outcome === OUTCOME.CRITICAL;
  const bCrit = b.outcome === OUTCOME.CRITICAL;
  if (aCrit && bCrit) return { a: "tie", b: "tie", winner: null, kind: "tie" };
  if (aCrit) return { a: "victory", b: "partial", winner: "a", kind: "victory" };
  if (bCrit) return { a: "partial", b: "victory", winner: "b", kind: "victory" };
  if (a.adjusted === b.adjusted) return { a: "tie", b: "tie", winner: null, kind: "tie" };
  return a.adjusted > b.adjusted
    ? { a: "victory", b: "partial", winner: "a", kind: "victory" }
    : { a: "partial", b: "victory", winner: "b", kind: "victory" };
}

/**
 * Opposition fixe (enfoncer une porte de valeur 15…) : il faut réussir ET
 * dépasser la valeur fixe ; un critique l'emporte toujours.
 */
export function resolveFixed(result, fixedValue) {
  if (!result.success) return "defeat";
  if (result.outcome === OUTCOME.CRITICAL) return "victory";
  return result.adjusted > fixedValue ? "victory" : "defeat";
}

/** Niveau d'un trait ou d'une passion. */
export function attributeLevel(value) {
  const v = Number(value || 0);
  if (v > 20) return "exalted";
  if (v >= 16) return "famous";
  if (v >= 5) return "normal";
  return "unknown";
}

/** Affichage « 20 (+3) » des valeurs au-delà de 20. */
export function formatValue(value) {
  const v = Math.round(Number(value || 0));
  return v > 20 ? `20 (+${v - 20})` : String(Math.max(0, v));
}

/** Arrondi du livre : ,5 et plus à l'entier supérieur. */
export function roundPendragon(x) {
  return Math.floor(x + 0.5);
}

/**
 * Valeurs d'une paire de traits à partir de la valeur stockée (côté gauche).
 * La somme vaut toujours 20 ; un trait Exalté porte l'excédent en bonus.
 */
export function traitPair(stored) {
  const v = Math.round(Number(stored ?? 10));
  return { left: Math.max(0, v), right: Math.max(0, 20 - v) };
}

/**
 * Procédure de test de trait (Livre du joueur, « Résultats du test de trait »).
 * @param {object} first   résultat du premier trait testé
 * @param {object|null} second  résultat du trait opposé, s'il a fallu le tester
 * @returns {{acts:"first"|"second"|"player", strongly:boolean, xp:"first"|"second"|null, needSecond:boolean}}
 */
export function traitProcedure(first, second = null) {
  switch (first.outcome) {
    case OUTCOME.CRITICAL: return { acts: "first", strongly: true, xp: "first", needSecond: false };
    case OUTCOME.SUCCESS: return { acts: "first", strongly: false, xp: null, needSecond: false };
    case OUTCOME.FUMBLE: return { acts: "second", strongly: true, xp: "second", needSecond: false };
  }
  if (!second) return { acts: null, strongly: false, xp: null, needSecond: true };
  switch (second.outcome) {
    case OUTCOME.CRITICAL: return { acts: "second", strongly: true, xp: "second", needSecond: false };
    case OUTCOME.SUCCESS: return { acts: "second", strongly: false, xp: null, needSecond: false };
    case OUTCOME.FUMBLE: return { acts: "first", strongly: true, xp: "first", needSecond: false };
    default: return { acts: "player", strongly: false, xp: null, needSecond: false };
  }
}

/** Effets d'un test de passion sans opposition (Table 4.2). */
export function passionEffect(outcome) {
  switch (outcome) {
    case OUTCOME.CRITICAL: return { state: "impassioned", bonus: 10, xp: true, loss: 0, crisis: false };
    case OUTCOME.SUCCESS: return { state: "inspired", bonus: 5, xp: true, loss: 0, crisis: false };
    case OUTCOME.FAILURE: return { state: "crisis", bonus: 0, xp: false, loss: 0, crisis: true };
    default: return { state: "loss", bonus: 0, xp: false, loss: 1, crisis: false };
  }
}

/** Effets d'un test de crise de passion (« De peine et de chagrin »). */
export function crisisEffect(outcome) {
  switch (outcome) {
    case OUTCOME.CRITICAL: return { state: "madness", loss: 0 };
    case OUTCOME.SUCCESS: return { state: "melancholy", loss: 0 };
    case OUTCOME.FAILURE: return { state: "none", loss: 0 };
    default: return { state: "loss", loss: 1 };
  }
}

/** Durée d'une Mélancolie ou d'une Folie selon le niveau non modifié de la passion. */
export function afflictionDuration(level, state) {
  const table = {
    unknown: { melancholy: "1D6 heures", madness: "1 semaine" },
    normal: { melancholy: "1 jour", madness: "1D6 semaines" },
    famous: { melancholy: "1D6 jours", madness: "1D6 mois" },
    exalted: { melancholy: "1D6 semaines", madness: "1D6 années" }
  };
  return table[level]?.[state] ?? "";
}

/** Gloire passive annuelle des traits/passions (15 Célèbre, 25 Exalté, 100 max par catégorie). */
export function passiveGloryFromValues(values) {
  let sum = 0;
  for (const v of values) {
    const level = attributeLevel(v);
    if (level === "famous") sum += 15;
    else if (level === "exalted") sum += 25;
  }
  return Math.min(100, sum);
}

/** Gloire passive due à l'Attrait. */
export function passiveGloryFromAppearance(app) {
  const a = Number(app || 0);
  if (a >= 19) return 50;
  if (a >= 16) return 25;
  if (a >= 13) return 10;
  return 0;
}

/** Valeur du test de Gloire : Gloire / 1000 arrondie. */
export function gloryTestValue(glory) {
  return roundPendragon(Number(glory || 0) / 1000);
}
