/**
 * Données de référence du système.
 * Tout ce qui dépend de la culture ou de la religion est décrit ici sous forme
 * de données, pour pouvoir ajouter d'autres cultures sans toucher à la logique.
 */

import { MANOR } from "./domain/tables.mjs";

export const SYSTEM_ID = "pendragon-vf";

export const PDVF = {};

/** Caractéristiques (identifiants neutres, libellés dans lang/fr.json). */
PDVF.characteristics = ["siz", "dex", "str", "con", "app"];

/**
 * Compétences de base. `group` : general | combat.
 * L'ordre d'affichage est alphabétique selon le libellé traduit.
 */
PDVF.skills = {
  awareness: { group: "general" },
  chirurgery: { group: "general" },
  compose: { group: "general" },
  courtesy: { group: "general" },
  dancing: { group: "general" },
  falconry: { group: "general" },
  fashion: { group: "general" },
  firstAid: { group: "general" },
  flirting: { group: "general" },
  folklore: { group: "general" },
  gaming: { group: "general" },
  hunting: { group: "general" },
  industry: { group: "general" },
  intrigue: { group: "general" },
  literacy: { group: "general" },
  orate: { group: "general" },
  playInstrument: { group: "general" },
  recognize: { group: "general" },
  religion: { group: "general" },
  singing: { group: "general" },
  stewardship: { group: "general" },
  battle: { group: "combat" },
  horsemanship: { group: "combat" },
  bow: { group: "combat" },
  brawling: { group: "combat" },
  charge: { group: "combat" },
  crossbow: { group: "combat" },
  greatWeapon: { group: "combat" },
  hafted: { group: "combat" },
  spear: { group: "combat" },
  sword: { group: "combat" },
  thrown: { group: "combat" }
};

/** Les treize paires de traits : la valeur stockée est celle du trait de gauche. */
PDVF.traits = [
  "chaste", "trusting", "spiritual", "energetic", "generous", "honest", "forgiving",
  "just", "merciful", "modest", "prudent", "temperate", "valorous"
];

/** Cours de passions et plafond de la somme d'une cour. */
PDVF.passionCourts = ["fidelitas", "fervor", "adoratio", "civilitas"];
PDVF.passionCourtMax = 40;

/**
 * Religions : vertus exprimées en « trait.côté ».
 * `religiousBonus` : bénéfice de l'idéal du chevalier Religieux de cette religion (Livre du maître,
 * chap. 4 : chrétien p. 68, païen p. 84, barbare p. 97, odiniste p. 100) ; clés des effets d'idéaux
 * (voir PDVF.ideals).
 * D'autres religions pourront être ajoutées ici (ou par un module) sans autre changement.
 */
PDVF.religions = {
  christian: {
    label: "PDVF.Religion.christian",
    deity: "Dévotion (Dieu)",
    virtues: ["chaste.left", "spiritual.left", "forgiving.left", "merciful.left", "modest.left", "temperate.left"],
    religiousBonus: { hp: 4 }
  },
  pagan: {
    label: "PDVF.Religion.pagan",
    deity: "Dévotion (Dieux)",
    virtues: ["spiritual.left", "energetic.left", "modest.right", "generous.left", "honest.left", "chaste.right"],
    // Le Livre du joueur (p. 127) ajoute « Dégâts +2 » ; on suit le Livre du maître (choix de l'utilisateur).
    religiousBonus: { healRate: 2 }
  },
  odinist: {
    label: "PDVF.Religion.odinist",
    deity: "Dévotion (Dieux)",
    virtues: ["temperate.right", "modest.right", "generous.left", "spiritual.right", "prudent.right", "valorous.left"],
    religiousBonus: { damageDice: 1 }
  },
  barbarian: {
    label: "PDVF.Religion.barbarian",
    deity: "Dévotion (Dieux)",
    virtues: ["just.right", "spiritual.left", "modest.right", "honest.left", "trusting.right", "forgiving.right"],
    religiousBonus: { move: 10, healRate: 1 }
  }
};

