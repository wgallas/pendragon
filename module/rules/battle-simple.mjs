/**
 * Bataille simplifiée, la « passe d'armes » (variante du système, pas une règle du livre) :
 * chaque tour, le commandant donne un ordre contre l'intention cachée de l'ennemi, chaque
 * chevalier choisit une carte et une posture, puis joue sa rencontre en un seul test opposé.
 * Module pur, sans Foundry, pour être testé seul. Les réglages viennent de PDVF.battle.simple.
 */
import { roundPendragon, compareOpposed, OUTCOME } from "./resolution.mjs";
import { addDice } from "./combat.mjs";

/** Ordres du commandant (et intentions de l'ennemi). */
export const ORDERS = ["charge", "hold", "shoot", "maneuver"];

/** Ce que chaque ordre bat : Charger bat Tirer, Tenir bat Charger, Tirer bat Tenir. */
const BEATS = { charge: "shoot", hold: "charge", shoot: "hold" };

/**
 * Bonus des passes du tour selon l'ordre donné et l'intention de l'ennemi :
 * +bonus si l'ordre l'emporte, −bonus s'il est battu, 0 sinon (Manœuvrer ne gagne ni ne perd).
 */
export function orderModifier(order, intention, cfg) {
  const b = Number(cfg?.orderBonus) || 5;
  if (!ORDERS.includes(order) || !ORDERS.includes(intention)) return 0;
  if (BEATS[order] === intention) return b;
  if (BEATS[intention] === order) return -b;
  return 0;
}

/** Le commandant voit-il l'intention de l'ennemi avant de donner son ordre ? */
export function intentionSeen({ outcome = "", weManeuvered = false, enemyManeuvered = false } = {}) {
  if (weManeuvered) return true;
  if (outcome === OUTCOME.CRITICAL) return true;
  if (enemyManeuvered) return false;
  return outcome === OUTCOME.SUCCESS;
}

/**
 * Effets du test de Bataille du commandant sur le tour.
 * @returns {{seen:boolean, bonus:number, opportunity:boolean, enemyImposes:boolean}}
 */
export function orderTestEffects(outcome, { weManeuvered = false, enemyManeuvered = false } = {}, cfg = {}) {
  return {
    seen: intentionSeen({ outcome, weManeuvered, enemyManeuvered }),
    bonus: outcome === OUTCOME.CRITICAL ? Number(cfg.criticalBonus) || 0 : 0,
    opportunity: outcome === OUTCOME.CRITICAL,
    enemyImposes: outcome === OUTCOME.FUMBLE
  };
}

/** Postures de la passe : multiplicateur des victimes, modificateur du jet, dés de Danger. */
export function postureProfile(posture, cfg) {
  return cfg?.postures?.[posture] ?? cfg?.postures?.valorous ?? { victims: 1, skill: 0, dice: 0 };
}

/**
 * Attaque de l'adversaire retenue pour la passe : celle de Charge si l'ordre est de charger
 * et que l'adversaire en a une, sinon la meilleure (à valeur égale, la première).
 * @param {{name?:string, skill?:string, value:number, damage?:string}[]} attacks
 * @param {string} order
 */
export function pickAttack(attacks, order) {
  const list = (attacks ?? []).filter(a => Number(a?.value) > 0);
  if (!list.length) return null;
  const isCharge = (a) => /charge/i.test(a.skill ?? "");
  if (order === "charge") {
    const c = list.find(isCharge);
    if (c) return c;
  }
  const pool = list.filter(a => !isCharge(a));
  return (pool.length ? pool : list).reduce((best, a) => (Number(a.value) > Number(best.value) ? a : best));
}

/**
 * Valeur (opposition) et Danger (dégâts subis) d'une carte : réglages de la carte s'ils sont
 * remplis, sinon l'attaque de l'adversaire lié, sinon les valeurs par défaut.
 * @param {object} card  carte du paquet (passValue, passDanger, skillBonus)
 * @param {object[]} attacks  attaques du PNJ lié à la carte
 */
