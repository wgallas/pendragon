/**
 * Règles de bataille (Livre du maître, chap. 6). Module pur, sans Foundry, pour être testé seul.
 * Les tables sont passées en paramètre (PDVF.battle) pour rester des données.
 */
import { roundPendragon } from "./resolution.mjs";

const SUCCESS = ["critical", "success"];

/** Le résultat d'un test est-il une réussite ? */
export function isSuccess(outcome) {
  return SUCCESS.includes(outcome);
}

/**
 * Table 6.3 : possibilité de Charge montée selon le test de Bataille du commandant du conroi.
 * @returns {"chargeBonus"|"charge"|"noCharge"|"enemyCharges"}
 */
export function chargeOpportunity(outcome, engagedLast) {
  switch (outcome) {
    case "critical": return engagedLast ? "charge" : "chargeBonus";
    case "success": return engagedLast ? "noCharge" : "charge";
    case "fumble": return "enemyCharges";
    default: return "noCharge";
  }
}

/** Tirs à subir avant d'atteindre des tireurs, selon le test de Bataille du commandant du conroi. */
export function rangedRounds(outcome) {
  return { critical: 0, success: 1, failure: 2, fumble: 3 }[outcome] ?? 2;
}

/** Intensité effective (divisée par deux en mêlée de tournoi). */
export function effectiveIntensity(intensity, tournament, cfg) {
  const v = Number(intensity) || 0;
  return tournament ? roundPendragon(v * cfg.tournamentIntensity) : v;
}

/** Tours de bataille maximum. */
export function maxRounds(size, override, cfg) {
  const o = Number(override);
  if (Number.isFinite(o) && o > 0) return o;
  return cfg.sizes[size]?.rounds ?? 1;
}

/**
 * Moral de départ du conroi : moyenne des passions choisies, +5 si tous ont la même.
 * @param {number[]} values
 * @param {boolean} same
 */
export function startingMorale(values, same) {
  const v = values.map(Number).filter(Number.isFinite);
  if (!v.length) return 0;
  const avg = v.reduce((a, b) => a + b, 0) / v.length;
  return roundPendragon(avg) + (same && v.length > 1 ? 5 : 0);
}

/** Moral plafonné à sa valeur de départ et jamais négatif. */
export function clampMorale(value, start) {
  return Math.max(0, Math.min(Number(start) || 0, Math.round(Number(value) || 0)));
}

/**
 * Modificateur du test de Bataille d'un commandant d'armée (Table 6.2).
 * @param {"allied"|"enemy"} side
 * @param {{odds:string, favors:string, alliedMods:string[], enemyMods:string[]}} battle
 */
export function commanderModifier(side, battle, cfg) {
  const other = side === "allied" ? "enemy" : "allied";
  let mod = 0;
  const odds = cfg.odds[battle.odds] ?? 0;
  if (odds) mod += battle.favors === side ? odds : -odds;
  const own = side === "allied" ? battle.alliedMods : battle.enemyMods;
  const theirs = side === "allied" ? battle.enemyMods : battle.alliedMods;
  for (const id of own ?? []) mod += cfg.commanderMods[id]?.mod ?? 0;
  for (const id of theirs ?? []) mod += cfg.commanderMods[id]?.other ?? 0;
  return mod;
}

/**
 * Effets des tests des commandants d'armée.
 * Sans test (batailles plus petites qu'un Affrontement), le premier tour est une charge.
 */
export function armyTestEffects(allied, enemy) {
  return {
    firstCharge: !allied || isSuccess(allied),
    firstRoundPenalty: allied === "fumble",
    enemyImposes: isSuccess(enemy),
    moraleImmunity: enemy === "fumble"
  };
}

/** Nombre d'ennemis d'une rencontre. */
export function enemyCount(encounter, knights, doubled = false) {
  const fixed = Number(encounter?.fixedCount);
  const per = Number(encounter?.perKnight ?? 1);
  if (!(fixed > 0) && !(per > 0)) return 0;
  let n = fixed > 0 ? fixed : Math.max(1, roundPendragon(per * Math.max(1, knights)));
  if (doubled) n *= 2;
  return n;
}

/** Moral regagné en battant des ennemis : somme des VC, arrondie. */
export function moraleFromKills(kills) {
  return roundPendragon(kills.reduce((s, k) => s + (Number(k.kv) || 0), 0));
}