/**
 * Idéaux (Livre du joueur, chap. 6, p. 126–128 ; chevalier Maléfique : Livre du maître, p. 83).
 * Les bénéfices sont acquis dès que les conditions sont remplies, et perdus dès qu'elles ne le sont plus.
 * Conditions :
 * - traits + total : somme minimale des traits listés (« trait.côté ») ; `directed` : traits auxquels
 *   s'ajoute le meilleur trait dirigé du même nom (le Croyant du Romantique, dirigé vers l'être aimé) ;
 * - virtues : valeur minimale de chacune des vertus de la religion du chevalier ;
 * - passions : motif en tête du nom (sans accents ni casse), meilleure valeur s'il y en a plusieurs ;
 * - skills : compétences de la fiche.
 * Effets (cumulables entre idéaux) : hp, healRate, move, damageDice, armor (armure de vertu) ;
 * `religion: true` ajoute le `religiousBonus` de la religion du chevalier.
 * glory : Gloire passive annuelle. invoke : passion invocable seulement avec l'idéal.
 * protection : passion testée contre la magie et les miracles. gmOnly : activé par le MJ sur la fiche.
 */
PDVF.ideals = {
  courteous: {
    traits: ["energetic.left", "generous.left", "just.left", "merciful.left", "modest.left", "valorous.left"], total: 96,
    passions: [{ match: "chevalerie", label: "Chevalerie", min: 15 }, { match: "hospitalite", label: "Hospitalité", min: 10 }, { match: "rang", label: "Rang", min: 10 }],
    effects: { armor: 4 }, glory: 150, invoke: "chevalerie", protection: "chevalerie"
  },
  religious: {
    virtues: 16,
    passions: [{ match: "devotion", label: "Dévotion", min: 16 }],
    skills: [{ id: "religion", min: 10 }],
    religion: true, glory: 100, invoke: "devotion", protection: "devotion"
  },
  romantic: {
    traits: ["chaste.left", "spiritual.left", "generous.left", "honest.left", "modest.left", "temperate.left"], total: 90,
    directed: ["spiritual.left"],
    passions: [{ match: "adoration", label: "Adoration", min: 10 }],
    glory: 0, protection: "adoration"
  },
  wicked: {
    traits: ["merciful.right", "generous.right", "modest.right", "trusting.right", "forgiving.right", "honest.right"], total: 96,
    glory: 0, gmOnly: true
  }
};

/**
 * Table Ronde (Livre du joueur, p. 128–129) : bénéfices à l'admission et chaque année,
 * passions conseillées (motifs comme pour les idéaux) et seuil de Gloire des candidats.
 */
PDVF.roundTable = {
  honor: 5, glory: 1000, giftPounds: 10, living: "rich", gloryHint: 8000,
  passions: [
    { match: "honor", label: "Honneur", min: 15 },
    { match: "hommage (roi arthur)", label: "Hommage (roi Arthur)", min: 16 },
    { match: "devotion", label: "Dévotion", min: 10 },
    { match: "rang", label: "Rang", min: 10 },
    { match: "hospitalite", label: "Hospitalité", min: 10 },
    { match: "chevalerie", label: "Chevalerie", min: 15 }
  ]
};

/** Classes de chevaliers proposées dans la liste (champ libre accepté aussi). */
PDVF.knightClasses = ["squire", "household", "mercenary", "vassal", "banneret"];

/** Niveaux de vie. */
PDVF.livingStandards = ["destitute", "poor", "ordinary", "rich", "sumptuous", "superlative"];

/** Passions de départ créées avec un nouveau chevalier (valeurs de la méthode « construite »). */
PDVF.defaultPassions = [
  { court: "fidelitas", key: "homage", value: 15 },
  { court: "fervor", key: "loveFamily", value: 10 },
  { court: "adoratio", key: "devotion", value: 5 },
  { court: "civilitas", key: "station", value: 10 },
  { court: "civilitas", key: "hospitality", value: 10 }
];

/** Modificateurs proposés dans le panneau de la fiche (Table 2.1). */
PDVF.quickModifiers = [-10, -5, 0, 5, 10];

