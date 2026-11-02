/**
 * Scénarios en solo (Livre du joueur, chap. 13) : tables en données, libellés reformulés.
 * Module pur (aucune dépendance à Foundry).
 *
 * Notation des Attributs :
 * - « skill.x », « trait.x.left|right », « honor » : comme sur la fiche ;
 * - « pair:x » : les deux traits de la paire (on peut cocher les deux) ;
 * - « passion:motif » : la meilleure passion dont le nom commence par le motif (pas de test si absente).
 * Choix laissés au joueur (« slots ») :
 * - { pick: "court" | "weapon" | "trait" | "virtue" | "list", n, options?, min?, exclude? } ;
 * - { oneOf: [clés] } : un seul Attribut parmi ceux-là.
 */

/** Motifs de passions (en tête du nom, sans accents ni casse). */
export const SOLO_PASSIONS = {
  homage: ["hommage", "allegeance"],
  love: ["amour"],
  loveFamily: ["amour (famille)"],
  loveSpouse: ["amour (conjoint", "amour (epou"],
  adoration: ["adoration"],
  devotion: ["devotion"],
  hospitality: ["hospitalite"],
  station: ["rang"],
  chivalry: ["chevalerie"],
  hate: ["haine"],
  loyaltyCompanions: ["loyaute (compagnons"]
};

const homageOrAllegiance = { oneOf: ["passion:homage"] };

/** Présence à la cour, chaque année de scénario standard. */
export const COURT_PRESENCE = {
  keys: ["skill.courtesy", "skill.hunting", "skill.intrigue", "skill.recognize", "skill.religion", "passion:love", "honor", "passion:hospitality"],
  slots: [{ pick: "virtue", n: 1 }, { pick: "court", n: 3 }]
};

/** Table 13.1 : missions du chevalier de maisonnée (1D20). */
export const STANDARD = [
  { min: 1, max: 3, id: "escort", keys: ["skill.awareness", "skill.courtesy", "skill.horsemanship", "skill.charge", "pair:temperate"], slots: [{ pick: "weapon", n: 1 }] },
  { min: 4, max: 9, id: "garrison", keys: ["skill.awareness", "skill.courtesy", "skill.firstAid", "skill.recognize", "pair:honest"], slots: [{ pick: "weapon", n: 1 }] },
  { min: 10, max: 10, id: "illness", keys: [], special: "illness" },
  { min: 11, max: 13, id: "tourney", keys: ["skill.awareness", "skill.horsemanship", "skill.charge", "skill.recognize", "skill.sword", "pair:generous"] },
  { min: 14, max: 16, id: "unusual", special: "unusual" },
  { min: 17, max: 18, id: "twice", rerolls: 2 },
  { min: 19, max: 20, id: "thrice", rerolls: 3 }
];

/** Table 13.2 : événements inhabituels (2D6). */
export const UNUSUAL = [
  { min: 2, max: 2, id: "royalCity" },
  { min: 3, max: 3, id: "lordVisit" },
  { min: 4, max: 4, id: "escortFar" },
  { min: 5, max: 6, id: "escortNear" },
  { min: 7, max: 8, id: "falseAlarm" },
  { min: 9, max: 10, id: "localTournament" },
  { min: 11, max: 11, id: "lordVisit" },
  { min: 12, max: 12, id: "revolt" }
];

