/**
 * Règles des suivants (module pur) : écuyers et valeurs dérivées des PNJ.
 * Livre du joueur, chap. 12 (écuyers, Table 12.7) ; formules des caractéristiques dérivées, chap. 3.
 */
import { PDVF } from "../config.mjs";
import { roundPendragon } from "./resolution.mjs";

/** Origine de l'écuyer d'après 1D20 (Table 12.7). */
export function squireOriginFromRoll(roll) {
  return PDVF.squireOrigins.find(o => o.range && roll >= o.range[0] && roll <= o.range[1]) ?? PDVF.squireOrigins[2];
}

export function squireOrigin(id) {
  return PDVF.squireOrigins.find(o => o.id === id) ?? PDVF.squireOrigins.find(o => o.id === "secondSon");
}

/** Âge de départ : 1D20, 14 ans pour un résultat de 14 ou moins. */
export function squireAgeFromRoll(roll) {
  return Math.max(14, Number(roll) || 14);
}

/** Compétence Écuyer : 15 + modificateur d'origine. */
export function squireSkill(originId) {
  return PDVF.squireSkillBase + squireOrigin(originId).squire;
}

/** Compétences chevaleresques de l'écuyer : âge − 9 + modificateur d'origine (0 au moins). */
export function squireKnightly(age, originId) {
  if (age === null || age === undefined || Number.isNaN(Number(age))) return null;
  return Math.max(0, Number(age) - PDVF.squireKnightlyOffset + squireOrigin(originId).knightly);
}

/** Caractéristiques dérivées (mêmes formules que pour le chevalier). */
export function derivedValues(c) {
  const v = (k) => Number(c?.[k]) || 0;
  const hp = v("con") + v("siz");
  const damage = roundPendragon((v("str") + v("siz")) / 6);
  return {
    hp,
    knockdown: v("siz"),
    majorWound: v("con"),
    unconscious: roundPendragon(hp / 4),
    move: roundPendragon((v("str") + v("dex")) / 2) + 5,
    healRate: roundPendragon(v("con") / 5),
    damage: `${damage}D6`
  };
}

/** Normalise un libellé pour comparer des noms (casse, accents, espaces). */
export function normalizeLabel(s) {
  return String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
}