/** Passions au bonus particulier (motif sur le nom). Livre du joueur p. 88 : l'Adoration donne +10 Inspiré ou Enflammé. */
PDVF.passionBonuses = [
  { pattern: "^adoration\\b", inspired: 10, impassioned: 10 }
];

/** Types d'Attributs qu'une passion peut inspirer (« une seule compétence ou trait »). */
PDVF.inspirableKinds = ["skill", "trait"];

/* -------------------------------------------- */
/*  PNJ et suivants                             */
/* -------------------------------------------- */

/** Catégories de PNJ. L'écuyer a en plus son propre bloc. */
PDVF.npcCategories = ["squire", "follower", "character", "creature"];

/** Valeur d'une compétence non notée sur la fiche d'un PNJ (Livre du joueur, écuyers). */
PDVF.npcDefaultSkill = 5;

/**
 * Écuyers (Livre du joueur, chap. 12, Table 12.7) : origine tirée sur 1D20 (ou choisie par le MJ),
 * modificateurs à la compétence Écuyer et aux compétences chevaleresques de l'écuyer.
 */
PDVF.squireOrigins = [
  { id: "esquireSon", range: [1, 5], squire: -2, knightly: -1 },
  { id: "youngerSon", range: [6, 10], squire: -1, knightly: 0 },
  { id: "secondSon", range: [11, 15], squire: 0, knightly: 0 },
  { id: "heir", range: [16, 20], squire: 2, knightly: 1 },
  { id: "holyChild", range: null, squire: -4, knightly: -2 },
  { id: "commonerChild", range: null, squire: -7, knightly: -3 }
];

/** Compétence Écuyer : 15 + modificateur d'origine. */
PDVF.squireSkillBase = 15;

/** Compétences de l'écuyer égales à « âge − 9 » (+ modificateur), plus une compétence non martiale au choix. */
PDVF.squireKnightlySkills = ["horsemanship", "brawling", "charge", "sword"];
PDVF.squireKnightlyOffset = 9;
PDVF.squireDefaultOther = "courtesy";
PDVF.squireHomage = 15;
PDVF.squireMaxAge = 21;

/** Cour d'une passion d'après le premier mot de son nom (conversion d'un PNJ en chevalier). */
PDVF.passionCourtKeywords = {
  fidelitas: ["hommage", "allegeance", "loyaute", "fidelite", "devoir"],
  fervor: ["amour", "haine"],
  adoratio: ["devotion", "adoration"],
  civilitas: ["rang", "hospitalite", "chevalerie"]
};

/* -------------------------------------------- */
/*  Chevaux (Livre du joueur, chap. 10)         */
/* -------------------------------------------- */

/**
 * Types de chevaux (Tables 10.2 à 10.4) et prix (liste des prix, en deniers : 240 d. = 1 £).
 * group : war (entraîné au combat) | riding | work | fae. charge : dégâts de Charge montée (chevaux de combat).
 * notes : identifiant de commentaire (traduit). Données ouvertes : un supplément peut en ajouter.
 */