export function cardProfile(card, attacks, order, cfg) {
  const attack = pickAttack(attacks, order);
  const fixed = card?.passValue;
  const base = fixed !== null && fixed !== undefined && fixed !== "" ? Number(fixed) : Number(attack?.value ?? cfg?.defaultValue ?? 12);
  const value = Math.max(0, Math.round(base + (Number(card?.skillBonus) || 0)));
  const danger = String(card?.passDanger || attack?.damage || cfg?.defaultDanger || "4D6").trim();
  return { value, danger, attack: attack?.name ?? "" };
}

/** Danger réellement lancé selon la posture (Téméraire +2D6, Prudent −2D6). */
export function postureDanger(danger, posture, cfg) {
  return addDice(danger, postureProfile(posture, cfg).dice);
}

/**
 * Issue de la passe pour le chevalier, d'après les deux tests (resolveTest).
 * exploit (critique) · victory · rough (succès partiel ou égalité) · confused (deux échecs)
 * · repulsed (défaite) · disaster (échec critique du chevalier).
 */
export function passOutcome(knight, enemy) {
  if (knight.outcome === OUTCOME.FUMBLE) return "disaster";
  const cmp = compareOpposed(knight, enemy);
  if (cmp.kind === "mutualFailure") return "confused";
  if (cmp.a === "victory") return knight.outcome === OUTCOME.CRITICAL ? "exploit" : "victory";
  if (cmp.a === "partial" || cmp.a === "tie") return "rough";
  return "repulsed";
}

/**
 * Effets d'une issue : part des victimes (× l'effectif et la posture), dégâts subis
 * (none, shield : le bouclier protège, full), revers, perte de Moral, capture.
 */
export function passEffects(outcome, cfg) {
  return cfg?.outcomes?.[outcome] ?? { victims: 0, damage: "none", morale: 0 };
}

/**
 * Adversaires vaincus par un chevalier : effectif par chevalier × posture × issue, arrondi.
 * Une victoire, même petite, abat au moins un adversaire.
 */
export function victims(perKnight, posture, outcome, cfg) {
  const share = Number(passEffects(outcome, cfg).victims) || 0;
  const per = Math.max(0, Number(perKnight) || 0);
  if (!share || !per) return 0;
  const n = per * share * (Number(postureProfile(posture, cfg).victims) || 1);
  return Math.max(1, roundPendragon(n));
}

/** Effectif qu'affronte chaque chevalier : celui de la carte, ou l'effectif fixe partagé. */
export function perKnightCount(card, knights) {
  const fixed = Number(card?.fixedCount);
  if (fixed > 0) return fixed / Math.max(1, Number(knights) || 1);
  return Math.max(0, Number(card?.perKnight ?? 1));
}

/** Revers d'un échec critique (1D6). */
export function setback(die, cfg) {
  const d = Math.max(1, Math.min(6, Number(die) || 1));
  return (cfg?.setbacks ?? []).find(s => d >= s.min && d <= s.max)?.id ?? "unhorsed";
}

/**
 * Cartes ouvertes d'un tour : les cartes imposées en vigueur d'abord, puis un tirage au hasard
 * parmi les autres opposants en vigueur, jusqu'au nombre voulu.
 * @param {object[]} cards  opposants en vigueur ce tour-ci
 * @param {number} count
 * @param {() => number} random  0 ≤ x < 1
 */
export function drawOpen(cards, count, random = Math.random) {
  const forced = cards.filter(c => c.forced);
  const rest = cards.filter(c => !c.forced);
  const out = forced.map(c => c.id);
  const pool = [...rest];
  while (out.length < count && pool.length) {
    const i = Math.floor(random() * pool.length);
    out.push(pool.splice(i, 1)[0].id);
  }
  return out;
}

/** Carte qui donne la perte de Moral du tour : la plus exigeante (Moral minimum) des cartes choisies. */
export function hardestCard(cards) {
  return (cards ?? []).filter(Boolean).reduce((h, c) => (!h || (Number(c.moraleMin) || 0) > (Number(h.moraleMin) || 0) ? c : h), null);
}
