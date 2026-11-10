/**
 * Duel stratégique (variante du système, pas une règle du livre) : combat à pied d'un contre un,
 * en passes. Chaque passe : lecture (Vigilance opposée, cartes retournées), choix d'une intention,
 * test opposé de la compétence d'arme ; le vainqueur frappe (prise s'il prend l'intention adverse) ou fait un geste.
 * Effets réglés par simulation pour que les cinq intentions se vaillent (10 novembre 2026).
 * Module pur, sans Foundry, pour être testé seul. Réglages dans PDVF.duel.
 */
import { compareOpposed, OUTCOME } from "./resolution.mjs";

/** Les cinq intentions. */
export const INTENTS = ["attack", "defend", "close", "bind", "feint"];

/** Ce que chaque intention « prend » : Défendre > Attaquer > Entrer > Lier > Feindre > Défendre. */
export const TAKES = { defend: "attack", attack: "close", close: "bind", bind: "feint", feint: "defend" };

/** Trait coché par chaque intention. */
export const INTENT_TRAIT = {
  attack: "trait.prudent.right",   // Téméraire
  defend: "trait.prudent.left",    // Prudent
  feint: "trait.honest.right",     // Trompeur
  bind: "trait.trusting.right",    // Méfiant
  close: "trait.valorous.left"     // Valeureux
};

/** Geste « provoquer un trait » : intention imposée par le trait qui l'emporte. */
export const PROVOKE = {
  "trait.prudent.right": "attack", "trait.modest.right": "attack", "trait.forgiving.right": "attack", "trait.honest.left": "attack",
  "trait.prudent.left": "defend", "trait.modest.left": "defend", "trait.forgiving.left": "defend",
  "trait.valorous.left": "close", "trait.energetic.left": "close", "trait.merciful.right": "close", "trait.trusting.left": "close",
  "trait.trusting.right": "bind", "trait.energetic.right": "bind", "trait.merciful.left": "bind",
  "trait.honest.right": "feint", "trait.valorous.right": "feint"
};

/** Traits qu'on peut provoquer (les huit paires retenues). */
export const PROVOKABLE = Object.keys(PROVOKE);

/** Trait opposé (« trait.prudent.left » ↔ « trait.prudent.right »). */
export function oppositeTrait(key) {
  const [k, id, side] = String(key).split(".");
  return `${k}.${id}.${side === "left" ? "right" : "left"}`;
}

/** Modificateur du cycle : −5 (réglage) à l'intention prise, rien sinon. */
export function cycleModifiers(a, b, penalty = -5) {
  return { a: TAKES[b] === a ? penalty : 0, b: TAKES[a] === b ? penalty : 0 };
}

/**
 * Trait célèbre qui s'oppose à une intention : choisir Attaquer contredit un Prudent célèbre,
 * Feindre un Honnête célèbre, etc. Renvoie la clé du trait à tester, ou null.
 * @param {string} intent
 * @param {(key:string) => number} valueOf  valeur d'un trait
 */
export function famousConflict(intent, valueOf, famousAt = 16) {
  const own = INTENT_TRAIT[intent];
  if (!own) return null;
  const opp = oppositeTrait(own);
  return (Number(valueOf(opp)) || 0) >= famousAt ? opp : null;
}

/**
 * Lecture : cartes de l'adversaire retournées et ordre des choix, d'après le test opposé de Vigilance.
 * critique 3 ; réussite gagnante 2 ; réussite qui perd (ou égalité) 1 ; échec 0 ;
 * échec critique : une de ses propres cartes retournée en plus.
 * Le vainqueur choisit en dernier ; égalité ou deux échecs : choix simultané.
 * @returns {{seeA:number, seeB:number, first:"a"|"b"|null}}  seeA : cartes de B que A voit
 */
export function readingResult(ra, rb, cfg = {}) {
  const counts = cfg.readingCards ?? { critical: 3, win: 2, partial: 1 };
  const cmp = compareOpposed(ra, rb);
  const see = (self, side) => {
    if (self.outcome === OUTCOME.CRITICAL) return counts.critical;
    if (!self.success) return 0;
    return cmp[side] === "victory" ? counts.win : counts.partial;
  };
  let seeA = see(ra, "a");
  let seeB = see(rb, "b");
  if (rb.outcome === OUTCOME.FUMBLE) seeA += 1;
  if (ra.outcome === OUTCOME.FUMBLE) seeB += 1;
  const first = cmp.kind === "victory" ? (cmp.winner === "a" ? "b" : "a") : null;
  return { seeA: Math.min(INTENTS.length, seeA), seeB: Math.min(INTENTS.length, seeB), first };
}