PDVF.horseTypes = {
  hobby:          { group: "war",    damage: "2D6", charge: "4D6", move: 18, armor: 5, siz: 30, dex: 15, str: 26, con: 12, price: 480, note: "skirmish" },
  destrierSmall:  { group: "war",    damage: "3D6", charge: "5D6", move: 15, armor: 4, siz: 32, dex: 13, str: 30, con: 12, price: 960 },
  destrier:       { group: "war",    damage: "3D6", charge: "6D6", move: 16, armor: 5, siz: 40, dex: 13, str: 32, con: 15, price: 1920 },
  faeHorse:       { group: "fae",    damage: "4D6", charge: "7D6", move: 27, armor: 8, siz: 42, dex: 25, str: 42, con: 20, price: 48000, note: "fae" },
  genet:          { group: "riding", damage: "2D6", move: 16, armor: 3, siz: 34, dex: 16, str: 30, con: 15, price: 480, note: "ambles" },
  roncinInferior: { group: "riding", damage: "2D6", move: 14, armor: 3, siz: 26, dex: 11, str: 22, con: 16, price: 120 },
  roncinSmall:    { group: "riding", damage: "2D6", move: 15, armor: 4, siz: 30, dex: 12, str: 26, con: 18, price: 180 },
  roncin:         { group: "riding", damage: "3D6", move: 16, armor: 4, siz: 36, dex: 12, str: 32, con: 18, price: 240 },
  roncinLarge:    { group: "riding", damage: "3D6", move: 16, armor: 5, siz: 40, dex: 10, str: 36, con: 18, price: 360 },
  courser:        { group: "riding", damage: "2D6", move: 20, armor: 5, siz: 35, dex: 16, str: 31, con: 15, price: 480, note: "ambles" },
  pony:           { group: "riding", damage: "2D6", move: 14, armor: 4, siz: 25, dex: 17, str: 21, con: 20, price: 240, note: "hills" },
  cartHorse:      { group: "work",   damage: "3D6", move: 14, armor: 3, siz: 33, dex: 10, str: 33, con: 12, price: 120, note: "draught" },
  bidet:          { group: "work",   damage: "3D6", move: 15, armor: 3, siz: 33, dex: 10, str: 33, con: 12, price: 120, note: "riding" },
  haridelle:      { group: "work",   damage: "2D6", move: 12, armor: 2, siz: 24, dex: 10, str: 18, con: 7,  price: 120, note: "peasant" },
  sumpter:        { group: "work",   damage: "3D6", move: 14, armor: 3, siz: 30, dex: 12, str: 30, con: 16, price: 120, note: "pack" },
  sumpterStrong:  { group: "work",   damage: "4D6", move: 15, armor: 4, siz: 32, dex: 13, str: 35, con: 16, price: 240, note: "pack" },
  haquenee:       { group: "work",   damage: "3D6", move: 14, armor: 3, siz: 34, dex: 10, str: 34, con: 14, price: 180, note: "draught" },
  donkey:         { group: "work",   damage: "3D6", move: 12, armor: 3, siz: 26, dex: 18, str: 30, con: 15, price: 60,  note: "pack" },
  mule:           { group: "work",   damage: "4D6", move: 16, armor: 6, siz: 32, dex: 17, str: 38, con: 25, price: 60,  note: "draughtPack" }
};

/** Robes : Gloire passive annuelle (une fois par robe) et supplément de prix en livres (Période de l'Enfant-roi). */
PDVF.horseColors = {
  bay:      { glory: 0,  price: 0 },
  chestnut: { glory: 15, price: 15 },
  grey:     { glory: 25, price: 25 },
  white:    { glory: 50, price: null },
  palomino: { glory: 5,  price: 5 },
  cream:    { glory: 0,  price: 5 },
  dun:      { glory: 0,  price: 0 },
  black:    { glory: 0,  price: 0 }
};

PDVF.horseSexes = ["stallion", "gelding", "mare"];

/** Équitation nécessaire pour monter un étalon sans difficulté ; Gloire passive du cheval de guerre monté ainsi. */
PDVF.horseStallionSkill = 15;
PDVF.horseWarGlory = 15;

/** Tours (dressage unique), +25 % du prix chacun. */
PDVF.horseTricks = ["comes", "sits", "rears", "rolls", "dances", "counts"];

/** Personnalité (Table 10.5, 1D20). */
PDVF.horsePersonality = ["loyal", "willing", "gentle", "affectionate", "stoic", "alert", "resilient", "careful", "faeTouched", "clever",
  "aggressive", "brave", "stubborn", "mischievous", "greedy", "nervous", "biter", "destructive", "clumsy", "rebellious"];

/** Armures pour chevaux (Table 10.7) : protection et FOR minimale. */
PDVF.horseBarding = {
  none:           { armor: 0, str: 0 },
  caparisonOpen:  { armor: 0, str: 0 },
  caparisonHalf:  { armor: 0, str: 0 },
  caparisonFull:  { armor: 0, str: 0 },
  paddedFull:     { armor: 1, str: 30 },
  gambisonHalf:   { armor: 2, str: 32 },
  gambisonFull:   { armor: 4, str: 34 }
};

