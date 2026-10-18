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

/* -------------------------------------------- */
/*  Le manoir (Noble's Handbook, chap. 3)        */
/* -------------------------------------------- */

/** Bonus de Lettres au test de Gestion (Livre du joueur p. 111) : +1 de 1 à 5, +2 de 6 à 10, etc. */
export function literacyBonus(literacy) {
  const l = Number(literacy) || 0;
  return l > 0 ? Math.ceil(l / 5) : 0;
}

/** Modificateur fixe du test de Gestion (Table 3.3) : guerre et brownie ; le temps se lance à part (±1D3). */
export function stewardshipModifier({ war = "none", brownie = "none" }, M) {
  return (M.war[war] ?? 0) + (M.brownie[brownie] ?? 0);
}

/** Récolte (Table 3.2) : fonds privés pour ce domaine, famine comprise. */
export function harvestPrivy(outcome, manors, famine, M) {
  const base = M.harvest[outcome]?.privy ?? 0;
  return (base - (famine ? M.famine.privyLoss : 0)) * Math.max(1, Number(manors) || 1);
}

/**
 * Suivi des mauvaises récoltes : deux échecs critiques de suite amènent la famine l'année suivante
 * (sauf 1 £ par manoir payé) ; la famine dure jusqu'à la prochaine récolte exceptionnelle.
 * @param {object} prev { fumbles, famine, famineNext }
 * @returns {{fumbles:number, famine:boolean, famineNext:boolean, famineStarts:boolean, famineThreat:boolean, famineEnds:boolean}}
 */
export function nextHarvestState(prev = {}, outcome) {
  let famine = !!prev.famine;
  let famineStarts = false;
  if (prev.famineNext) { famine = true; famineStarts = true; }
  let famineEnds = false;
  if (outcome === "critical" && famine && !famineStarts) { famine = false; famineEnds = true; }
  const fumbles = outcome === "fumble" ? (Number(prev.fumbles) || 0) + 1 : 0;
  const famineThreat = fumbles >= 2;
  return { fumbles, famine, famineNext: famineThreat, famineStarts, famineThreat, famineEnds };
}

/** Événements de la Grande Campagne (p. 69) : fonds privés par manoir pour l'année. */
export function periodPrivy(year, M) {
  const out = [];
  for (const p of M.periods) {
    if (year < p.from || year > p.to) continue;
    if (p.privyPerYear) out.push({ id: p.id, privy: Math.max(p.max, p.privyPerYear * (year - p.from + 1)) });
    else out.push({ id: p.id, privy: p.privy });
  }
  return out;
}

/** Fonds privés des aménagements (investissements payés, particularités, embellissements). */
export function improvementsPrivy(sys, M) {
  const built = (sys.investments ?? []).filter(i => i.paid >= (i.cost ?? M.investmentCost) && !i.destroyed);
  let total = built.length * M.investmentPrivy;
  const has = (id) => built.some(i => i.type === id);
  if (has("armory") && has("ironMine")) total += 1;
  for (const f of sys.features ?? []) {
    const def = M.features.find(x => x.id === f.type);
    if (!def) continue;
    total += def.privy ?? 0;
    if (def.bonusFor && has(def.bonusFor)) total += 1;
  }
  for (const e of sys.enhancements ?? []) {
    const def = M.enhancements.find(x => x.id === e.type);
    if (def?.privy && e.paid >= (e.cost ?? M.enhancementCost) && !e.ruined) total += def.privy;
  }
  return total;
}

/** Entretien annuel des embellissements bâtis (2 £ chacun ; rien pour ceux bâtis ou réparés cette année). */
export function enhancementUpkeep(sys, M, year = null) {
  return (sys.enhancements ?? []).filter(e => e.paid >= (e.cost ?? M.enhancementCost) && !e.ruined && (year == null || e.lastPaid !== year)).length * M.enhancementUpkeep;
}