/** Événements inhabituels joués comme une activité. */
export const ACTIVITIES = {
  escortNear: {
    keys: ["skill.hunting", "skill.courtesy", "skill.recognize", "skill.intrigue", "skill.religion", "skill.awareness",
      "pair:chaste", "pair:temperate", "honor"],
    slots: [{ pick: "virtue", n: 2 }, homageOrAllegiance,
      { pick: "list", n: 3, options: ["skill.singing", "skill.charge", "skill.dancing", "skill.orate", "skill.sword", "skill.falconry", "skill.gaming", "skill.flirting"] }]
  },
  escortFar: {
    keys: ["skill.hunting", "skill.courtesy", "skill.recognize", "skill.intrigue", "skill.religion", "skill.awareness",
      "pair:chaste", "pair:temperate", "honor", "skill.horsemanship", "pair:trusting", "pair:honest", "pair:prudent"],
    slots: [{ pick: "virtue", n: 2 }, homageOrAllegiance,
      { pick: "list", n: 3, options: ["skill.singing", "skill.charge", "skill.dancing", "skill.orate", "skill.sword", "skill.falconry", "skill.gaming", "skill.flirting"] },
      { oneOf: ["passion:adoration", "passion:loveSpouse", "passion:devotion", "passion:hospitality"] }]
  },
  localTournament: {
    keys: ["skill.battle", "skill.charge", "skill.sword", "skill.horsemanship", "skill.spear", "skill.recognize", "skill.awareness",
      "pair:forgiving", "pair:merciful", "pair:modest", "pair:prudent", "pair:temperate"],
    slots: [{ pick: "weapon", n: 1, min: 11, exclude: ["skill.sword", "skill.spear"] }, homageOrAllegiance],
    special: "tournament"
  },
  revolt: { keys: ["skill.charge"], slots: [{ pick: "weapon", n: 1 }], special: "revolt" }
};

/** Tournoi local : 5 Gloire, plus 10 par compétence réussie (20 sur un critique) ; prix 1D6+1 £. */
export const LOCAL_TOURNAMENT = { glory: 5, success: 10, critical: 20, prize: "1D6+1", winSkills: ["skill.battle", "skill.charge"] };

/** Révolte paysanne : traits cochés à volonté, dans cet ordre ; 60 d. chacun (120 si Charge et l'arme réussissent). */
export const REVOLT = { traits: ["trait.forgiving.right", "trait.generous.right", "trait.just.right", "trait.merciful.right", "trait.spiritual.right", "trait.honest.right"], pay: 60, payBoth: 120 };

/**
 * Visites : Table 13.5 (ville royale) et 13.6 (suzerain d'un seigneur), 1D6.
 * court : compétences de cour au choix ; traits : traits au choix ; pairs : paires testées ; passions.
 */
export const VISITS = {
  royalCity: [
    { court: 3, traits: 0, pairs: ["chaste", "spiritual", "generous"], passions: ["passion:adoration", "honor", "passion:station"] },
    { court: 2, traits: 1, pairs: ["energetic", "just", "modest"], passions: ["passion:loveFamily", "passion:devotion", "passion:station"] },
    { court: 2, traits: 2, pairs: ["honest", "forgiving", "prudent"], passions: ["passion:loveSpouse", "passion:devotion", "passion:hospitality"] },
    { court: 3, traits: 1, pairs: ["chaste", "trusting", "temperate"], passions: ["passion:chivalry", "honor"] },
    { court: 1, traits: 2, pairs: ["energetic", "generous", "honest"], passions: ["passion:love", "passion:hospitality", "passion:loyaltyCompanions"] },
    { court: 0, traits: 3, pairs: ["generous", "just", "prudent"], passions: ["passion:hate", "passion:homage"] }
  ],
  lordVisit: [
    { court: 1, traits: 0, pairs: ["chaste", "generous"], passions: ["passion:adoration", "honor"] },
    { court: 1, traits: 1, pairs: ["energetic", "modest"], passions: ["passion:loveFamily"] },
    { court: 2, traits: 1, pairs: ["forgiving", "prudent"], passions: ["passion:hospitality"] },
    { court: 1, traits: 2, pairs: ["trusting", "temperate"], passions: ["passion:chivalry", "honor"] },
    { court: 1, traits: 2, pairs: ["spiritual", "honest"], passions: ["passion:loyaltyCompanions", "passion:station"] },
    { court: 0, traits: 3, pairs: ["generous", "just"], passions: ["passion:chivalry", "passion:homage"] }
  ]
};

/** Perdu dans les bois : bonus des tests de Chasse et de Vigilance de la saison. */
export const LOST_TEST_MOD = { critical: 10, success: 5, failure: -5, fumble: -10 };

