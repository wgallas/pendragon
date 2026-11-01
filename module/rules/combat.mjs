/**
 * Échange de combat (Livre du joueur, chap. 7) : actions, modificateurs et Table 7.1.
 * Module pur : aucune dépendance à Foundry.
 *
 * Un échange oppose deux combattants, « a » (celui qui engage) et « b » (celui qui répond).
 * Chacun est décrit par :
 *   { action, result (resolveTest), weapon (descripteur ci-dessous), mounted, prone }
 * Descripteur d'arme : { skill, sword, swordTie, long, twoHanded, parry, lance, hafted, unarmed }
 */
import { compareOpposed, OUTCOME } from "./resolution.mjs";

/**
 * Actions de combat reprises (p. 137–146).
 * skill   : ce qui est testé (« weapon » : la compétence de l'arme ; « move » : Mouvement)
 * deals   : l'action inflige des dégâts quand elle l'emporte
 * where   : « foot », « horse » ou « both »
 */
export const ACTIONS = {
  attack: { skill: "weapon", deals: true, where: "both" },
  allOut: { skill: "weapon", deals: true, where: "both" },
  defend: { skill: "weapon", deals: false, where: "both", personal: 10 },
  pull: { skill: "weapon", deals: true, where: "both" },
  disarm: { skill: "weapon", deals: false, where: "both" },
  charge: { skill: "charge", deals: true, where: "horse" },
  setSpear: { skill: "weapon", deals: true, where: "foot" },
  brawl: { skill: "brawling", deals: true, where: "both" },
  dodge: { skill: "move", deals: false, where: "foot" },
  disengage: { skill: "move", deals: false, where: "both" },
  ranged: { skill: "weapon", deals: true, where: "both", ranged: true },
  none: { skill: "none", deals: false, where: "both" }
};

/** Actions possibles selon la monture. */
export function actionsFor({ mounted = false, defending = false, ranged = false } = {}) {
  return Object.entries(ACTIONS)
    .filter(([id, a]) => (a.where === "both" || (a.where === "horse") === mounted))
    .filter(([id]) => (id !== "none" || defending) && (id !== "ranged" || (ranged && !defending)))
    .map(([id]) => id);
}

/**
 * Attaque à outrance contre Défense : les deux s'annulent, l'échange se résout normalement (p. 138).
 * @returns {[string, string]}
 */
export function cancelActions(aAction, bAction) {
  const pair = new Set([aAction, bAction]);
  if (pair.has("allOut") && pair.has("defend")) return ["attack", "attack"];
  return [aAction, bAction];
}

/**
 * Valeur de base testée, avec les plafonds du combat monté (p. 139–140, 149).
 * @param {object} p
 * @param {string} p.action
 * @param {number} p.weaponSkill   compétence de l'arme
 * @param {number} [p.charge]       compétence Charge
 * @param {number} [p.horsemanship] Équitation (plafond à cheval)
 * @param {number} [p.move]         Mouvement (du cheval si l'on se désengage à cheval)
 * @param {number} [p.brawling]
 * @param {boolean} [p.mounted]
 * @param {boolean} [p.lance]       arme de charge (lance couchée, lance de cavalerie)
 */
export function baseValue({ action, weaponSkill = 0, charge = 0, horsemanship = 99, move = 0, brawling = 0, mounted = false, lance = false }) {
  const a = ACTIONS[action] ?? ACTIONS.attack;
  let v;
  if (a.skill === "move") v = move;
  else if (a.skill === "brawling") v = brawling;
  else if (a.skill === "charge") v = lance ? charge : Math.min(charge, weaponSkill);
  else if (a.skill === "none") v = 0;
  else v = weaponSkill;
  if (mounted && a.skill !== "move" && a.skill !== "none") v = Math.min(v, horsemanship);
  return v;
}

/**
 * Modificateurs d'un combattant contre l'autre (p. 136–149).
 * @param {object} self   { action, mounted, prone, weapon, opponents, longRange, shield: {mountedPenalty, chargeExempt}, manual, inspiration }
 * @param {object} other  { action, mounted, prone, weapon }
 * @returns {{total:number, parts:{label:string, value:number}[], warnings:string[]}}
 */