/** Gage d'un professionnel selon sa compétence clé (16–19 : +1 £, 20 : +2 £). */
export function professionalPay(p, M) {
  const def = M.professionals.find(x => x.id === p.type);
  const base = Number(p.cost ?? def?.cost ?? 0) || 0;
  const raise = M.professionalRaise.find(r => (Number(p.skill) || 0) >= r.min)?.plus ?? 0;
  return base + raise;
}

/** Gages de tous les professionnels et des soldats engagés. */
export function staffCost(sys, M) {
  const pros = (sys.professionals ?? []).reduce((s, p) => s + professionalPay(p, M), 0);
  const hired = (sys.soldiers ?? []).reduce((s, r) => s + (M.soldiers[r.type] ?? 0) * (Number(r.count) || 0), 0);
  return pros + hired;
}

/** Mesnie de droit (servitum debitum) : par tranche de 10 £ de rente, 2 lanciers et 1 soldat de garnison. */
export function mesnieDue(rent, M) {
  const n = Math.floor((Number(rent) || 0) / 10);
  return Object.fromEntries(Object.entries(M.mesniePer10).map(([k, v]) => [k, v * n]));
}

/** Gloire de la suite : 1 point par livre de gages des professionnels qui suivent le chevalier, 100 au plus. */
export function entourageGlory(professionals, M) {
  return Math.min(M.entourageGloryMax, Math.floor(professionals.filter(p => p.entourage).reduce((s, p) => s + professionalPay(p, M), 0)));
}

/** Valeur défensive : la meilleure salle, les toits, puis les défenses. */
export function defensiveValue(sys, M) {
  let hall = M.baseHallDv;
  let roofs = 0;
  for (const i of sys.improvements ?? []) {
    const def = M.improvements.find(x => x.id === i.type);
    if (def?.hall) hall = Math.max(hall, def.hall);
    if (def?.dv) roofs += def.dv;
  }
  const defenses = (sys.defenses ?? []).reduce((s, d) => s + (Number(M.defenses.find(x => x.id === d.type)?.dv) || 0), 0);
  return hall + roofs + defenses;
}

/** Nombre de jets sur la Table 3.4 : un par tranche complète de 5 £ de rente. */
export function improvementRolls(rent, M) {
  return Math.floor((Number(rent) || 0) / M.improvementEvery);
}

/** Un investissement de ce type peut-il encore être bâti ? (un de chaque par tranche de 10 £ de rente) */
export function canInvest(sys, type) {
  const max = Math.max(1, Math.floor((Number(sys.income) || 0) / 10));
  return (sys.investments ?? []).filter(i => i.type === type).length < max;
}

/** Entrée d'une table au D20 (r : nombre ou [min, max]). */
export function tableEntry(list, die) {
  return list.find(x => Array.isArray(x.r) ? die >= x.r[0] && die <= x.r[1] : x.r === die) ?? null;
}

/**
 * Entretien de la maisonnée payé par les terres : celui du plus haut rang tenu (Table A.2).
 * @param {Function} [forLevel] dépense du niveau de vie du rang pour la maisonnée (Table 14.2) ;
 *   à défaut (ou au-delà de Somptueux), l'entretien de la Table A.2.
 */
export function landsUpkeep(domains, ranks, forLevel = null) {
  return domains.reduce((m, d) => {
    const r = ranks[d.rank];
    if (!r) return m;
    return Math.max(m, (forLevel?.(r) || 0) || r.upkeep || 0);
  }, 0);
}

/**
 * Fonds privés d'un domaine pour l'année : récolte (× manoirs), famine, périodes, peste,
 * investissements et particularités.
 * @returns {{harvest:object, parts:{id:string, label?:string, value:number}[], total:number}}
 */
export function privyBreakdown(sys, outcome, year, { pestilence = "none" } = {}, M) {
  const manors = Math.max(1, Number(sys.manors) || 1);
  const harvest = nextHarvestState(sys.harvest ?? {}, outcome);
  const parts = [{ id: "harvest", value: (M.harvest[outcome]?.privy ?? 0) * manors }];
  if (harvest.famine) parts.push({ id: "famine", value: -M.famine.privyLoss * manors });
  for (const p of periodPrivy(Number(year) || 0, M)) parts.push({ id: "period", label: p.id, value: p.privy * manors });
  if (M.pestilence[pestilence]) parts.push({ id: "period", label: "pestilence", value: M.pestilence[pestilence] * manors });
  const imp = improvementsPrivy(sys, M);
  if (imp) parts.push({ id: "improvements", value: imp });
  return { harvest, parts, total: parts.reduce((s, p) => s + p.value, 0) };
}

