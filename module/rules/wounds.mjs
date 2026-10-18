/**
 * Blessures, Chute et soins (Livre du joueur, chap. 7 p. 134 et chap. 11).
 * Module pur : aucune dépendance à Foundry.
 */

/**
 * Chute (p. 134) : dégâts de base (avant armure) comparés à la TAI.
 * @returns {"none"|"test"|"auto"}  aucun effet, test de DEX, mise à terre automatique
 */
export function knockdownCheck(baseDamage, siz) {
  const d = Number(baseDamage) || 0;
  const s = Number(siz) || 0;
  if (d > 2 * s) return "auto";
  if (d > s) return "test";
  return "none";
}

/**
 * Dégâts réels : dégâts de base moins armure, et moins bouclier ou parade quand ils comptent.
 * @param {number} base
 * @param {object} p
 * @param {number} [p.armor]
 * @param {number} [p.shield]   protection de bouclier ou de parade retenue (déjà plafonnée)
 * @param {boolean} [p.half]    arme émoussée, plat de la lame : moitié des dégâts (arrondi inférieur)
 */
export function realDamage(base, { armor = 0, shield = 0, half = false } = {}) {
  const b = half ? Math.floor((Number(base) || 0) / 2) : (Number(base) || 0);
  return Math.max(0, b - (Number(armor) || 0) - (Number(shield) || 0));
}

/**
 * Type de blessure d'un coup (p. 190–191).
 * @param {number} damage   points de vie perdus d'un seul coup
 * @param {object} p        { majorWound (CON), hpTotal }
 * @returns {"none"|"minor"|"major"|"mortal"}
 */
export function woundType(damage, { majorWound, hpTotal }) {
  const d = Number(damage) || 0;
  if (d <= 0) return "none";
  if (hpTotal && d >= hpTotal) return "mortal";
  if (d >= majorWound) return "major";
  return "minor";
}

/** Table 11.1 : caractéristique diminuée par une Blessure majeure (1D6). */
export const CHAR_LOSS = { 1: "siz", 2: "dex", 3: "str", 4: "con", 5: "app", 6: null };
export function charLoss(die) {
  return CHAR_LOSS[Number(die)] ?? null;
}

/**
 * État après une perte de points de vie.
 * @returns {{unconscious:boolean, dying:boolean, debilitated:boolean}}
 */
export function stateAfter({ hp, unconsciousAt, type, wasUnconscious = false, wasDebilitated = false }) {
  const dying = hp <= 0;
  const unconscious = wasUnconscious || dying || hp < unconsciousAt || type === "major" || type === "mortal";
  const debilitated = wasDebilitated || unconscious || type === "major" || type === "mortal";
  return { unconscious, dying, debilitated };
}

/**
 * Premiers soins (p. 199) : critique double Taux de guérison, succès Taux de guérison,
 * échec rien, échec critique −1D3 et Affaibli.
 * @returns {{heal:number, lossDice:string|null, debilitate:boolean}}
 */
export function firstAidResult(outcome, healRate) {
  const r = Number(healRate) || 0;
  switch (outcome) {
    case "critical": return { heal: 2 * r, lossDice: null, debilitate: false };
    case "success": return { heal: r, lossDice: null, debilitate: false };
    case "fumble": return { heal: 0, lossDice: "1d3", debilitate: true };
    default: return { heal: 0, lossDice: null, debilitate: false };
  }
}

/**
 * Semaine de convalescence (p. 193–200), le dimanche :
 * Chirurgie (si Affaibli), puis détérioration 1D6 (Affaibli sans Chirurgie réussie),
 * puis guérison naturelle (Taux de guérison) sauf activité.
 * @param {object} p
 * @param {boolean} p.debilitated
 * @param {string|null} p.surgery    résultat du test de Chirurgie, ou null s'il n'y en a pas eu
 * @param {boolean} [p.rested]       repos (sinon pas de guérison naturelle)
 * @returns {{deteriorate:boolean, surgeryHeal:boolean, surgeryLossDice:string|null, naturalHeal:boolean}}
 */
export function weekPlan({ debilitated, surgery = null, rested = true }) {
  const ok = surgery === "critical" || surgery === "success";
  return {
    deteriorate: !!debilitated && !ok,
    surgeryHeal: surgery === "critical",
    surgeryLossDice: surgery === "fumble" ? "1d6" : null,
    naturalHeal: !!rested
  };
}

/**
 * L'Affaibli prend fin après une Chirurgie réussie, quand le personnage a retrouvé
 * au moins la moitié de ses points de vie (p. 190).
 */
export function endsDebilitation({ hp, hpTotal, surgeryOk }) {
  return !!surgeryOk && hp >= Math.ceil(hpTotal / 2);
}

/** Table 7.2 : échec critique de Charge montée à la lance, selon le test d'Équitation. */
export function lanceFumble(outcome) {
  switch (outcome) {
    case "critical": return { dice: null, unhorsed: false };
    case "success": return { dice: "1d6", unhorsed: false };
    case "failure": return { dice: "2d6", unhorsed: true };
    default: return { dice: "3d6", unhorsed: true };
  }
}
