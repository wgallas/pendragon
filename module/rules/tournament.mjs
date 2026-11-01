/**
 * Tournois (Livre du maître, chap. 3, p. 51–59). Module pur : aucune dépendance à Foundry.
 * Taille et difficulté, procédure abrégée (Table 3.16), joute passe par passe (Table 3.17),
 * Gloire, trophées (Table 3.18).
 */
import { compareOpposed, roundPendragon } from "./resolution.mjs";

/** Ligne d'une table à bornes { min, max } (ou { roll: [min, max] }) pour un résultat. */
function rowFor(rows, value) {
  return rows.find(r => value >= r.min && value <= r.max) ?? null;
}

/** Taille d'après le tirage (Table 3.13) ; au-delà du dernier seuil, la plus grande taille tirable. */
export function sizeFromRoll(total, sizes) {
  const entries = Object.entries(sizes).filter(([, s]) => s.roll);
  for (const [id, s] of entries) if (total >= s.roll[0] && total <= s.roll[1]) return id;
  return total < entries[0][1].roll[0] ? entries[0][0] : entries.at(-1)[0];
}

/** Modificateur de NDT (Table 3.15). */
export function difficultyFromRoll(total, table) {
  return rowFor(table, total) ?? table.at(-1);
}

/** Niveau de difficulté du tournoi : la plus faible Charge des PJ, plus le modificateur. */
export function difficultyLevel(charges = [], mod = 0) {
  const list = charges.map(Number).filter(Number.isFinite);
  if (!list.length) return null;
  return Math.min(...list) + (Number(mod) || 0);
}

/**
 * Ligne de la Table 3.16 pour le PJ, d'après son test opposé au NDT.
 * Les deux échecs (sans échec critique) comptent comme une égalité.
 * @returns {"critical"|"winner"|"tie"|"partial"|"loser"|"fumble"}
 */
export function abridgedRow(pc, ndt) {
  if (pc.outcome === "fumble") return "fumble";
  const cmp = compareOpposed(pc, ndt);
  if (pc.outcome === "critical" && ndt.outcome !== "critical") return "critical";
  switch (cmp.a) {
    case "victory": return "winner";
    case "partial": return "partial";
    case "defeat": return "loser";
    default: return "tie";
  }
}

/** Gloire d'une épreuve abrégée : multiple de la Gloire des participants, ou Gloire du champion. */
export function abridgedGlory(row, size, cfg) {
  const r = cfg[row];
  if (!r) return 0;
  if (r.glory === "champion") return size.champion;
  return roundPendragon(size.glory * (r.mult ?? 1));
}

/** Gloire en combat (Table A.1) d'un adversaire de cette valeur. */
export function combatGlory(value, table) {
  const v = Number(value) || 0;
  return (table.find(r => v <= r.max) ?? table.at(-1)).glory;
}

/**
 * Gloire d'une rencontre de joute gagnée : le dixième de la Gloire en combat de l'adversaire (sa Charge),
 * la moitié avec des lances émoussées ; au moins 1.
 */
export function joustGlory(opponentCharge, { blunted = true } = {}, table) {
  const g = combatGlory(opponentCharge, table) / 10;
  return Math.max(1, roundPendragon(blunted ? g / 2 : g));
}

/** Adversaire tiré sur la Table 3.14 (1D20 + tour de joute). */
export function opponentFromRoll(total, table) {
  return rowFor(table, total) ?? table.at(-1);
}

/** Trophée de la Table 3.18 (1D20 + modificateur de taille). */
export function prizeFromRoll(total, table) {
  const t = Math.max(table[0].r, Math.min(table.at(-1).r, total));
  return table.find(p => p.r === t) ?? table.at(-1);
}

/** Gloire d'un test de compétence de cour réussi : l'ATT, doublée sur un critique ou devant le roi. */
export function courtGlory(app, outcome, { royal = false } = {}) {
  if (outcome !== "critical" && outcome !== "success") return 0;
  const g = Number(app) || 0;
  return outcome === "critical" || royal ? g * 2 : g;
}

/* -------------------------------------------- */
/*  Joute : une passe (Table 3.17)              */
/* -------------------------------------------- */

/**
 * Ce que produit une passe, avant les tests de DEX, d'Équitation et les tirages des échecs critiques.
 * @param {object} a  résultat du test de Charge de « a » (resolveTest)
 * @param {object} b  résultat de « b »
 * @returns {{kind:string, a:object, b:object}}
 *   kind : critical | winner | doubleCritical | doubleSuccess | doubleFailure | doubleFumble ;
 *   pour chaque côté : { breaks: bool, breaksIfOdd: bool, hit: bool (il est touché), unhorsed: bool (désarçonné d'office),
 *   fallDice: "" (dégâts de chute d'office), dexTest: bool, rideTest: "" (horseDown | crushed), fumble: bool (tirage 1D20) }
 */
