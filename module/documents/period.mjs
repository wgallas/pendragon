/**
 * Période de jeu du monde : d'après l'année de jeu (réglage « Période » sur « Automatique »),
 * ou imposée par le MJ (une campagne qui avance plus vite ou plus lentement que la Grande Campagne).
 */
import { PDVF, SYSTEM_ID } from "../config.mjs";
import { periodForYear, periodReached, isNewest } from "../rules/periods.mjs";

/** Année de jeu en cours. */
export function gameYear() {
  try { return Number(game.settings.get(SYSTEM_ID, "currentYear")) || 0; } catch (err) { return 0; }
}

/**
 * Année « de période » : l'année de jeu, ramenée dans la période imposée par le MJ s'il y en a une.
 * Sert à dire ce qui est disponible ou nouveau.
 */
export function periodYear() {
  const year = gameYear();
  let forced = "auto";
  try { forced = game.settings.get(SYSTEM_ID, "period") || "auto"; } catch (err) { forced = "auto"; }
  if (forced === "auto") return year;
  const main = PDVF.periodOrder.filter(p => !p.sub);
  const i = main.findIndex(p => p.id === forced);
  if (i < 0) return year;
  const from = Number(main[i].from) || 0;
  const next = main[i + 1] ? Number(main[i + 1].from) - 1 : Infinity;
  return Math.min(Math.max(year, from), next);
}

/** Période principale en cours (identifiant). */
export function currentPeriod() {
  return periodForYear(periodYear(), PDVF.periodOrder);
}

/** Ce qui apparaît à cette période est-il déjà disponible ? */
export function periodAvailable(itemPeriod) {
  return periodReached(itemPeriod, periodYear(), PDVF.periodOrder);
}

/** Est-ce une nouveauté de la période en cours ? */
export function periodNewest(itemPeriod) {
  return isNewest(itemPeriod, periodYear(), PDVF.periodOrder);
}

/**
 * Gloire passive des nouveautés (Livre du maître, p. 232) : posséder une armure, ou un cheval, apparus
 * à la période en cours rapporte 25 points par an chacun, jusqu'à la fin de la période.
 * @param {Actor} knight
 * @param {Actor[]} horses  chevaux de l'écurie
 */
export function newestGearGlory(knight, horses = []) {
  const cfg = PDVF.newestGearGlory;
  const armor = knight.items.find(i => (i.type === "armure" || i.type === "bouclier") && periodNewest(i.system.period));
  const horse = horses.find(h => periodNewest(PDVF.horseTypes[h.system?.horseType]?.period));
  const out = { armor: armor ? cfg.armor : 0, horse: horse ? cfg.horse : 0, armorName: armor?.name ?? "", horseName: horse?.name ?? "" };
  out.total = out.armor + out.horse;
  return out;
}
