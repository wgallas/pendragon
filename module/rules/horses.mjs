/**
 * Règles des chevaux (module pur) : Livre du joueur, chap. 10 et Table 14.7.
 */
import { PDVF } from "../config.mjs";
import { OUTCOME } from "./resolution.mjs";

/** Données système d'un cheval tirées de son type (Tables 10.2 à 10.4). */
export function horseFromType(typeId, extra = {}) {
  const t = PDVF.horseTypes[typeId] ?? PDVF.horseTypes.roncin;
  return {
    horseType: PDVF.horseTypes[typeId] ? typeId : "roncin",
    characteristics: { siz: { value: t.siz }, dex: { value: t.dex }, str: { value: t.str }, con: { value: t.con } },
    health: { hp: { value: t.siz + t.con } },
    move: t.move, naturalArmor: t.armor, damage: t.damage, charge: t.charge ?? "",
    warTrained: t.group === "war" || t.group === "fae",
    price: t.price,
    ...extra
  };
}

/** Test d'épuisement (Table 10.1) : effet selon le résultat du test de CON. */
export function exhaustionEffect(outcome) {
  switch (outcome) {
    case OUTCOME.CRITICAL: return "fine";
    case OUTCOME.SUCCESS: return "tired";
    case OUTCOME.FAILURE: return "exhausted";
    default: return "dead";
  }
}

/**
 * Gloire passive annuelle des chevaux d'un chevalier (Livre du joueur, chap. 10) :
 * - robe : une fois par robe possédée (blanc 50, gris 25, alezan 15, palomino 5) ;
 * - cheval de guerre principal : 15 s'il s'agit d'un étalon entraîné au combat monté avec
 *   l'Équitation requise (15), interprétation de la règle sur les étalons.
 * @param {{system: object}[]} horses
 * @param {object|null} main  cheval principal
 * @param {number} horsemanship
 */
export function horsePassiveGlory(horses, main, horsemanship) {
  const colors = new Set(horses.map(h => h.system.color));
  let colorGlory = 0;
  for (const c of colors) colorGlory += PDVF.horseColors[c]?.glory ?? 0;
  const s = main?.system;
  const war = s && s.warTrained && s.sex === "stallion" && (Number(horsemanship) || 0) >= PDVF.horseStallionSkill ? PDVF.horseWarGlory : 0;
  return { colors: colorGlory, war, total: colorGlory + war };
}

/** Prix indicatif en deniers : type, tours (+25 % chacun), robe (supplément en livres). */
export function horsePrice(system) {
  const base = Number(system.price) || 0;
  const tricks = (system.tricks?.length ?? 0) * 0.25;
  const color = PDVF.horseColors[system.color]?.price;
  return color === null ? null : Math.round(base * (1 + tricks) + (color ?? 0) * 240);
}

/** « 2 £ 6 d. » */
export function formatDenarii(d) {
  if (d === null || d === undefined) return "—";
  const l = Math.floor(d / 240);
  const rest = d - l * 240;
  if (l && rest) return `${l} £ ${rest} d.`;
  return l ? `${l} £` : `${rest} d.`;
}