/**
 * Table 13.3 : perdu dans les bois (1D20 + modificateurs, une fois par saison).
 * home : on rentre ; next : modificateur de la saison suivante ; check : cases cochées ;
 * con : CON −1 ; conTest : test de CON, échec → Table 14.4 ; decline : Table 14.4 ; fear : obsession Peur (Fées) ;
 * eye : œil perdu la première fois (Vigilance −5) ; ride : test d'Équitation, échec → cheval perdu ; far : plus perdu, mais loin.
 */
export const LOST = [
  { max: 3, id: "starve", con: -1 },
  { max: 5, id: "wander" },
  { max: 7, id: "villager", home: true, check: ["skill.folklore"] },
  { max: 9, id: "beast", next: -5, check: ["skill.hunting"] },
  { max: 10, id: "bandits", next: -5, check: ["skill.battle"] },
  { max: 11, id: "trail", check: ["skill.hunting"] },
  { max: 12, id: "stream", conTest: true },
  { max: 13, id: "faeEye", fear: true, eye: true },
  { max: 14, id: "faeDecline", fear: true, decline: true },
  { max: 16, id: "hunter", home: true, check: ["passion:devotion"] },
  { max: 17, id: "rough", ride: true },
  { max: 18, id: "woodsman", far: true, check: ["trait.trusting.left"] },
  { max: 19, id: "hermit", home: true, check: ["trait.trusting.left"] },
  { max: 999, id: "arrive", home: true }
];

/**
 * Table 13.4 : activité pendant la folie (1D20, une fois par an au plus). Cases cochées directement.
 * either : une case au choix parmi celles-là ; honor : perte d'Honneur ; cured : la folie cesse ;
 * visit : scénario « Visiter une ville royale ».
 */
export const MADNESS = [
  { roll: 1, check: ["skill.folklore", "skill.stewardship", "skill.awareness"] },
  { roll: 2, fear: true, decline: true },
  { roll: 3, check: ["skill.courtesy", "skill.recognize"], cured: true },
  { roll: 4, visit: "royalCity", cured: true },
  { roll: 5, check: ["skill.hunting", "skill.awareness"] },
  { roll: 6, check: ["skill.hunting", "skill.awareness"], cured: true },
  { roll: 7, check: ["trait.spiritual.left"], cured: true },
  { roll: 8, check: ["trait.energetic.left", "trait.spiritual.right", "skill.hunting"] },
  { roll: 9, either: ["skill.chirurgery", "skill.firstAid"], check: ["skill.religion"], cured: true },
  { roll: 10, either: ["skill.chirurgery", "skill.firstAid"], check: ["skill.religion"], cured: true },
  { roll: 11, check: ["skill.folklore", "trait.forgiving.left"], honor: -1 },
  { roll: 12, check: ["skill.bow", "skill.hunting", "skill.brawling"], honor: -3 },
  { roll: 13, check: ["trait.generous.left", "skill.firstAid", "trait.spiritual.left"] },
  { roll: 14, check: ["skill.hunting", "skill.awareness"] },
  { roll: 15, check: ["skill.hunting", "skill.awareness"] },
  { roll: 16, gear: true },
  { roll: 17, check: ["passion:homage", "passion:station", "trait.merciful.left"], cured: true },
  { roll: 18, check: ["skill.orate", "skill.folklore", "skill.intrigue"], cured: true },
  { roll: 19, fear: true, eye: true },
  { roll: 20, check: ["trait.trusting.left", "trait.spiritual.left", "trait.merciful.left"], cured: true }
];