/** Chevaux de départ d'un chevalier (Livre du joueur, p. 54 et Table 3.8) : type et rôle. */
PDVF.startingHorses = [
  { type: "destrier", role: "war", sex: "gelding" },
  { type: "roncin", role: "riding", sex: "gelding" },
  { type: "roncin", role: "squire", sex: "gelding" },
  { type: "sumpter", role: "pack", sex: "mare" }
];

/* -------------------------------------------- */
/*  Batailles (Livre du maître, chap. 6)        */
/* -------------------------------------------- */

PDVF.battle = {
  /** Table 6.1 : tours maximum et Intensité aléatoire ; Tables 6.6 et 6.10 : Gloire et multiplicateur de butin. */
  sizes: {
    combat:     { rounds: 1, intensity: "1D6+2", glory: 5,  tournamentGlory: 0, lootSize: 0, armyTests: false },
    skirmish:   { rounds: 3, intensity: "2D6",   glory: 5,  tournamentGlory: 0, lootSize: 0, armyTests: false },
    clash:      { rounds: 5, intensity: "2D6+1", glory: 10, tournamentGlory: 1, lootSize: 0, armyTests: true },
    small:      { rounds: 6, intensity: "2D6+2", glory: 20, tournamentGlory: 2, lootSize: 1, armyTests: true },
    medium:     { rounds: 7, intensity: "2D6+3", glory: 30, tournamentGlory: 3, lootSize: 2, armyTests: true },
    large:      { rounds: 8, intensity: "3D6",   glory: 45, tournamentGlory: 5, lootSize: 3, armyTests: true },
    huge:       { rounds: 8, intensity: "3D6+1", glory: 60, tournamentGlory: 6, lootSize: 4, armyTests: true }
  },
  /** Compétence de Bataille d'un commandant inconnu. */
  commanderSkill: "2D6+10",
  /** Table 6.2 : rapport de forces (bonus du camp le plus nombreux, malus de l'autre). */
  odds: { even: 0, r15: 2, r2: 5, r3: 7, r5: 10 },
  /** Rapports qui comptent comme « grande infériorité numérique » (2:1 ou plus) pour le résultat et le butin. */
  greatOdds: ["r2", "r3", "r5"],
  /** Table 6.2 : autres circonstances (mod : camp concerné ; other : camp adverse). */
  commanderMods: {
    homeGround: { mod: 5 },
    lastStand: { mod: 5 },
    scouts: { mod: 5 },
    fatigue: { mod: -5, other: 5 },
    disease: { mod: -5, other: 5 },
    divided: { mod: -5 }
  },
  /** Postures : tours de combat et effet sur le Moral (appliqué à la fin de la rencontre). */
  postures: {
    reckless: { rounds: 3, morale: "1D3", trait: "trait.prudent.right" },
    valorous: { rounds: 2, morale: "", trait: "trait.valorous.left" },
    prudent:  { rounds: 1, morale: "-1D3", trait: "trait.prudent.left" },
    cowardly: { rounds: 0, morale: "", trait: "" }
  },
  /** Lâche : perte d'Honneur et de Moral (si le chevalier a plus de la moitié de ses PV). */
  cowardHonorLoss: 1,
  cowardMorale: "1D6",
  /** Repli vers les lignes arrière : Moral regagné par tour, Premiers soins des soigneurs. */
  rearMorale: "1D6",
  rearFirstAid: "14+1D6",
  /** Seul sur le champ de bataille : malus au test de Bataille. */
  alonePenalty: -10,
  /** Échec critique du commandant d'armée allié : malus de Bataille au premier tour. */
  firstRoundPenalty: -5,
  /** Contre-charge après le premier tour : 1D6, oui sur 1–2. */
  counterChargeMax: 2,
  /** Table 6.5 : pertes du conroi (parts des chevaliers PNJ). */
  conroiLosses: {
    critical: { lost: 0, killed: 0, captured: 0 },
    success:  { lost: 0.1, killed: 0, captured: 0.1 },
    failure:  { lost: 0.2, killed: 0.1, captured: 0.1 },
    fumble:   { lost: 0.5, killed: 0.3, captured: 0.2 }
  },
  /** Résultat de la bataille : seuils du rapport VC ennemies / VC perdues. */
  results: [
    { id: "decisiveVictory", min: 4, glory: 2, loot: true, decisive: true },
    { id: "victory", min: 2, glory: 1.5, loot: true },
    { id: "indecisive", min: 0.5, glory: 1 },
    { id: "defeat", min: 0.25, glory: 0.75 },
    { id: "decisiveDefeat", min: 0, glory: 0.5 }
  ],
  /** Table 6.8 : multiplicateur de Gloire du commandement (s'ajoute à celui du résultat). */
  commandGlory: { none: 0, conroi: 2, division: 3, army: 5 },
  /** Table 6.10 : butin selon le commandement (conroi : +⅓ ; division et armée : × taille). */
  commandLoot: { none: { add: 0 }, conroi: { add: 1 / 3 }, division: { times: 3 }, army: { times: 10 } },
  /** Victoire décisive : butin supplémentaire. */
  decisiveLoot: "2D3",
  /** Table 6.9 : butin de base (£) selon l'armée adverse. */
  armies: { feudal: 2, feudalLesser: 1.5, saxon: 1, cymric: 0.5, pict: 0.25 },
  /** Mêlée de tournoi : Intensité divisée par deux, Gloire des adversaires divisée par dix. */
  tournamentIntensity: 0.5,
  tournamentGlory: 0.1,
  /** Valeur de chevalier d'un chevalier (PJ ou PNJ) perdu. */
  knightValue: 1,

  /** Résultats possibles d'un test (pour imposer celui d'un commandant d'armée). */
  outcomes: ["critical", "success", "failure", "fumble"],
  /** Première charge du premier tour : selon le test du commandant allié, toujours, jamais. */
  firstChargeModes: ["test", "always", "never"],
  /**
   * Effets des événements de tour, des conditions et des tables d'événements.
   * input : number (entier signé), formula (dés), choice (liste), text (note pour le MJ) ;
   * cards : le réglage vise des cartes du paquet (opposants ou opportunités).
   */
  effects: {
    battleMod:      { input: "number" },
    combatPc:       { input: "number" },
    combatEnemy:    { input: "number" },
    combatAll:      { input: "number" },
    height:         { input: "number" },
    intensity:      { input: "number" },
    morale:         { input: "formula" },
    moraleLossMult: { input: "number" },
    enemyCount:     { input: "number" },
    charge:         { input: "choice", choices: ["none", "auto", "enemy"] },
    encounter:      { input: "choice", choices: ["impose", "restrict", "barrage"], cards: "opponent" },
    opportunity:    { input: "choice", choices: ["open", "openTest", "restrict"], cards: "opportunity" },
    end:            { input: "choice", choices: ["rout", "routFinal", "retreat"] },
    note:           { input: "text" }
  },
  /** Déclencheur d'un événement de tour : test d'Intensité réussi (règle des batailles scénarisées), toujours, condition libre. */
  eventTriggers: ["intensity", "always", "custom"],
  /** Durée d'un événement de tour. */
  eventDurations: ["round", "next", "until", "end"],
  /** Déclencheur d'une table d'événements : bouton du MJ, ou échec critique au test de Bataille d'un PJ. */
  tableTriggers: ["manual", "fumble"],
  /** Butin du bilan imposé : selon les règles, fixé, aucun. */
  lootModes: ["rules", "fixed", "none"],
  /** Hauteur de cadrage par défaut d'une image de bandeau (en %). */
  bannerFocus: 45,
  /** Bandeau neutre du système quand aucune image n'est réglée. */
  defaultBanner: "systems/pendragon-vf/icons/battle/bandeau.svg"
};

