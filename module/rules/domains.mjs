/**
 * Domaines (Livre du maître, Table A.2 et p. 6–7, 229 ; Livre du joueur p. 23, 202).
 * Module pur : aucune dépendance à Foundry.
 */

/** Valeurs d'un rang de domaine (repli sur « vassal »). */
export function rankInfo(rank, ranks) {
  return ranks[rank] ?? ranks.vassal;
}

/**
 * Ce qu'un domaine change au rang du chevalier : nouvelle classe (jamais en dessous de l'actuelle)
 * et Gloire du titre s'il ne l'a pas encore reçue.
 * @param {object} p { rank, currentClass, titles: string[] déjà reçus }
 * @param {object} C { domainRanks, titleGlory, knightClassOrder }
 * @returns {{knightClass:string|null, title:string|null, glory:number}}
 */
export function rankChange({ rank, currentClass, titles = [] }, C) {
  const info = rankInfo(rank, C.domainRanks);
  const order = C.knightClassOrder;
  const cur = order.indexOf(currentClass);
  const next = order.indexOf(info.knightClass);
  const knightClass = next > cur ? info.knightClass : null;
  const title = titles.includes(info.title) ? null : info.title;
  return { knightClass, title, glory: title ? (C.titleGlory[title] ?? 0) : 0 };
}

/** Revenu total des domaines (£). */
export function totalIncome(domains = []) {
  return domains.reduce((s, d) => s + (Number(d.income) || 0), 0);
}

/** Gloire passive totale des domaines (Table A.2). */
export function totalPassive(domains = []) {
  return domains.reduce((s, d) => s + (Number(d.passiveGlory) || 0), 0);
}

/**
 * Aide du seigneur après une mauvaise année (Livre du joueur p. 23) : ce qui manque pour l'entretien
 * Ordinaire, avancé par le seigneur contre une faveur (Table 12.6 : F1 par livre).
 * @param {object} p { ordinary (£), treasury (£), income (£) }
 * @returns {{missing:number, favor:number}}
 */
export function lordHelp({ ordinary, treasury, income }) {
  const missing = Math.max(0, Math.round(((Number(ordinary) || 0) - (Number(treasury) || 0) - (Number(income) || 0)) * 2) / 2);
  return { missing, favor: Math.ceil(missing) };
}

/**
 * Valeur d'une faveur en terres (Table 12.6) : 1 £ de revenu par an vaut F1 ; ×10 à vie, ×20 transmissible.
 */
export function landFavor(income, tenure) {
  const v = Number(income) || 0;
  return tenure === "fief" ? 20 * v : 10 * v;
}
