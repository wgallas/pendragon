/**
 * Dangers hors combat (Livre du joueur, chap. 11, p. 194–197) : chute, asphyxie, poison.
 * Module pur : aucune dépendance à Foundry.
 */
import { resolveFixed, roundPendragon } from "./resolution.mjs";

/**
 * Dés de dégâts d'une chute : rien sous 2 m, 1D6 à 2 m, puis le double par tranche de 2 m, 16D6 au plus.
 * @param {number} meters
 */
export function fallDice(meters) {
  const m = Number(meters) || 0;
  if (m < 2) return 0;
  const steps = Math.floor(m / 2);
  return Math.min(16, 2 ** (steps - 1));
}

/**
 * Test de DEX (ou d'Équitation, de cheval) avant la chute : succès −1D6, critique −2D6,
 * échec critique : deux fois plus de dés.
 */
export function fallDiceAfterTest(dice, outcome) {
  const d = Number(dice) || 0;
  switch (outcome) {
    case "critical": return Math.max(0, d - 2);
    case "success": return Math.max(0, d - 1);
    case "fumble": return d * 2;
    default: return d;
  }
}

/** Asphyxie : −1 au test de CON par tour après le premier (tour 1 : 0, tour 7 : −6). */
export function asphyxiaModifier(round) {
  const n = Math.max(0, (Number(round) || 1) - 1);
  return n ? -n : 0;
}

/**
 * Poison (Table 11.3) : test de CON en opposition fixe contre l'efficacité.
 * @param {object} result   résultat du test de CON (resolveTest)
 * @param {number} potency
 * @returns {{effect:"none"|"partial"|"full", loss:number}}
 */
export function poisonEffect(result, potency) {
  const p = Number(potency) || 0;
  if (!result.success) return { effect: "full", loss: p };
  if (resolveFixed(result, p) === "victory") return { effect: "none", loss: 0 };
  return { effect: "partial", loss: roundPendragon(p / 2) };
}

/** Points de vie rendus par la Chirurgie après le froid : la moitié sur un succès, tout sur un critique. */
export function coldRecovery(outcome, cold) {
  const c = Number(cold) || 0;
  if (outcome === "critical") return c;
  if (outcome === "success") return Math.ceil(c / 2);
  return 0;
}
