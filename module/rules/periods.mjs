/**
 * Périodes de la Grande Campagne (module pur) : période d'une année, et disponibilité de ce qui
 * apparaît à une période donnée (équipement, chevaux, aménagements des manoirs).
 */

/**
 * Période (identifiant) d'une année de jeu.
 * @param {number} year
 * @param {{id:string, from:number, sub?:boolean}[]} order  PDVF.periodOrder
 * @param {object} [opts]
 * @param {boolean} [opts.sub]  garder les sous-périodes (« fin de l'Enfant-roi ») ; sinon la période principale
 */
export function periodForYear(year, order = [], { sub = false } = {}) {
  const y = Number(year) || 0;
  let found = order[0]?.id ?? "boyKing";
  for (const p of order) {
    if (p.sub && !sub) continue;
    if (y >= (Number(p.from) || 0)) found = p.id;
  }
  return found;
}

/** Rang d'une période dans l'ordre (−1 pour « toutes » ou inconnue). */
export function periodRank(id, order = []) {
  return order.findIndex(p => p.id === id);
}

/**
 * Ce qui apparaît à la période `itemPeriod` est-il disponible à l'année `year` ?
 * « all » (ou rien) : toujours. Les sous-périodes comptent par leur année.
 */
export function periodReached(itemPeriod, year, order = []) {
  if (!itemPeriod || itemPeriod === "all") return true;
  const p = order.find(x => x.id === itemPeriod);
  if (!p) return true;
  return (Number(year) || 0) >= (Number(p.from) || 0);
}

/**
 * La nouveauté est-elle celle de la période en cours (Gloire passive de l'équipement le plus récent,
 * Livre du maître p. 232) ? Vrai si elle est apparue dans la période principale de cette année.
 */
export function isNewest(itemPeriod, year, order = []) {
  if (!itemPeriod || itemPeriod === "all") return false;
  const current = periodForYear(year, order);
  const main = (id) => {
    const i = order.findIndex(x => x.id === id);
    for (let k = i; k >= 0; k--) if (!order[k].sub) return order[k].id;
    return id;
  };
  return main(itemPeriod) === current && periodReached(itemPeriod, year, order);
}