/** Clé d'attribut testable pour une case « check » de table (trait, compétence ; passion par motif). */
export function checkKey(c) {
  if (!c) return "";
  if (typeof c === "string") return c;
  if (c.kind === "trait") return `trait.${c.id}.${c.side}`;
  if (c.kind === "skill") return `skill.${c.id}`;
  if (c.kind === "passion") return `passion:${c.prefix}`;
  return "";
}

/** Un embellissement bâti et entretenu donne-t-il son test cette année ? (entretien payé l'hiver précédent) */
export function enhancementActive(e, year, M) {
  if (e.ruined || (Number(e.paid) || 0) < (e.cost ?? M.enhancementCost)) return false;
  return e.lastPaid == null || e.lastPaid >= year - 1;
}

/**
 * Tests annuels des embellissements actifs (et des investissements qui en donnent : chasse gardée,
 * garenne, rucher), sans doublon.
 * @param {object[]} domains données système des domaines
 * @param {boolean} pagan les variantes païennes s'appliquent
 */
export function annualChecks(domains, year, M, { pagan = false } = {}) {
  const keys = new Set();
  for (const sys of domains) {
    for (const e of sys.enhancements ?? []) {
      if (!enhancementActive(e, year, M)) continue;
      const def = M.enhancements.find(x => x.id === e.type);
      const list = e.check ? e.check.split(",").map(s => s.trim()) : ((pagan && def?.pagan) ? def.pagan : def?.check ?? []).map(checkKey);
      list.filter(Boolean).forEach(k => keys.add(k));
    }
    for (const i of sys.investments ?? []) {
      if (i.destroyed || (Number(i.paid) || 0) < (i.cost ?? M.investmentCost)) continue;
      const def = M.investments.find(x => x.id === i.type);
      if (!def?.check) continue;
      // chasse gardée : une seule des deux compétences, choisie à la construction
      const list = i.check ? [i.check] : def.id === "chace" ? [checkKey(def.check[0])] : def.check.map(checkKey);
      list.forEach(k => keys.add(k));
    }
  }
  return [...keys];
}

/**
 * Entretien des embellissements à l'hiver : payés, ils restent actifs ; sinon, une deuxième année
 * sans entretien les met en ruine.
 * @returns {object[]} les embellissements mis à jour, avec « ruinedNow » pour ceux qui tombent
 */
export function maintainEnhancements(list, year, pay, M) {
  return (list ?? []).map(e => {
    const built = (Number(e.paid) || 0) >= (e.cost ?? M.enhancementCost);
    if (!built || e.ruined || e.lastPaid === year) return { ...e };
    if (pay) return { ...e, lastPaid: year };
    const last = e.lastPaid ?? year - 1;
    if (last < year - 1) return { ...e, ruined: true, ruinedNow: true };
    return { ...e, lastPaid: e.lastPaid ?? year - 1 };
  });
}

/** Paysans pressurés : traits cochés (obligatoires à 16 et plus), 1 £ par trait et par manoir. */
export function squeezeTraits(traits, M) {
  return M.peasantry.squeezeTraits.map(t => {
    const left = Number(traits?.[t.id]?.value) || 0;
    const value = t.side === "left" ? left : 20 - left;
    return { key: checkKey(t), id: t.id, side: t.side, value, forced: value >= 16 };
  });
}

/** Somme versée sur un investissement : bornée par le reste à payer. */
export function fundAmount(inv, amount, M) {
  const left = Math.max(0, (inv.cost ?? M.investmentCost) - (Number(inv.paid) || 0));
  return Math.max(0, Math.min(left, Number(amount) || 0));
}