/* -------------------------------------------- */
/*  Phase d'hiver (Livre du joueur, chap. 14)   */
/* -------------------------------------------- */

PDVF.winter = {
  /** Table 14.2 : entretien annuel (£) à partir duquel on atteint Pauvre, Ordinaire, Riche, Somptueux. */
  upkeep: {
    alone: [1.5, 3, 4.5, 6],
    squire: [2, 4, 6, 8],
    family: [3, 6, 9, 12]
  },
  upkeepLevels: ["poor", "ordinary", "rich", "sumptuous"],
  /** Chevaliers de maisonnée : entretenus par le seigneur au niveau Ordinaire (4 £, 6 £ marié). */
  householdUpkeep: { single: 4, married: 6 },
  /** Gloire passive du niveau de vie (Livre du joueur p. 55 : Ordinaire 10). */
  livingPassive: { destitute: 0, poor: 0, ordinary: 10, rich: 10, sumptuous: 10, superlative: 10 },
  /** Dépenses somptuaires (Livre du maître p. 232) : 10 Gloire par £ au-delà de 6 £, jusqu'à 10 £, puis 1 par £. */
  sumptuary: { base: 6, rich: 10, perPound: 10, beyond: 1 },
  /** Vieillissement : dès 35 ans ; Table 14.3 (2D6 → caractéristiques touchées) et Table 14.4 (1D6). */
  agingFrom: 35,
  agingCount: { 2: 4, 3: 3, 4: 2, 5: 1, 6: 0, 7: 0, 8: 0, 9: 1, 10: 2, 11: 3, 12: 4 },
  agingChars: ["siz", "dex", "str", "con", "app", null],
  infirmity: 5,
  /** Formation : aucune caractéristique améliorée après 35 ans ; traits 19 et passions 20 au plus. */
  trainingCharMaxAge: 35,
  trainingChars: ["str", "dex", "con", "app"],
  trainingTraitMax: 19,
  trainingPassionMax: 20,
  trainingSkillPoints: 6,
  trainingSkillCap: 15,
  trainingSkillMax: 20,
  /** Embonpoint : trois fois au plus, après 21 ans. */
  embonpointFrom: 21,
  embonpoint: [
    { feature: "Corpulent", dex: 0, con: 0 },
    { feature: "Adipeux", dex: -1, con: 0 },
    { feature: "Obèse", dex: -1, con: -1 }
  ],
  /** Esquire : 1 £ par an ; départ sur 1D20 ≤ années après 20 ans + 5. */
  esquireUpkeep: 1,
  esquireLeaveBase: 5,
  /** Table 14.6 : départ d'un personnage de soutien. */
  departure: { 1: "dead", 2: "personal", 3: "offer" },
  /** Table 14.7 : chevaux soumis au test de survie (de combat et « nobles »). */
  survivalGroups: ["war", "fae"],
  survivalTypes: ["courser", "genet"],
  /** Pauvre : chaque cheval perd 10 de Mouvement, 3 de CON et un dé de charge. */
  poorHorse: { move: -10, con: -3, chargeDice: -1 },
  /** Conception (CON de la mère, 13 par défaut). */
  conceptionCon: 13,
  conceptionAfterBirth: -10,
  conceptionAgeFrom: 35,
  /** Table 14.9 : survie des enfants (mort sur 1–4 la première année, sur 1 de 2 à 5 ans). */
  childDeath: { baby: 4, young: 1 },
  childLiving: { destitute: -2, poor: -1 },
  /** Table 14.12 : naissance bénie (1D20). */
  blessings: [
    { char: "con" }, { char: "app" }, { char: "dex" }, { char: "str" },
    { skill: "awareness" }, { skill: "compose" }, { skill: "dancing" }, { skill: "flirting" }, { skill: "falconry" },
    { skill: "firstAid" }, { skill: "folklore" }, { skill: "horsemanship" }, { skill: "hunting" }, { skill: "intrigue" },
    { skill: "orate" }, { skill: "playInstrument" }, { skill: "literacy" }, { skill: "religion" }, { skill: "singing" },
    { skill: "stewardship" }
  ],
  /** Adversaire d'un duel des événements personnels : compétence 8+2D6. */
  duelSkill: "8+2D6"
};

