/**
 * Le manoir (Noble's Handbook, chap. 3) : tables de jeu, libellés reformulés en français.
 * Données ouvertes (CONFIG.PDVF.manor) que d'autres suppléments pourront compléter.
 *
 * Attributs « check » : { kind: "trait", id, side } | { kind: "skill", id } | { kind: "passion", prefix }
 */
const T = (id, side) => ({ kind: "trait", id, side });
const S = (id) => ({ kind: "skill", id });
const P = (prefix) => ({ kind: "passion", prefix });

export const MANOR = {
  /** Table 3.2 : fonds privés par manoir selon le test de Gestion. */
  harvest: {
    critical: { privy: 2 },
    success: { privy: 1 },
    failure: { privy: 0 },
    fumble: { privy: 0, hunger: true }
  },

  /** Table 3.3 : modificateurs du test de Gestion. */
  war: { none: 0, raided: -1, plundered: -5, pillaged: -10 },
  weather: { normal: "", bad: "-1d3", good: "+1d3" },
  brownie: { none: 0, helpful: 5, angry: -5 },

  /** Revenus en plus, par manoir (p. 69–70). */
  peasantry: { motivated: 1, squeezePerTrait: 1, squeezeTraits: [T("just", "right"), T("merciful", "right"), T("generous", "right")] },
  charity: {
    largesse: { cost: 1, check: T("generous", "left") },
    poor: { cost: 1, check: T("merciful", "left") },
    church: { cost: 1, check: T("spiritual", "left") }
  },
  famine: { privyLoss: 1, preventCost: 1 },

  /** Événements de la Grande Campagne (p. 69), par manoir. */
  periods: [
    { id: "sovereignty", from: 529, to: 547, privy: 1 },
    { id: "grail", from: 548, to: 556, privyPerYear: -1, max: -5 },
    { id: "germination", from: 557, to: 557, privy: 2 }
  ],
  pestilence: { first: -4, later: -2 },

  /** Investissements (Table 3.5) : 10 £, +1 £ de fonds privés par an une fois payés. */
  investmentCost: 10,
  investmentPrivy: 1,
  investments: [
    { r: [1, 1], id: "peasants" }, { r: [2, 2], id: "irrigation" }, { r: [3, 3], id: "sheep" }, { r: [4, 4], id: "cattle" },
    { r: [5, 5], id: "clearing" }, { r: [6, 6], id: "ironMine" }, { r: [7, 7], id: "armory" }, { r: [8, 8], id: "chace", check: [S("hunting"), S("falconry")] },
    { r: [9, 9], id: "fishery" }, { r: [10, 10], id: "market" }, { r: [11, 12], id: "orchard" }, { r: [13, 13], id: "salvage" },
    { r: [14, 14], id: "tolls" }, { r: [15, 15], id: "salthouse" }, { r: [16, 16], id: "riverTolls" }, { r: [17, 17], id: "deerPark" },
    { r: [18, 18], id: "warren", check: [T("valorous", "right"), T("chaste", "right")] }, { r: [19, 19], id: "apiary", check: [T("energetic", "left")] },
    { r: [20, 20], id: "horseHerd" }
  ],

  /** Embellissements (Table 3.6) : 10 £, entretien 2 £ par an, jet de croix d'expérience chaque hiver. */
  enhancementCost: 10,
  enhancementUpkeep: 2,
  enhancementRepair: 5,
  enhancements: [
    { r: 1, id: "almshouse", check: [T("generous", "left")] },
    { r: 2, id: "chapel", check: [P("devotion")] },
    { r: 3, id: "fountain", check: [T("modest", "right")] },
    { r: 4, id: "bower", check: [S("flirting")] },
    { r: 5, id: "guestHouse", check: [P("hospitality")] },
    { r: 6, id: "hermitage", check: [T("spiritual", "left")] },
    { r: 7, id: "hospital", check: [T("merciful", "left")] },
    { r: 8, id: "lists", check: [S("charge")] },
    { r: 9, id: "kennel", check: [S("hunting")] },
    { r: 10, id: "leprosarium", check: [T("merciful", "left")] },
    { r: 11, id: "mews", check: [S("falconry")] },
    { r: 12, id: "garden", check: [], choose: ["chaste.left", "spiritual.left", "generous.left", "honest.left", "modest.left", "temperate.left"] },
    { r: 13, id: "endowment", check: [T("generous", "left"), S("religion")], privy: -1 },
    { r: 14, id: "wishingWell", check: [T("honest", "right")] },
    { r: 15, id: "oakGrove", check: [T("temperate", "right")] },
    { r: 16, id: "christianMonument", check: [T("spiritual", "left")], pagan: [T("spiritual", "right")] },
    { r: 17, id: "confessionMural", check: [P("adoration")] },
    { r: 18, id: "hedgeMaze", check: [T("energetic", "left"), T("energetic", "right")] },
    { r: 19, id: "standingStones", check: [T("spiritual", "right")], pagan: [T("spiritual", "left")] },
    { r: 20, id: "tortureChamber", check: [S("intrigue"), T("merciful", "right")] }
  ],

  /** Améliorations du manoir (Table 3.4) : un jet par tranche de 5 £ de rente. */
  improvements: [
    { r: 1, id: "courtyard" }, { r: 2, id: "fresco" }, { r: 3, id: "carvings" }, { r: 4, id: "tileRoof", dv: 1 }, { r: 5, id: "leadRoof", dv: 2 },
    { r: 6, id: "mosaic" }, { r: 7, id: "fireplace", period: "conquest" }, { r: 8, id: "baths" }, { r: 9, id: "glassWindows", period: "romance" },
    { r: 10, id: "tileFloors", period: "romance" }, { r: 11, id: "stainedGlass", period: "romance" }, { r: 12, id: "wainscoting", period: "romance" },
    { r: 13, id: "tunnel" }, { r: 14, id: "stoneHall", hall: 2 }, { r: 15, id: "largeWoodenHall", hall: 2 }, { r: 16, id: "largeStoneHall", hall: 3 },
    { r: 17, id: "greatHall", hall: 3 }, { r: 18, id: "nothing" }, { r: 19, id: "nothing" }, { r: 20, id: "nothing" }
  ],
  improvementEvery: 5,

  /** Particularités (Table 3.7) : un jet facultatif quand on reçoit le manoir. */
  features: [
    { r: [1, 1], id: "hauntedWastes" }, { r: [2, 2], id: "fairyRing" }, { r: [3, 3], id: "famousChurch", privy: 1 }, { r: [4, 4], id: "eternalSpring" },
    { r: [5, 5], id: "romanRuins" }, { r: [6, 6], id: "hauntedGraveyard" }, { r: [7, 7], id: "plinth" }, { r: [8, 8], id: "ancientStones" },
    { r: [9, 9], id: "bog" }, { r: [10, 11], id: "barrow" }, { r: [12, 12], id: "battlefield" }, { r: [13, 13], id: "lushForests", bonusFor: "deerPark" },
    { r: [14, 14], id: "clearedWastes", bonusFor: "peasants" }, { r: [15, 15], id: "rollingDowns", bonusFor: "sheep" }, { r: [16, 16], id: "ancientOak" },
    { r: [17, 18], id: "manse", privy: -1 }, { r: [19, 19], id: "townhouse", privy: -1 }, { r: [20, 20], id: "capitalHouse", privy: -2 }
  ],

  /** Défenses (Table 3.8) : valeur défensive (VD) et coût en livres. */
  defenses: [
    { id: "ditch", dv: 2, cost: 2 }, { id: "ditchRampart", dv: 3, cost: 3 }, { id: "moatRampart", dv: 5, cost: 3 },
    { id: "palisade", dv: 3, cost: 5 }, { id: "gate", dv: -2, cost: 0 }, { id: "gateworks", dv: 1, cost: 2 }, { id: "postern", dv: -1, cost: 0 },
    { id: "motte", dv: 4, cost: 5 }, { id: "woodenTower", dv: 2, cost: 15 }, { id: "rockWall", dv: 3, cost: 10 }, { id: "shellKeep", dv: 7, cost: 100 },
    { id: "largeWoodenHall", dv: 2, cost: 24 }, { id: "stoneHall", dv: 2, cost: 24 }, { id: "largeStoneHall", dv: 3, cost: 35 }, { id: "greatWoodenHall", dv: 3, cost: 35 }
  ],
  dvWarning: 10,

  /** Professionnels (p. 78–80) : gage annuel (£) et compétence clé (2D6+5 à l'embauche). */
  professionals: [
    { id: "steward", cost: 1, skill: "stewardship" },
    { id: "chaplain", cost: 1, skill: "religion" },
    { id: "chef", cost: 5, skill: "" },
    { id: "falconer", cost: 1, skill: "falconry" },
    { id: "huntsman", cost: 0.5, skill: "hunting" },
    { id: "houndMaster", cost: 5, skill: "" },
    { id: "majordomo", cost: 4, skill: "folklore" },
    { id: "ostler", cost: 0.5, skill: "horsemanship" },
    { id: "tailor", cost: 2, skill: "industry" },
    { id: "valet", cost: 1, skill: "fashion" }
  ],
  professionalSkill: "2d6+5",
  /** Supplément de gage selon la compétence clé : 16–19 +1 £, 20 +2 £. */
  professionalRaise: [{ min: 20, plus: 2 }, { min: 16, plus: 1 }],
  entourageGloryMax: 100,

  /** Mesnie (p. 80–81) : par tranche de 10 £ de rente, 2 lanciers et 1 soldat de garnison ; recrues à gages. */
  mesniePer10: { spearman: 2, garrison: 1 },
  soldiers: { garrison: 0.5, crossbowman: 1, spearman: 0.5, householdKnight: 4, mercenaryKnight: 4 },

  /** Bâtiments de base (encadré « Starter Manors ») : salle de bois simple, VD 0. */
  baseHallDv: 0
};
