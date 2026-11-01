/**
 * Festins (Livre du maître, chap. 3, p. 37–44). Module pur : aucune dépendance à Foundry.
 */

const LEVELS = ["fumble", "failure", "success", "critical"];

/** Engouement de départ : vêtements du niveau de vie, +2 du chevalier Romantique, autres bonus ; jamais plus que l'ATT. */
export function startingEngouement({ living = "ordinary", romantic = false, other = 0, app = 10 }, cfg) {
  const v = (cfg.clothing[living] ?? cfg.clothing.ordinary) + (romantic ? cfg.romanticBonus : 0) + (Number(other) || 0);
  return Math.min(Number(app) || 0, v);
}

/** Modificateur de notoriété (Table 3.4). */
export function notorietyMod(glory, cfg) {
  let mod = 0;
  for (const r of cfg.notoriety) if ((Number(glory) || 0) >= r.min) mod = r.mod;
  return mod;
}

/** Nombre de cartes que l'on peut tirer pour une ATT totale (Table 3.5). */
export function cardsAllowed(total, cfg) {
  let n = 0;
  for (const r of cfg.cards) if ((Number(total) || 0) >= r.min) n = r.n;
  return n;
}

/**
 * Place d'après le test de Gloire (Table 3.3), décalée selon la taille du festin (petit : un niveau de mieux ;
 * royal : un de moins, sans descendre sous « plus loin du sel »).
 * Sur un échec critique, on refait le test (second, un échec critique y compte comme un échec) et l'on prend
 * la place d'un rang plus bas que celle de ce second test ; « plus loin du sel » devient alors le sol (−2 par tour).
 * @returns {{seat:string, fumble:boolean}}
 */
export function seatFromTest(outcome, size, { second = null } = {}) {
  const shift = Number(size?.seat) || 0;
  const place = (o) => {
    let i = LEVELS.indexOf(o);
    if (i < 1) i = 1;
    i = Math.max(1, Math.min(3, i + shift));
    return ["", "far", "near", "above"][i];
  };
  if (outcome !== "fumble") return { seat: place(outcome), fumble: false };
  if (!second) return { seat: "", fumble: true };
  const base = place(second === "fumble" ? "failure" : second);
  return { seat: { above: "near", near: "far", far: "floorFumble" }[base], fumble: true };
}

/** Rang d'une place (3 : au-dessus du sel … 0 : au sol). */
export function seatRank(seat, cfg) {
  return cfg.seats[seat]?.rank ?? 1;
}

/** Place d'un rang plus bas (céder sa place). */
export function lowerSeat(seat) {
  return { above: "near", near: "far", far: "floor", floor: "floor", floorFumble: "floorFumble" }[seat] ?? "far";
}

/**
 * Engouement d'un évènement : au-dessus du sel, les pertes dues aux évènements sont doublées.
 */
export function eventEngouement(mod, seat) {
  const m = Number(mod) || 0;
  return seat === "above" && m < 0 ? m * 2 : m;
}

/**
 * Engouement au fil du festin : on part de l'Engouement de départ et l'on applique chaque écriture
 * (places, évènements, départ), sans jamais dépasser l'ATT ; floorZero : pas au-dessous de 0 (départ manqué) ;
 * reset : tout l'Engouement accumulé est perdu.
 * @returns {{acc:number, total:number}}  acc : Engouement gagné pendant le festin (départ exclu)
 */
export function engouementState({ start = 0, entries = [], app = 10 }) {
  const cap = Number(app) || 0;
  const base = Math.min(cap, Number(start) || 0);
  let cur = base;
  for (const e of entries) {
    if (e.reset) { cur = base; continue; }
    cur += Number(e.mod) || 0;
    if (e.floorZero) cur = Math.max(0, cur);
    cur = Math.min(cap, cur);
  }
  return { acc: cur - base, total: cur };
}

/** ATT totale d'un tour : ATT + Engouement + notoriété. */
export function attTotal({ app = 10, engouement = 0, notoriety = 0 }) {
  return (Number(app) || 0) + (Number(engouement) || 0) + (Number(notoriety) || 0);
}

/**
 * Gloire du festin (Table 3.7) : (ATT + Engouement accumulé) × tours suivis, 100 au plus ;
 * l'invité le plus remarqué (seuil atteint, le plus d'Engouement, puis le plus de Gloire) gagne le bonus.
 * @param {{id:string, app:number, acc:number, rounds:number, glory:number}[]} guests
 * @returns {Object<string, {base:number, bonus:number, best:boolean}>}
 */
export function feastGlory(guests, size, cfg) {
  const out = {};
  for (const g of guests) {
    const base = Math.max(0, Math.min(cfg.maxGlory, ((Number(g.app) || 0) + (Number(g.acc) || 0)) * (Number(g.rounds) || 0)));
    out[g.id] = { base, bonus: 0, best: false };
  }
  const eligible = guests.filter(g => (Number(g.acc) || 0) >= size.threshold && (Number(g.rounds) || 0) > 0)
    .sort((a, b) => (b.acc - a.acc) || ((Number(b.glory) || 0) - (Number(a.glory) || 0)));
  if (eligible.length) {
    out[eligible[0].id].bonus = size.bonus;
    out[eligible[0].id].best = true;
  }
  return out;
}