export function exchangeModifiers(self, other) {
  const parts = [];
  const warnings = [];
  const add = (label, value) => { if (value) parts.push({ label, value }); };
  const a = ACTIONS[self.action] ?? ACTIONS.attack;
  const w = self.weapon ?? {};
  const ow = other.weapon ?? {};

  // Personnels : Se défendre, adversaires multiples
  if (a.personal) add("Se défendre", a.personal);
  const n = Math.max(1, Number(self.opponents) || 1);
  if (n > 1) add(`${n} adversaires`, -5 * (n - 1));

  // Hauteur (p. 147) : cavalier contre piéton, debout contre au sol, +5 / −5 réfléchis.
  // Vaut aussi pour les tests de Mouvement (le bandit qui se désengage d'un cavalier, p. 157),
  // mais pas pour le tir. Le piéton qui se bat avec une lance ou une arme d'hast ignore le −5.
  const selfHigh = (self.mounted ? 2 : self.prone ? 0 : 1);
  const otherHigh = (other.mounted ? 2 : other.prone ? 0 : 1);
  if (a.skill !== "none" && self.action !== "ranged") {
    if (selfHigh > otherHigh) add("Avantage de hauteur", 5);
    if (selfHigh < otherHigh) {
      const ignores = a.skill !== "move" && selfHigh === 1 && other.mounted && w.long;
      if (!ignores) add("Désavantage de hauteur", -5);
    }
    if (a.skill !== "move" && self.mounted && other.prone && !w.lance) warnings.push("À cheval, seule une lance peut frapper un adversaire au sol.");
  }

  // Attaque à outrance de l'adversaire : +5 à qui se sert d'une compétence d'arme
  if (other.action === "allOut" && (a.skill === "weapon" || a.skill === "charge" || a.skill === "brawling")) add("Adversaire à outrance", 5);

  // Charge à la lance couchée contre une cible sans arme longue
  if (self.action === "charge" && w.lance && !ow.long) add("Lance couchée", 5);

  // Arme longue à distance Longue contre une arme qui ne l'est pas
  if (self.longRange && w.long && !ow.long && self.action !== "charge") add("Arme longue (distance Longue)", 5);

  // Grand bouclier à cheval
  if (self.mounted && self.shield?.mountedPenalty && (a.skill === "weapon" || a.skill === "charge")
      && !(self.action === "charge" && self.shield.chargeExempt && w.lance)) {
    add("Bouclier à cheval", Number(self.shield.mountedPenalty));
  }

  add("Inspiration", Number(self.inspiration) || 0);
  add("Modificateur", Number(self.manual) || 0);
  if (self.action === "setSpear" && other.action !== "charge") warnings.push("Planter sa lance n'agit que contre une charge : c'est ici une attaque ordinaire.");
  return { total: parts.reduce((s, p) => s + p.value, 0), parts, warnings };
}

/**
 * Table 7.1, avec les résultats propres aux actions.
 * @param {object} a  { action, result, weapon }
 * @param {object} b  { action, result, weapon }  (action « none » : pas d'opposition)
 * @returns {{cmp:object, a:object, b:object}}
 *   pour chaque côté : {
 *     hit:boolean           ce côté subit les dégâts de l'autre,
 *     shieldOk:boolean      il peut appliquer bouclier ou parade,
 *     bonusDice:number      dés ajoutés aux dégâts qu'il subit (critique, outrance),
 *     drops:boolean, breaks:boolean   son arme est lâchée ou brisée,
 *     prone:boolean, disengaged:boolean, disarmedBy:boolean,
 *     lanceFumble:boolean   échec critique de charge à la lance (Table 7.2),
 *     notes:string[]
 *   }
 */