/* -------------------------------------------- */
/*  Équipement (Livre du joueur, chap. 8 et 9)   */
/* -------------------------------------------- */

/** Périodes de disponibilité (Grande Campagne). */
PDVF.periods = {
  all: "PDVF.Period.all",
  boyKing: "PDVF.Period.boyKing",
  boyKingLate: "PDVF.Period.boyKingLate",
  conquest: "PDVF.Period.conquest",
  romance: "PDVF.Period.romance",
  tournament: "PDVF.Period.tournament",
  twilight: "PDVF.Period.twilight"
};
PDVF.weaponGroups = ["melee", "brawl", "missile", "thrown"];
PDVF.damageBases = ["character", "brawl", "horse", "none"];
PDVF.ranges = ["short", "medium", "long"];
PDVF.armorKinds = ["padding", "body", "overlay", "helm"];
PDVF.armorMaterials = ["textile", "mail", "plate"];
PDVF.weaponSkills = ["sword", "spear", "charge", "hafted", "greatWeapon", "brawling", "bow", "crossbow", "thrown"];

/** Équipement de départ (Livre du joueur p. 58 ; Table 9.1) : objets du compendium, par nom. */
PDVF.startingEquipment = {
  knight: [
    { name: "Haubert", equipped: true }, { name: "Auqueton", equipped: true }, { name: "Heaume à nasal", equipped: true },
    { name: "Bouclier normand", equipped: true }, { name: "Épée", equipped: true },
    { name: "Lance", quantity: 4 }, { name: "Lance de cavalerie" }, { name: "Dague", equipped: true }
  ],
  squire: [
    { name: "Gambison", equipped: true }, { name: "Heaume ouvert", equipped: true },
    { name: "Bouclier rond", equipped: true }, { name: "Lance", equipped: true }, { name: "Dague", equipped: true }
  ]
};

