/**
 * Rançons (Livre du joueur, chap. 12 ; adversaires des batailles). Module pur, testable sans Foundry.
 */

/** Somme écrite (« 4 £ », « 60 d. », « 2,5 £ », « pas de rançon ») en deniers, ou null. */
export function parseAmount(text) {
  const t = String(text ?? "").replace(/ /g, " ");
  if (/pas de rançon|aucune/i.test(t)) return 0;
  const m = t.match(/(\d+(?:[.,]\d+)?)\s*(£|d\b|d\.)/i);
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  return m[2] === "£" ? Math.round(n * 240) : Math.round(n);
}

/**
 * Lit la rançon d'une rencontre de bataille : une somme fixe (« 5 £ ») ou une table (« 1D6 : 1 chevalier
 * pauvre 3 £ ; 2–5 chevalier de maisonnée 4 £ ; 6 chevalier vassal 10 £ »).
 * @returns {{formula:string|null, rows:{min:number,max:number,label:string,denarii:number|null}[], fixed:number|null}}
 */
export function parseRansom(text) {
  const t = String(text ?? "").trim();
  const out = { formula: null, rows: [], fixed: null, text: t };
  if (!t) return out;
  const m = t.match(/^(\d*D\d+(?:\s*[+-]\s*\d+)?)\s*:\s*(.+)$/i);
  if (!m) { out.fixed = parseAmount(t); return out; }
  out.formula = m[1].replace(/\s+/g, "");
  for (const part of m[2].split(";")) {
    const r = part.trim().match(/^(\d+)(?:\s*[–-]\s*(\d+))?\s+(.*)$/);
    if (!r) continue;
    const min = Number(r[1]);
    const max = r[2] ? Number(r[2]) : min;
    const label = r[3].replace(/,?\s*(\d+(?:[.,]\d+)?)\s*(£|d\.?)\s*$/, "").replace(/,\s*pas de rançon$/i, "").trim();
    out.rows.push({ min, max, label, denarii: parseAmount(r[3]) });
  }
  return out;
}

/** Ligne d'une table de rançon pour un jet. */
export function ransomRow(parsed, total) {
  return parsed.rows.find(r => total >= r.min && total <= r.max) ?? null;
}

/** Rançon de la Table 12.x pour un groupe et un rang, en deniers. */
export function ransomFor(group, rank, tables) {
  const v = tables?.[group]?.[rank];
  return Number.isFinite(v) ? v : null;
}

/**
 * Rançon d'un chevalier de la fiche : selon sa classe, ou la rente de ses terres s'il en a
 * (« d'une valeur semblable à ses revenus »), sans descendre sous la valeur de sa classe.
 */
export function knightRansom({ klass = "household", income = 0 }, tables) {
  const rank = tables.byClass?.[klass] ?? "household";
  const base = tables.knights[rank] ?? tables.knights.household;
  const lands = Math.round((Number(income) || 0) * 240);
  return Math.max(base, lands);
}

/**
 * Ce que touche le chevalier : sa part (somme ÷ nombre de preneurs, ou part fixée), la moitié si
 * c'est le roi (captif noble) ou un arrangeur qui paie.
 * @param {{amount:number, captors?:number, share?:number|null, payer?:"captive"|"king"|"broker"}} p
 */
export function ransomTake({ amount, captors = 1, share = null, payer = "captive" }, tables) {
  const a = Math.max(0, Number(amount) || 0);
  const mult = payer === "king" ? tables.royalShare : payer === "broker" ? tables.brokerShare : 1;
  const mine = share !== null && share !== "" && Number.isFinite(Number(share)) ? Number(share) : a / Math.max(1, Number(captors) || 1);
  return Math.round(Math.min(a, mine) * mult);
}