export function resolveExchange(a, b) {
  const unopposed = b.action === "none";
  const cmp = unopposed
    ? (a.result.success ? { a: "victory", b: "defeat", winner: "a", kind: "victory" } : { a: "failure", b: "failure", winner: null, kind: "mutualFailure" })
    : compareOpposed(a.result, b.result);
  const sides = { a: blank(), b: blank() };

  for (const [x, y] of [["a", "b"], ["b", "a"]]) {
    const X = x === "a" ? a : b;
    const Y = y === "a" ? a : b;
    const sx = sides[x];
    const ax = ACTIONS[X.action] ?? ACTIONS.attack;
    const ay = ACTIONS[Y.action] ?? ACTIONS.attack;
    const rx = cmp[x];
    const crit = (s) => s.result?.outcome === OUTCOME.CRITICAL;
    const fumble = (s) => s.result?.outcome === OUTCOME.FUMBLE;

    // X subit-il les dégâts de Y ?
    const yWins = cmp.winner === y;
    const tie = cmp.kind === "tie";
    let hit = ay.deals && (yWins || tie);
    if (tie && (X.action === "defend" || X.action === "dodge" || X.action === "disengage")) hit = false;
    if (Y.action === "disarm") hit = false;
    sx.hit = hit;

    // Bouclier ou parade : sur un succès partiel ou une égalité, jamais en attaque à outrance ni en esquive
    sx.shieldOk = hit && (rx === "partial" || tie) && X.action !== "allOut" && Y.action !== "allOut" && X.action !== "dodge" && !unopposed;

    // Dés supplémentaires : critique de l'adversaire (+4D6 ; +2D6 à mains nues), attaque à outrance (+2D6, +6D6 en critique)
    if (hit && !tie) {
      if (Y.action === "allOut") sx.bonusDice = crit(Y) ? 6 : 2;
      else if (crit(Y)) sx.bonusDice = Y.action === "brawl" && Y.weapon?.unarmed ? 2 : 4;
    }

    // Arme lâchée ou brisée : échec critique ; égalité contre une épée ; critique d'une épée contre un échec critique
    if (fumble(X) && X.action !== "dodge" && !X.weapon?.unarmed) {
      const ySword = Y.weapon?.sword && crit(Y);
      if (X.weapon?.sword || X.weapon?.skill === "brawling") { if (ySword) sx.breaks = true; else sx.drops = true; }
      else sx.breaks = true;
    }
    if (tie && Y.weapon?.sword && X.weapon?.swordTie && !X.weapon?.unarmed) sx.breaks = true;

    // Charge montée : arme de charge brisée sur un succès partiel ou une égalité ; échec critique à la lance
    if (X.action === "charge") {
      if ((rx === "partial" || tie) && (X.weapon?.lance || X.weapon?.hafted)) { sx.breaks = true; sx.notes.push("La charge brise l'arme."); }
      if (fumble(X) && X.weapon?.lance) { sx.lanceFumble = true; sx.breaks = true; }
      if (tie && crit(X) && crit(Y) && Y.action === "charge") sx.notes.push("Deux critiques : les chevaux se percutent (dégâts de charge de part et d'autre).");
    }

    // Désarmer : le gagnant fait lâcher son arme à l'adversaire
    if (X.action === "disarm" && cmp.winner === x) {
      sides[y].drops = true; sides[y].disarmedBy = true;
      sides[y].notes.push(crit(X) ? "Désarmé : l'arme tombe loin, ou aux pieds de l'adversaire s'il le préfère." : "Désarmé : l'arme tombe à ses pieds (un tour pour la ramasser).");
    }

    // Esquiver
    if (X.action === "dodge") {
      if (cmp.winner === x) { sx.hit = false; if (!crit(X)) { sx.prone = true; sx.notes.push("Esquive : roulade, il finit au sol mais garde son arme."); } else sx.notes.push("Esquive parfaite : il reste debout."); }
      else { sx.prone = true; if (fumble(X)) sx.drops = true; }
    }

    // Se désengager
    if (X.action === "disengage") {
      if (cmp.winner === x) { sx.hit = false; sx.disengaged = true; sx.notes.push("Désengagé."); }
      if (fumble(X)) { sx.prone = true; sx.notes.push("Il tombe en voulant se désengager."); }
    }

    // Se défendre : aucun dégât s'il l'emporte (ni s'il fait égalité, vu plus haut)
    if (X.action === "defend" && cmp.winner === x) sx.hit = false;

    // Rixe : maladresse
    if (X.action === "brawl" && fumble(X)) sx.notes.push("Il trébuche : −5 à son action au tour suivant.");
  }
  if (cmp.kind === "mutualFailure") sides.a.notes.push("Les deux perdent : personne n'est touché.");
  return { cmp, a: sides.a, b: sides.b };
}

function blank() {
  return { hit: false, shieldOk: false, bonusDice: 0, drops: false, breaks: false, prone: false, disengaged: false, disarmedBy: false, lanceFumble: false, notes: [] };
}

/** Nombre de dés d'une formule simple (« 6D6 », « 2D6+4 ») ; 0 si aucun. */
export function diceCount(formula) {
  const m = String(formula ?? "").match(/(\d+)\s*[dD]6/);
  return m ? Number(m[1]) : 0;
}

/**
 * Ajoute des D6 à une formule, et en retire si n est négatif (Retenir ses coups).
 * « 4D6 » + 2 → « 6D6 » ; « 2D6+4 » + 4 → « 6D6+4 » ; « 5 » + 2 → « 2D6+5 ».
 */
export function addDice(formula, n) {
  const f = String(formula ?? "").trim().toUpperCase().replace(/\s+/g, "");
  const k = Number(n) || 0;
  if (!k) return f;
  const m = f.match(/^(\d+)D6(.*)$/);
  if (m) {
    const dice = Math.max(0, Number(m[1]) + k);
    const rest = m[2] ?? "";
    if (!dice) return rest.replace(/^\+/, "") || "0";
    return `${dice}D6${rest}`;
  }
  if (k < 0) return f;
  return /^[+-]?\d+$/.test(f) ? `${k}D6${Number(f) >= 0 ? "+" : ""}${f}` : `${f}+${k}D6`;
}

/**
 * Dégâts d'une charge avec une arme qui n'est pas une lance : arme +1D6, sans dépasser
 * les dés de charge de la monture, sauf critique (p. 140).
 */
export function chargeWeaponFormula(weaponFormula, horseCharge, critical) {
  let f = addDice(weaponFormula, 1);
  const cap = diceCount(horseCharge);
  if (!critical && cap && diceCount(f) > cap) f = f.replace(/^(\d+)D6/, `${cap}D6`);
  return f;
}