/** Pèlerinage : sites (Tables 13.7 et 13.8) et cases cochées ; « literacy » seulement si la compétence dépasse 0. */
export const PILGRIMAGE = {
  christian: [
    { id: "amesbury", name: "Abbaye d'Amesbury (Salisbury)", check: ["trait.spiritual.left", "trait.forgiving.left", "skill.literacy", "skill.religion"] },
    { id: "glastonbury", name: "Abbaye de Glastonbury (Summerland)", check: ["trait.spiritual.left", "skill.singing", "skill.religion"] },
    { id: "bardsey", name: "Abbaye Sainte-Marie, île de Bardsey (Estregales)", check: ["trait.spiritual.left", "trait.forgiving.left", "skill.religion"] },
    { id: "salisbury", name: "Cathédrale de Sarum (Salisbury)", check: ["trait.spiritual.left", "trait.modest.left", "skill.religion"] },
    { id: "stephen", name: "Cathédrale Saint-Étienne, Londinium", check: ["trait.spiritual.left", "trait.merciful.left", "skill.courtesy", "skill.religion"] },
    { id: "paul", name: "Cathédrale Saint-Paul, Londinium", check: ["trait.spiritual.left", "trait.modest.left", "skill.courtesy", "skill.religion"] },
    { id: "canterbury", name: "Église de Canterbury (Kent)", check: ["trait.spiritual.left", "trait.modest.left", "skill.religion"] },
    { id: "alban", name: "Église Saint-Alban (Hartland)", check: ["trait.spiritual.left", "trait.merciful.left", "skill.orate", "skill.religion"] },
    { id: "julius", name: "Églises Saint-Jules et Saint-Aaron, Carlion", check: ["trait.chaste.left", "trait.spiritual.left", "skill.orate", "skill.religion"] },
    { id: "illtud", name: "Grande église Saint-Illtud (Escavalon)", check: ["trait.spiritual.left", "skill.literacy", "skill.religion"] },
    { id: "winifred", name: "Puits de Sainte-Winifred (Cambrie)", check: ["trait.chaste.left", "trait.spiritual.left", "skill.singing", "skill.religion"] },
    { id: "menevia", name: "Monastère de Menevia (Estregales)", check: ["trait.spiritual.left", "trait.temperate.left", "skill.religion"] }
  ],
  pagan: [
    { id: "cerne", name: "Le Géant de Cerne Abbas (Dorsette)", check: ["trait.spiritual.left", "trait.chaste.right", "skill.religion"] },
    { id: "dulverton", name: "Avant-poste du Bois sacré, Dulverton (Cornouailles)", check: ["trait.spiritual.left", "skill.literacy", "skill.religion"] },
    { id: "nottingham", name: "Bois sacré de la Source, Nottingham", check: ["trait.spiritual.left", "skill.literacy", "skill.religion"] },
    { id: "stonehenge", name: "Stonehenge (Salisbury)", check: ["trait.spiritual.left", "trait.modest.right", "skill.religion"] },
    { id: "hurlers", name: "Cercle des Hurlers (Cornouailles)", check: ["trait.spiritual.left", "skill.religion", "skill.singing"] },
    { id: "rollright", name: "Pierres des Hommes du Roi (Tribuit)", check: ["trait.spiritual.left", "skill.singing", "skill.folklore", "skill.religion"] },
    { id: "uffington", name: "Chevaux blancs d'Uffington (Gentian)", check: ["trait.spiritual.left", "trait.energetic.left", "skill.religion"] },
    { id: "govannon", name: "Forge de Govannon (Gentian)", check: ["trait.spiritual.left", "trait.modest.right", "skill.religion"] },
    { id: "oakfort", name: "Fort du Chêne, Sarum", check: ["trait.spiritual.left", "skill.stewardship", "skill.religion"] },
    { id: "sulis", name: "Eaux de Sulis, Bath", check: ["trait.spiritual.left", "trait.honest.left", "skill.courtesy", "skill.religion"] },
    { id: "mariner", name: "Monastère du Marin (Glevum)", check: ["trait.spiritual.left", "trait.generous.left", "skill.courtesy", "skill.religion"] },
    { id: "hantonne", name: "Passages de Hantonne (île de Wight)", check: ["trait.spiritual.left", "trait.energetic.left", "skill.folklore", "skill.religion"] }
  ],
  /** Coût d'un pèlerinage noble : 1 £ par 80 km aller-retour. Ascète : Modeste et Dévotion cochés, jet de vieillissement. */
  poundsPer80km: 1,
  ascetic: ["trait.modest.left", "passion:devotion"],
  /** Test de Dévotion : nombre de miracles ; échec critique : pas de pèlerinage pendant 1D6 ans. */
  miracles: { critical: 3, success: 1, failure: 0, fumble: 0 },
  banned: "1D6"
};

/** Miracles (au choix du joueur). */
export const MIRACLES = ["survival", "healRate", "cure", "sanity", "hp", "char", "story"];
export const MIRACLE_DICE = { healRate: "1D3", hp: "1D3+3", char: "1D2" };

