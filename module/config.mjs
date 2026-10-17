/**
 * Données de référence du système.
 * Tout ce qui dépend de la culture ou de la religion est décrit ici sous forme
 * de données, pour pouvoir ajouter d'autres cultures sans toucher à la logique.
 */

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
 * D'autres religions pourront être ajoutées ici (ou par un module) sans autre changement.
 */
PDVF.religions = {
  christian: {
    label: "PDVF.Religion.christian",
    deity: "Dévotion (Dieu)",
    virtues: ["chaste.left", "spiritual.left", "forgiving.left", "merciful.left", "modest.left", "temperate.left"]
  },
  pagan: {
    label: "PDVF.Religion.pagan",
    deity: "Dévotion (Dieux)",
    virtues: ["spiritual.left", "energetic.left", "modest.right", "generous.left", "honest.left", "chaste.right"]
  },
  odinist: {
    label: "PDVF.Religion.odinist",
    deity: "Dévotion (Dieux)",
    virtues: ["temperate.right", "modest.right", "generous.left", "spiritual.right", "prudent.right", "valorous.left"]
  },
  barbarian: {
    label: "PDVF.Religion.barbarian",
    deity: "Dévotion (Dieux)",
    virtues: ["just.right", "spiritual.left", "modest.right", "honest.left", "trusting.right", "forgiving.right"]
  }
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