export function joustPass(a, b) {
  const side = () => ({ breaks: false, breaksIfOdd: false, hit: false, unhorsed: false, fallDice: "", dexTest: false, rideTest: "", fumble: false });
  const out = { kind: "", a: side(), b: side() };
  const aFum = a.outcome === "fumble";
  const bFum = b.outcome === "fumble";
  if (aFum && bFum) { out.kind = "doubleFumble"; return out; }
  const cmp = compareOpposed(a, b);
  const crit = (r) => r.outcome === "critical";
  if (cmp.kind === "tie") {
    if (crit(a) && crit(b)) {
      out.kind = "doubleCritical";
      out.a.breaks = out.b.breaks = true;
      out.a.rideTest = out.b.rideTest = "horseDown";
    } else {
      out.kind = "doubleSuccess";
      out.a.breaks = out.b.breaks = true;
      out.a.hit = out.b.hit = true;
      out.a.dexTest = out.b.dexTest = true;
    }
    return out;
  }
  if (cmp.kind === "mutualFailure") {
    out.kind = "doubleFailure";
    out.a.fumble = aFum;
    out.b.fumble = bFum;
    return out;
  }
  const [w, l, wr, lr] = cmp.winner === "a" ? ["a", "b", a, b] : ["b", "a", b, a];
  const W = out[w];
  const Lo = out[l];
  W.breaks = true;
  Lo.hit = true;
  if (crit(wr)) {
    out.kind = "critical";
    Lo.unhorsed = true;
    Lo.fallDice = "2D6";
    Lo.rideTest = "crushed";
  } else {
    out.kind = "winner";
    Lo.dexTest = true;
  }
  if (lr.success) {
    // Réussite partielle : le gagnant est touché, la lance du perdant se brise si son dé est impair.
    W.hit = true;
    Lo.breaksIfOdd = true;
  }
  if (lr.outcome === "fumble") Lo.fumble = true;
  return out;
}

/**
 * Échec critique d'une passe (1D20). barrier : présence d'une barrière (Période des Tournois).
 * @returns {{id:string, disqualified?:boolean, unhorsed?:boolean, fallDice?:string, ignoreArmor?:boolean, courtPenalty?:boolean, forgiving?:boolean}}
 */
export function joustFumble(d20, { barrier = false } = {}) {
  const d = Number(d20) || 1;
  if (d <= 5 && barrier) return { id: "barrier" };
  if (d <= 10) return { id: "horse", disqualified: true };
  if (d <= 12) return { id: "dropLance", courtPenalty: true };
  if (d <= 14) return { id: "fallFlee", unhorsed: true, fallDice: "1D6" };
  if (d <= 16) return { id: "saddle", forgiving: true };
  if (d <= 18) return { id: "fall", unhorsed: true, fallDice: "1D6" };
  return { id: "dragged", unhorsed: true, fallDice: "3D6", ignoreArmor: true };
}

/** Double échec critique (1D6) : chevaux touchés, collision ou double chute. */
export function joustDoubleFumble(d6, { barrier = false } = {}) {
  const d = Number(d6) || 1;
  if (d <= 2) return { id: "bothHorses", disqualified: true };
  if (d <= 4 && !barrier) return { id: "collision", collision: true };
  return { id: "bothFall", unhorsed: true, fallDice: "1D6" };
}

/**
 * Issue d'une rencontre après une passe : un désarçonné ou un disqualifié perd ; trois lances brisées
 * gagnent ; après les passes prévues, le plus de lances brisées ; sinon on continue.
 * @param {{lances:number, unhorsed:boolean, disqualified:boolean}} a
 * @param {{lances:number, unhorsed:boolean, disqualified:boolean}} b
 * @returns {"a"|"b"|"none"|null}  null : la rencontre continue ; "none" : personne ne passe
 */
export function joustOutcome(a, b, { pass, lances = 3, passes = 3 } = {}) {
  const outA = a.unhorsed || a.disqualified;
  const outB = b.unhorsed || b.disqualified;
  if (a.disqualified && b.disqualified) return "none";
  if (outA && !outB) return "b";
  if (outB && !outA) return "a";
  if (outA && outB) return null;
  const la = Number(a.lances) || 0;
  const lb = Number(b.lances) || 0;
  if (la >= lances || lb >= lances) {
    if (la !== lb) return la > lb ? "a" : "b";
    return null;
  }
  if ((Number(pass) || 0) >= passes && la !== lb) return la > lb ? "a" : "b";
  return null;
}

/**
 * Gloire d'un chevalier au tournoi :
 * - les épreuves abrégées (Table 3.16) remplacent la Gloire des participants ; sinon celle-ci, une fois ;
 * - plus les rencontres de joute gagnées et la Gloire du champion (par épreuve remportée) ;
 * - le tout doublé pour le chevalier Romantique qui porte la faveur de l'être aimé (Livre du joueur, p. 128) ;
 * - plus la Gloire des tests de cour (non doublée).
 * La Gloire de la mêlée jouée comme une bataille est inscrite par la Bataille elle-même.
 */
export function knightTournamentGlory(k, size, { romantic = false } = {}) {
  const abridged = (Number(k.abridged?.melee?.glory) || 0) + (Number(k.abridged?.joust?.glory) || 0);
  const participated = !!(k.melee || k.joust) || abridged > 0;
  const base = abridged > 0 ? abridged : (participated ? size.glory : 0);
  const champion = (k.champion?.melee ? size.champion : 0) + (k.champion?.joust ? size.champion : 0);
  const events = base + (Number(k.joustGlory) || 0) + champion;
  const doubled = romantic && !!k.favor;
  const court = (k.court?.tests ?? []).reduce((s, t) => s + (Number(t.glory) || 0), 0);
  return { base, joust: Number(k.joustGlory) || 0, champion, events, doubled, court, total: (doubled ? 2 : 1) * events + court };
}