/** Multiplicateur de résultat pour l'infériorité numérique (×2 si l'ennemi est très inférieur, ×½ si c'est nous). */
export function oddsResultMultiplier(odds, favors, cfg) {
  if (!cfg.greatOdds.includes(odds)) return 1;
  return favors === "allied" ? 2 : 0.5;
}

/** Résultat de la bataille d'après les VC infligées et perdues. */
export function battleResult(enemyKV, ownKV, multiplier, cfg) {
  const e = Number(enemyKV) || 0;
  const o = Number(ownKV) || 0;
  let ratio;
  if (o <= 0) ratio = e > 0 ? Infinity : 1;
  else ratio = (e / o) * multiplier;
  const row = cfg.results.find(r => ratio >= r.min) ?? cfg.results.at(-1);
  return { ratio, id: row.id };
}

/** Ligne de résultat (multiplicateur de Gloire, butin…). */
export function resultRow(id, cfg) {
  return cfg.results.find(r => r.id === id) ?? cfg.results.find(r => r.id === "indecisive");
}

/**
 * Gloire de participation : base (Table 6.6) × (résultat + commandement).
 * Le commandement ne compte que pour une bataille plus grande qu'une escarmouche.
 */
export function participationGlory({ size, tournament, resultId, role = "none" }, cfg) {
  const s = cfg.sizes[size];
  if (!s) return 0;
  const base = tournament ? s.tournamentGlory : s.glory;
  const command = ["combat", "skirmish"].includes(size) ? 0 : (cfg.commandGlory[role] ?? 0);
  return roundPendragon(base * (resultRow(resultId, cfg).glory + command));
}

/** Gloire d'un adversaire vaincu (divisée par dix avec des armes émoussées). */
export function opponentGlory(glory, tournament, cfg) {
  const g = Number(glory) || 0;
  return tournament ? roundPendragon(g * cfg.tournamentGlory) : g;
}

/**
 * Butin d'un chevalier (Tables 6.9 et 6.10), en livres. Nul hors victoire.
 * @param {{army:string, resultId:string, odds:string, favors:string, role:string, size:string, decisiveBonus?:number}} p
 */
export function lootFor({ army, resultId, odds, favors, role = "none", size, decisiveBonus = 0 }, cfg) {
  const row = resultRow(resultId, cfg);
  if (!row.loot) return 0;
  let loot = (cfg.armies[army] ?? 0) + (row.decisive ? Number(decisiveBonus) || 0 : 0);
  if (cfg.greatOdds.includes(odds)) loot *= favors === "allied" ? 0.5 : 2;
  const c = cfg.commandLoot[role] ?? {};
  if (c.add) loot *= 1 + c.add;
  if (c.times) loot *= c.times * Math.max(1, cfg.sizes[size]?.lootSize ?? 1);
  return Math.round(loot * 100) / 100;
}

/** Table 6.5 : chevaliers PNJ du conroi perdus, tués et capturés. */
export function conroiLosses(outcome, npcKnights, cfg) {
  const row = cfg.conroiLosses[outcome] ?? cfg.conroiLosses.failure;
  const n = Math.max(0, Number(npcKnights) || 0);
  const killed = roundPendragon(n * row.killed);
  const captured = roundPendragon(n * row.captured);
  return { lost: Math.max(roundPendragon(n * row.lost), killed + captured), killed, captured };
}

/** Postures possibles ce tour-ci. */
export function postureChoices({ firstCharge = false, forbidPrudent = false } = {}) {
  if (firstCharge) return ["reckless", "valorous"];
  return ["reckless", "valorous", "prudent", "cowardly"].filter(p => !(forbidPrudent && p === "prudent"));
}

/** Contre-charge : toujours au premier tour, sinon sur 1–2 au 1D6. */
export function counterCharges(round, die, cfg) {
  return round <= 1 || Number(die) <= cfg.counterChargeMax;
}

/** Livres affichées « 1 ½ £ », « 2,67 £ ». */
export function formatPounds(x) {
  const v = Math.round((Number(x) || 0) * 100) / 100;
  const whole = Math.floor(v);
  const frac = Math.round((v - whole) * 100);
  const named = { 25: "¼", 50: "½", 75: "¾" }[frac];
  if (named) return `${whole ? whole + " " : ""}${named} £`;
  return `${String(v).replace(".", ",")} £`;
}
