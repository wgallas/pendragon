/**
 * Règles de la phase d'hiver (Livre du joueur, chap. 14). Module pur, testable sans Foundry.
 * Les tables sont passées en paramètre (PDVF.winter).
 */

/** Test d'expérience : 1D20 supérieur à la valeur ; à 20 ou plus, il faut un 20. */
export function experienceGain(value, die) {
  const v = Number(value) || 0;
  const d = Number(die) || 0;
  return v >= 20 ? d === 20 : d > v;
}

/** Progrès d'un personnage de soutien : +1 sous 15 ; 17–20 entre 15 et 19 ; 20 à 20 et plus. */
export function supportImprovement(value, die) {
  const v = Number(value) || 0;
  if (v < 15) return 1;
  if (v < 20) return Number(die) >= 17 ? 1 : 0;
  return Number(die) === 20 ? 1 : 0;
}

/** Ce qu'il faut au chevalier : seul, avec écuyer, avec écuyer et famille. */
export function upkeepColumn({ squire, family }) {
  if (family) return "family";
  return squire ? "squire" : "alone";
}

/** Table 14.2 : niveau de vie atteint pour une somme dépensée (£). */
export function livingFromUpkeep(pounds, column, cfg) {
  const t = cfg.upkeep[column] ?? cfg.upkeep.squire;
  const p = Number(pounds) || 0;
  let level = "destitute";
  t.forEach((min, i) => { if (p >= min) level = cfg.upkeepLevels[i]; });
  return level;
}

/** Dépense minimale pour un niveau de vie. */
export function upkeepFor(level, column, cfg) {
  const i = cfg.upkeepLevels.indexOf(level);
  return i < 0 ? 0 : (cfg.upkeep[column] ?? cfg.upkeep.squire)[i];
}

/** Gloire des dépenses somptuaires (au-delà de l'entretien ordinaire de 6 £). */
export function sumptuaryGlory(pounds, cfg) {
  const extra = Math.max(0, (Number(pounds) || 0) - cfg.sumptuary.base);
  const first = Math.min(extra, cfg.sumptuary.rich);
  return Math.floor(first * cfg.sumptuary.perPound + Math.max(0, extra - first) * cfg.sumptuary.beyond);
}

/** Table 14.3 : nombre de caractéristiques touchées par le vieillissement. */
export function agingCount(roll2d6, cfg) {
  return cfg.agingCount[Number(roll2d6)] ?? 0;
}

/**
 * Vieillissement : applique les pertes (Table 14.4) avec l'infirmité.
 * Une caractéristique à 5 ou moins ne baisse plus : la CON perd le point à sa place.
 * @param {object} chars  { siz, dex, str, con, app }
 * @param {(string|null)[]} hits  caractéristiques tirées (null : aucune)
 * @returns {{chars:object, losses:object, infirm:boolean, decrepit:boolean, dead:boolean}}
 */
export function applyAging(chars, hits, cfg) {
  const c = { ...chars };
  const losses = {};
  const lose = (k) => { c[k] = (Number(c[k]) || 0) - 1; losses[k] = (losses[k] ?? 0) + 1; };
  for (const k of hits) {
    if (!k) continue;
    if (k !== "con" && c[k] <= cfg.infirmity) lose("con");
    else lose(k);
  }
  const infirm = Object.entries(c).some(([k, v]) => k !== "con" && v <= cfg.infirmity);
  const decrepit = c.con <= cfg.infirmity;
  return { chars: c, losses, infirm, decrepit, dead: c.con <= 0 };
}

/** Test de décrépitude : 1D6 supérieur à la CON, le personnage meurt. */
export function decrepitudeDeath(d6, con) {
  return Number(d6) > Number(con);
}

/** Un cheval doit-il passer le test de survie (cheval de combat ou « noble ») ? */
export function needsSurvival(horse, types, cfg) {
  const t = types[horse.horseType];
  return !!t && (cfg.survivalGroups.includes(t.group) || cfg.survivalTypes.includes(horse.horseType) || !!horse.warTrained);
}

/** Modificateur du test de survie d'un cheval. */
export function survivalModifier({ weakened = 0, living = "ordinary", destituteYears = 0, grooming = 0 }) {
  let m = -(Number(weakened) || 0) + (Number(grooming) || 0);
  if (living === "poor") m -= 1;
  if (living === "destitute") m -= Math.max(1, Number(destituteYears) || 1);
  return m;
}

/** Table 14.7 : 1 ou moins → mort ; 2 → test d'Équitation ; 3 et plus → en bonne santé. */
export function survivalResult(total) {
  const t = Number(total);
  if (t <= 1) return "dead";
  if (t === 2) return "test";
  return "fine";
}

/** Test d'Équitation sur un 2 : critique → sain ; succès → affaibli ; échec → doublement affaibli, charge −1D6 ; échec critique → mort. */
export function survivalTest(outcome) {
  return { critical: { weakened: 0 }, success: { weakened: 1, hpDice: 1 }, failure: { weakened: 2, hpDice: 2, chargeDice: -1 }, fumble: { dead: true } }[outcome]
    ?? { weakened: 1, hpDice: 1 };
}