/* -------------------------------------------- */
/*  Domaines (Livre du maître, Table A.2 et p. 229) */
/* -------------------------------------------- */

/**
 * Rangs d'un domaine : revenu typique (£) et fourchette, entretien, niveau de vie, Gloire passive
 * du domaine (Table A.2), titre obtenu et sa Gloire (une seule fois par titre, p. 229), classe du chevalier.
 * Données ouvertes : le Livre des Nobles pourra les compléter.
 */
PDVF.domainRanks = {
  vassal: { income: 10, range: [7, 30], upkeep: 6, living: "ordinary", passive: 0, title: "vassal", knightClass: "vassal" },
  lordship: { income: 50, range: [30, 100], upkeep: 10, living: "rich", passive: 40, title: "vassal", knightClass: "vassal" },
  banneret: { income: 100, range: [60, 120], upkeep: 15, living: "superlative", passive: 90, title: "banneret", knightClass: "banneret" },
  minorBaron: { income: 150, range: [100, 200], upkeep: 20, living: "superlative", passive: 100, title: "baron", knightClass: "banneret" },
  baron: { income: 300, range: [200, 400], upkeep: 35, living: "superlative", passive: 120, title: "baron", knightClass: "banneret" },
  richBaron: { income: 600, range: [400, 800], upkeep: 65, living: "superlative", passive: 150, title: "baron", knightClass: "banneret" },
  earl: { income: 1000, range: [800, 1600], upkeep: 105, living: "superlative", passive: 200, title: "earl", knightClass: "banneret" },
  king: { income: 3000, range: [1000, 5000], upkeep: 305, living: "superlative", passive: 400, title: "king", knightClass: "banneret" }
};
/** Gloire des titres (Livre du maître p. 229). */
PDVF.titleGlory = { household: 50, vassal: 250, banneret: 500, baron: 1000, earl: 1000, king: 1000 };
/** Ordre des classes de chevalier (pour ne jamais rétrograder un chevalier en lui donnant un domaine). */
PDVF.knightClassOrder = ["squire", "mercenary", "household", "vassal", "banneret"];
/** Gestion du manoir (Livre des Nobles, chap. 3). */
PDVF.manor = MANOR;