/** Choix d'activité de l'étape 1. */
export const SOLO_KINDS = ["standard", "royalCity", "lordVisit", "lost", "madness", "pilgrimage"];

/* -------------------------------------------- */
/*  Règles                                       */
/* -------------------------------------------- */

const inRange = (rows, n) => rows.find(r => n >= r.min && n <= r.max) ?? null;

/** Ligne de la Table 13.1. */
export function standardRow(d20) {
  return inRange(STANDARD, Number(d20) || 1);
}

/** Ligne de la Table 13.2. */
export function unusualRow(r2d6) {
  return inRange(UNUSUAL, Number(r2d6) || 7);
}

/**
 * Activités de l'année d'après la Table 13.1. `roll()` rend un 1D20 ; les relances (17–20) ignorent
 * les résultats de 17 ou plus (on relance).
 * @param {() => number} roll
 * @returns {{dice:number[], rows:object[]}}
 */
export function standardActivities(roll) {
  const dice = [];
  const first = roll();
  dice.push(first);
  const row = standardRow(first);
  if (!row.rerolls) return { dice, rows: [row] };
  const rows = [];
  let guard = 0;
  while (rows.length < row.rerolls && guard++ < 50) {
    const d = roll();
    dice.push(d);
    if (d >= 17) continue;
    rows.push(standardRow(d));
  }
  return { dice, rows };
}

/** Résultat d'une saison perdu dans les bois. */
export function lostRow(total) {
  return LOST.find(r => total <= r.max);
}

/** Modificateur d'un test de Chasse ou de Vigilance pour la table « perdu dans les bois ». */
export function lostTestMod(outcome) {
  return LOST_TEST_MOD[outcome] ?? 0;
}

/** Ligne de la Table 13.4. */
export function madnessRow(d20) {
  return MADNESS.find(r => r.roll === Number(d20)) ?? MADNESS[0];
}

/** Ligne d'une table de visite (1D6). */
export function visitRow(kind, d6) {
  const t = VISITS[kind];
  return t ? t[Math.max(1, Math.min(6, Number(d6) || 1)) - 1] : null;
}

/** Révolte : deniers gagnés pour n traits cochés. */
export function revoltPay(n, bothSucceeded) {
  return Math.max(0, Math.min(REVOLT.traits.length, Number(n) || 0)) * (bothSucceeded ? REVOLT.payBoth : REVOLT.pay);
}

/** Tournoi local : Gloire d'après les tests de compétences (résultats par clé). */
export function localTournamentGlory(results) {
  let g = LOCAL_TOURNAMENT.glory;
  for (const r of results) {
    if (!r.key.startsWith("skill.")) continue;
    if (r.outcome === "critical") g += LOCAL_TOURNAMENT.critical;
    else if (r.outcome === "success") g += LOCAL_TOURNAMENT.success;
  }
  return g;
}

/** Le tournoi est gagné sur deux critiques (Bataille et Charge). */
export function wonLocalTournament(results) {
  return LOCAL_TOURNAMENT.winSkills.every(k => results.some(r => r.key === k && r.outcome === "critical"));
}

/** Clés à tester d'une liste : « pair:x » donne les deux côtés ; doublons retirés. */
export function expandKeys(keys) {
  const out = [];
  for (const k of keys) {
    if (k.startsWith("pair:")) { const id = k.slice(5); out.push(`trait.${id}.left`, `trait.${id}.right`); }
    else out.push(k);
  }
  return [...new Set(out)];
}

/** Effet d'un test d'expérience de scénario en solo. */
export function soloTestEffect(kind, outcome, { critGlory = true } = {}) {
  const fx = { check: false, glory: 0, opposite: false, passionLoss: 0 };
  if (outcome === "success" || outcome === "critical") fx.check = true;
  if (outcome === "critical" && critGlory) fx.glory = 10;
  if (outcome === "fumble" && kind === "trait") fx.opposite = true;
  if (outcome === "fumble" && kind === "passion") fx.passionLoss = 1;
  return fx;
}