/** Change le nombre de dés d'une formule de charge (« 6D6 » → « 5D6 »). */
export function shiftDice(formula, delta) {
  const m = String(formula ?? "").match(/^\s*(\d+)\s*[dD]\s*6(.*)$/);
  if (!m) return formula;
  return `${Math.max(1, Number(m[1]) + delta)}D6${m[2]}`;
}

/** Table 14.6 : départ d'un personnage de soutien. */
export function departure(d20, cfg) {
  return cfg.departure[Number(d20)] ?? "stays";
}

/** L'esquire part-il ? 1D20 ≤ années après 20 ans + 5. */
export function esquireLeaves(d20, age, cfg) {
  return Number(d20) <= Math.max(0, (Number(age) || 0) - 20) + cfg.esquireLeaveBase;
}

/** Valeur du test de conception (CON de la mère modifiée). */
export function conceptionTarget({ con, motherAge = null, childLastYear = false, living = "ordinary", destituteYears = 0, eventMod = 0 }, cfg) {
  let v = Number(con ?? cfg.conceptionCon) + (Number(eventMod) || 0);
  if (childLastYear) v += cfg.conceptionAfterBirth;
  if (motherAge !== null && motherAge > cfg.conceptionAgeFrom) v -= motherAge - cfg.conceptionAgeFrom;
  if (living === "poor") v -= 1;
  if (living === "destitute") v -= Math.max(1, Number(destituteYears) || 1);
  return v;
}

/** Sexe d'après un dé : impair → garçon, pair → fille. */
export function sexFromDie(d) {
  return Number(d) % 2 === 1 ? "m" : "f";
}

/** Table 14.8 : tragédie (+1 pour la première conception du couple). */
export function tragedy(d6, firstConception) {
  const r = Math.min(7, Number(d6) + (firstConception ? 1 : 0));
  if (r <= 2) return { mother: "dead", child: "dead" };
  if (r <= 4) return { mother: "dead", child: "alive" };
  if (r === 5) return { mother: "barren", child: "alive" };
  if (r === 6) return { mother: "barren", child: "dead" };
  return { mother: "barrenMarriage", child: "none" };
}

/** Table 14.11 : naissance multiple. Renvoie la liste des sexes et « identiques ». */
export function multipleBirth(d20, triplets = []) {
  const r = Number(d20);
  if (r <= 7) return { sexes: ["m", "f"], identical: false };
  if (r <= 10) return { sexes: ["f", "f"], identical: false };
  if (r <= 13) return { sexes: ["m", "m"], identical: false };
  if (r <= 16) return { sexes: ["f", "f"], identical: true };
  if (r <= 19) return { sexes: ["m", "m"], identical: true };
  const sexes = triplets.map(sexFromDie);
  return { sexes, identical: triplets.length === 3 && triplets.every(d => d === triplets[0]) };
}

/** Table 14.9 : l'enfant meurt-il ? (âge 1 : bébé ; 2 à 5 : jeune enfant ; sinon pas de test). */
export function childDies(age, d20, living, cfg) {
  const a = Number(age);
  if (a < 1 || a > 5) return null;
  const mod = cfg.childLiving[living] ?? 0;
  const roll = Number(d20) + mod;
  return a === 1 ? roll <= cfg.childDeath.baby : roll <= cfg.childDeath.young;
}

/** Table 14.10 : cause du décès. */
export function deathCause(d6) {
  const r = Number(d6);
  return r <= 3 ? "illness" : r <= 5 ? "accident" : "missing";
}

/** Embonpoint déjà pris (d'après les signes distinctifs). */
export function embonpointLevel(features, cfg) {
  const f = String(features ?? "");
  let level = 0;
  cfg.embonpoint.forEach((e, i) => { if (new RegExp(`\\b${e.feature}\\b`, "i").test(f)) level = i + 1; });
  return level;
}

/** Signes distinctifs après une prise d'embonpoint. */
export function embonpointFeatures(features, level, cfg) {
  let f = String(features ?? "");
  for (const e of cfg.embonpoint) f = f.replace(new RegExp(`\\s*,?\\s*\\b${e.feature}\\b`, "i"), "");
  const label = cfg.embonpoint[level - 1]?.feature;
  f = f.trim().replace(/^,\s*/, "");
  return label ? (f ? `${f}, ${label}` : label) : f;
}

/**
 * Solde (mercenaire) ou pension (chevalier retenu) de l'année selon la Gloire, ou null pour une autre classe.
 * @param {string} klass
 * @param {number} glory
 * @param {object} cfg  PDVF.winter
 */
export function knightPay(klass, glory, cfg) {
  const p = cfg.pay?.[klass];
  if (!p) return null;
  let pounds = p.base;
  for (const l of p.levels ?? []) if ((Number(glory) || 0) >= l.glory) pounds = l.pounds;
  return pounds;
}