/** Cartes retournées au hasard. */
export function revealRandom(n, random = Math.random, pool = INTENTS) {
  const rest = [...pool];
  const out = [];
  while (out.length < n && rest.length) out.push(rest.splice(Math.floor(random() * rest.length), 1)[0]);
  return out;
}

/** Posture neutre (souffler, reprendre son arme) : ni prise ni preneuse, ne frappe pas. */
export const NEUTRAL = "none";

/** Toute intention qui gagne frappe ; la posture neutre ne frappe pas. */
export function strikes(intent) {
  return INTENTS.includes(intent);
}

/** L'intention du vainqueur prend-elle celle du perdant ? */
export function takes(intent, loserIntent) {
  return !!intent && TAKES[intent] === loserIntent;
}

/**
 * Issue d'une passe (Table 7.1 reprise) : vainqueur, nature de la défaite, égalité, échecs critiques.
 * @returns {{kind:"victory"|"tie"|"mutualFailure", winner:"a"|"b"|null, loserPartial:boolean, critical:boolean, fumbles:string[]}}
 */
export function passResult(ra, rb) {
  const cmp = compareOpposed(ra, rb);
  const fumbles = [];
  if (ra.outcome === OUTCOME.FUMBLE) fumbles.push("a");
  if (rb.outcome === OUTCOME.FUMBLE) fumbles.push("b");
  if (cmp.kind !== "victory") return { kind: cmp.kind, winner: null, loserPartial: false, critical: false, fumbles };
  const w = cmp.winner;
  const wr = w === "a" ? ra : rb;
  const lr = w === "a" ? rb : ra;
  return { kind: "victory", winner: w, loserPartial: lr.success, critical: wr.outcome === OUTCOME.CRITICAL, fumbles };
}

/**
 * Coup porté par le vainqueur : null s'il ne frappe pas (posture neutre, ou Entrer pour désarmer / renverser).
 * Coup normal : dégâts de l'arme ; bouclier ou parade du perdant sur un succès partiel, ou toujours
 * s'il s'est mis en Défendre. Prise (l'intention du vainqueur prend celle du perdant) : +priseDice D6,
 * sans bouclier ni parade. Critique : +4D6.
 * @param {string} intent           intention du vainqueur
 * @param {string} loserIntent
 * @param {object} p { partial, critical, closeOption, priseDice }  closeOption : strike | disarm | knockdown
 */
export function strikeOf(intent, loserIntent, { partial = false, critical = false, closeOption = "strike", priseDice = 1 } = {}) {
  if (intent === "close" && closeOption !== "strike") return null;
  if (!strikes(intent)) return null;
  const prise = takes(intent, loserIntent);
  const shield = prise ? false : (partial || loserIntent === "defend");
  return { extraDice: (critical ? 4 : 0) + (prise ? priseDice : 0), shield, prise };
}

/** Le chevalier est-il à la moitié de ses points de vie ou moins ? */
export function halfHp(hp, max) {
  return (Number(max) || 0) > 0 && (Number(hp) || 0) <= (Number(max) || 0) / 2;
}

/** Reddition d'un PNJ (Livre du maître, p. 131) : test de Valeureux à la moitié des PV. */
export function surrenderCheck(outcome) {
  return { critical: "toDeath", success: "fight", failure: "flee", fumble: "surrender" }[outcome] ?? "fight";
}

/** Gloire d'un duel gagné (Table A.1) : selon la plus haute valeur modifiée de l'adversaire ; ÷10 « pour l'amour ». */
export function duelGlory(maxValue, stakes, table, cfg = {}) {
  const v = Number(maxValue) || 0;
  const g = (table.find(r => v <= r.max) ?? table.at(-1)).glory;
  const love = (cfg.loveStakes ?? ["firstBlood", "firstFall", "blunted"]).includes(stakes);
  return love ? Math.max(1, Math.floor(g / 10 + 0.5)) : g;
}

/** Le duel est-il gagné par l'enjeu ? (premier sang : une blessure ; premier tombé : à terre) */
export function stakesMet(stakes, { wounded = false, prone = false } = {}) {
  if (stakes === "firstBlood") return wounded;
  if (stakes === "firstFall" || stakes === "blunted") return prone;
  return false;
}

/** Valeur d'un trait noté d'un PNJ : la ligne qui porte son nom, sinon 20 − l'opposé noté, sinon 10. */
export function npcTraitValue(rows, label, oppositeLabel, base = 10) {
  const norm = (s) => String(s ?? "").trim().toLowerCase();
  const find = (l) => (rows ?? []).find(r => norm(r.name).startsWith(norm(l)));
  const own = find(label);
  if (own) return Number(own.value) || 0;
  const opp = find(oppositeLabel);
  if (opp) return 20 - (Number(opp.value) || 0);
  return base;
}
