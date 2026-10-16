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
