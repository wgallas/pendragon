/**
 * Données de la création de personnage (Livre du joueur, chapitre 3).
 *
 * Tout est décrit ici sous forme de listes ouvertes : un supplément (ou un
 * module) peut ajouter une fonction, une classe, une culture, une région ou
 * une religion en complétant CONFIG.PDVF.creation pendant le hook « init »,
 * par exemple :
 *
 *   Hooks.once("init", () => {
 *     CONFIG.PDVF.creation.cultures.saxon = { label: "Saxon", ... };
 *   });
 *
 * Les libellés sont des chaînes françaises ou des clés de traduction.
 */

export const CREATION = {

  /** Fonctions jouables (Dames et chevaliers intrépides en ajoutera d'autres). */
  functions: {
    knight: {
      label: "Chevalier",
      title: { male: "sire", female: "dame" },
      classes: ["household", "mercenary"],
      skillModifiers: "knight"
    }
  },

  /** Classes possibles au début du jeu. */
  classes: {
    household: {
      label: "PDVF.Class.household",
      loyalty: { court: "fidelitas", name: "Hommage (Seigneur)" },
      knightingGlory: 50,
      horses: true
    },
    mercenary: {
      label: "PDVF.Class.mercenary",
      loyalty: { court: "fidelitas", name: "Allégeance (Seigneur)" },
      knightingGlory: 0,
      horses: false
    }
  },

  /** Cultures. */
  cultures: {
    cymric: {
      label: "Cymri",
      adjective: "Cymrique",
      // Table 3.3
      characteristics: { siz: "2d6+5", dex: "2d6+5", str: "2d6+5", con: "2d6+5", app: "2d6+5" },
      maxima: { siz: 18, dex: 18, str: 18, con: 21, app: 18 },
      modifiers: { con: 3 },
      // Modificateurs culturels de compétences, selon la fonction
      skillModifiers: { knight: { charge: 3, courtesy: 3, horsemanship: 3 } },
      // Table 3.2 (1D6)
      religions: [
        { id: "christian", r: [1, 5] },
        { id: "pagan", r: [6, 6] }
      ],
      homelands: ["salisbury"]
    }
  },

  /** Régions natales. */
  homelands: {
    salisbury: {
      label: "Comté de Salisbury",
      culture: "cymric",
      lord: "Robert de Salisbury",
      home: "Château du Rocher, Sarum",
      passions: [{ court: "fervor", name: "Haine (Saxons)", built: 5, random: "1d6+2" }],
      familyHistory: true
    }
  },

  /** Passions de départ communes (méthode construite / aléatoire). */
  passions: [
    { key: "loyalty", built: 15, random: "2d6+8" },
    { court: "fervor", name: "Amour (Famille)", built: 10, random: "2d6+3" },
    { key: "deity", court: "adoratio", built: 5, random: "1d6+2" },
    { court: "civilitas", name: "Rang", built: 10, random: "2d6+3" },
    { court: "civilitas", name: "Hospitalité", built: 10, random: "2d6+3" }
  ],
  honor: { built: 15, random: "2d6+8" },

  /** Budgets de points. */
  budgets: {
    characteristics: 60, characteristicMin: 8, characteristicMax: 15,
    traitPoints: 6, traitMax: 15, traitFamous: 16, traitVirtue: 13, traitValorous: 15,
    passionPointsBuilt: 15, passionPointsRandom: "4d6+1", passionMax: 15,
    skillPoints: 10, skillMax: 15,
    apprenticeYears: 7, apprenticeSkillPoints: 5, apprenticeTraitMax: 19, apprenticePassionMax: 20
  },

  /** Table 3.5 : valeurs de départ des compétences (formules sur les caractéristiques à 14 ans). */
  startingSkills: {
    singing: 5, hunting: 5, compose: 5, courtesy: "app-5", dancing: "dex/2", orate: "app-5",
    falconry: 5, folklore: "app-5", stewardship: 5, recognize: 5, intrigue: "app-5",
    playInstrument: "dex/2", gaming: 5, literacy: 0, fashion: "app-5", firstAid: "dex/2",
    religion: 5, flirting: "app-5", awareness: 5, chirurgery: 0, industry: 0,
    battle: 5, horsemanship: "dex/2",
    crossbow: "dex/2", bow: "dex/2", thrown: "dex/2", greatWeapon: "dex/2", charge: "dex/2",
    sword: "dex/2", hafted: "dex/2", spear: "dex/2", brawling: "str/2"
  },

  /** Compétences de chevalier (*) et conditions d'adoubement. */
  knighthood: {
    minAge: 18,
    weapons: ["charge", "sword", "brawling"],
    others: ["hunting", "courtesy", "recognize", "firstAid", "awareness", "battle", "horsemanship"],
    othersNeeded: 2,
    minValue: 10,
    glory: 1000,
    lordShare: 100,      // 1/100 de la Gloire du seigneur…
    lordShareMax: 1000   // … 1000 au plus
  },

  /** Table 3.6 : particularités familiales (1D20). */
  familyTraits: [
    { r: 1, label: "Perspicace", skill: "awareness" },
    { r: 2, label: "Martial", skill: "battle" },
    { r: 3, label: "Poétique", skill: "compose" },
    { r: 4, label: "Bien élevé", skill: "courtesy" },
    { r: 5, label: "Vif", skill: "dancing" },
    { r: 6, label: "Séduisant", skill: "flirting" },
    { r: 7, label: "Ami des oiseaux", skill: "falconry" },
    { r: 8, label: "Soigneur", skill: "firstAid" },
    { r: 9, label: "Physionomiste", skill: "recognize" },
    { r: 10, label: "Malin", skill: "gaming" },
    { r: 11, label: "Hippique", skill: "horsemanship" },
    { r: 12, label: "Intrigant", skill: "intrigue" },
    { r: 13, label: "Beau parleur", skill: "orate" },
    { r: 14, label: "Lettré", skill: "literacy" },
    { r: 15, label: "Du peuple", skill: "folklore" },
    { r: 16, label: "Musical", skill: "playInstrument" },
    { r: 17, label: "Croyant", skill: "religion" },
    { r: 18, label: "Mélodique", skill: "singing" },
    { r: 19, label: "Paysan", skill: "stewardship" },
    { r: 20, label: "Doué", gifted: true }
  ],
  familyTraitBonus: 3,

  /** Table 3.4 : signes distinctifs selon l'ATT. */
  features: [
    { max: 5, label: "Infirme", positive: 0, negative: 0, note: "moribond" },
    { max: 7, label: "Déplaisant", positive: 0, negative: 3 },
    { max: 9, label: "Peu avenant", positive: 0, negative: 2 },
    { max: 12, label: "Banal", positive: 1, negative: 1 },
    { max: 15, label: "Harmonieux", positive: 2, negative: 0 },
    { max: 18, label: "Élégant", positive: 3, negative: 0 },
    { max: 99, label: "Superbe", positive: 4, negative: 0 }
  ],
  featureExamples: {
    positive: [
      "élancé", "large d'épaules", "musclé", "gracieux", "imposant", "majestueux", "solide", "trapu",
      "mains fortes", "doigts délicats", "cheveux noirs brillants", "blonds dorés", "cheveux épais", "poivre et sel",
      "barbe soignée", "dents droites", "nez romain", "sourire éclatant", "teint lisse", "yeux bleus", "yeux gris",
      "yeux vifs", "voix profonde", "voix claire", "voix tonnante", "accent charmant"
    ],
    negative: [
      "bedonnant", "voûté", "dégingandé", "frêle", "maigre", "gauche", "gaucher", "jambes arquées", "genoux cagneux",
      "calvitie", "cheveux roux", "grisonnant avant l'âge", "barbe hirsute", "cicatrices", "dents manquantes",
      "grandes oreilles", "marques de variole", "nez tordu", "taches de rousseur", "yeux vairons", "monosourcil",
      "voix aiguë", "voix nasillarde", "bégaiement", "zézaiement", "accent épais"
    ]
  },

  /** Table 3.9 : chance du débutant (1D20), résumés. */
  luck: [
    { r: 1, item: "Plats d'argent gravés des exploits de la famille", value: "3 £", effect: "Gloire passive 10" },
    { r: 2, item: "Cor saxon cerclé d'or, pris par le père", value: "5 £", effect: "+5 en Haine (Saxons) pour le combat après en avoir sonné" },
    { r: 3, item: "Paire de lances offertes par un chef franc", value: "2 £", effect: "+1 en Valeureux quand on s'en sert ; croix annuelle en Fier" },
    { r: 4, item: "Belle cape à épingle d'or", value: "3 £", effect: "+2 d'Engouement quand on la porte" },
    { r: 5, item: "Bride ornée de phalères de bronze et d'or", value: "2 £", effect: "Contrôle de monture réussi d'office avec cette bride" },
    { r: 6, item: "Médaillon de bronze d'un ancêtre héroïque", value: "1 £", effect: "+2 en Valeureux quand on le porte" },
    { r: 7, item: "Fer de lance gravé d'une hure de sanglier", value: "1 £", effect: "+1D6 de dégâts contre les sangliers" },
    { r: 8, item: "Spatha romaine au fourreau d'or et d'argent", value: "5 £", effect: "+5 en Courtoisie dans une cour romaine, ou faveur F5 si offerte à un seigneur romain" },
    { r: 9, item: "Cuiller et couteau taillés dans des os de géant", value: "1 £", effect: "+2 d'Engouement lors d'un festin" },
    { r: 10, item: "Magnifique épée", value: "5 £", effect: "+1 aux dégâts" },
    { r: 11, item: "Magnifique selle", value: "2 £", effect: "+1 en Équitation" },
    { r: 12, item: "Ceinture brodée de cerfs bondissants", value: "1 £", effect: "+5 en Chasse contre les cervidés" },
    { r: 13, item: "Ceinture d'un ancêtre qui combattit Constantin le Grand", value: "3 £", effect: "Gloire passive 15" },
    { r: 14, item: "Lourd gobelet d'argent en forme de sanglier", value: "2 £", effect: "+5 en Éloquence pour porter un toast" },
    { r: 15, item: "Sous-vêtement de soie", value: "1 £", effect: "+5 aux tests de Chirurgie faits pour vous quand vous êtes Affaibli" },
    { r: 16, item: "Bouclier d'if marqué des griffes d'un monstre", value: "1 £", effect: "+2 en Valeureux quand on s'en sert" },
    { r: 17, item: "Lance de frêne offerte par les druides", value: "1 £", effect: "Croix annuelle à tous les traits païens, si on le souhaite" },
    { r: 18, item: "Torque d'or du Summerland", value: "5 £", effect: "+5 en Courtoisie chez les Faës, ou faveur F5 du roi Cadwy" },
    { r: 19, item: "Lance bénie par saint Dewi", value: "1 £", effect: "Croix annuelle à tous les traits chrétiens, si on le souhaite" },
    { r: 20, item: "Belle épée gravée d'or à la devise familiale", value: "1 £", effect: "+5 en Amour (Famille) au combat" }
  ],

  /** Équipement de départ (résumé, en attendant les objets). */
  equipment: {
    squire: "Gambison et heaume ouvert (5 points d'armure) ; bouclier rond (6 points, −2 à cheval) ; lance ; dague ; roncin (Mouvement 16, CON 18, 56 PV).",
    knight: "Haubert, auqueton et heaume à nasal (10 points d'armure) ; bouclier normand (6 points) ; épée, quatre lances, une lance de cavalerie, une dague et une arme au choix. Coffre en bois à serrure ; vêtements ordinaires et une tenue de fête (1 £), cape de pluie, cape de laine ; matériel de voyage et d'équitation.",
    horses: "Fournis par le seigneur : un destrier (dégâts de charge 6D6, armure naturelle 5, 55 PV, Mouvement 16), deux roncins (armure 4, 54 PV, Mouvement 16) et un sommier (armure 3, 46 PV, Mouvement 14)."
  },

  /**
   * Appendice C : personnages prétirés. Valeurs de jeu seules (les présentations sont résumées).
   * Les traits sont donnés côté gauche, dans l'ordre de PDVF.traits.
   * Passions : « honor », « loyalty » (nom de la classe), « deity » (Dévotion de la religion),
   * les autres par leur nom ; « extra » ajoute des passions qui ne sont pas de départ.
   * Les compétences absentes de la fiche du livre partent de leur valeur de la Table 3.5.
   */
  pregens: (() => {
    const T = (...v) => v;
    const sk = (general, combat) => ({ ...general, ...combat });
    const common = { culture: "cymric", years: 7, squire: { age: 14, origin: "youngerSon" } };
    return {
      adventurer: { ...common, label: "Le chevalier aventurier", religion: "christian",
        pitch: "Chrétien, à l'aise partout : à la cour, en bataille comme dans la Forêt Sauvage.",
        playIf: "vous voulez un chevalier sans faiblesse marquée.",
        chars: { siz: 12, dex: 12, str: 12, con: 15, app: 12 },
        traits: T(13, 12, 13, 12, 10, 10, 13, 10, 13, 13, 12, 13, 16),
        passions: { honor: 15, loyalty: 15, deity: 5, "Amour (Famille)": 15, "Haine (Saxons)": 5, "Rang": 10, "Hospitalité": 10 },
        skills: sk({ battle: 8, singing: 5, hunting: 8, compose: 5, courtesy: 10, dancing: 6, orate: 8, falconry: 5, folklore: 7,
          stewardship: 5, recognize: 5, playInstrument: 6, intrigue: 7, gaming: 5, literacy: 0, firstAid: 8, religion: 5, flirting: 7, awareness: 10 },
        { horsemanship: 15, greatWeapon: 6, charge: 17, sword: 15, hafted: 9, spear: 10, brawling: 10 }) },
      champion: { ...common, label: "Le chevalier champion", religion: "christian",
        pitch: "Chrétien, il rêve d'être le meilleur chevalier du pays et embrasse la chevalerie nouvelle.",
        playIf: "vous voulez servir votre seigneur par vos idéaux chevaleresques, et viser un jour la Table Ronde.",
        chars: { siz: 15, dex: 14, str: 12, con: 13, app: 9 },
        traits: T(13, 10, 13, 12, 12, 10, 13, 12, 13, 13, 10, 13, 16),
        passions: { honor: 15, loyalty: 15, deity: 5, "Amour (Famille)": 10, "Haine (Saxons)": 5, "Rang": 10, "Hospitalité": 10 },
        extra: [{ court: "civilitas", name: "Chevalerie", value: 5 }],
        skills: sk({ battle: 9, singing: 6, hunting: 7, compose: 5, courtesy: 7, dancing: 7, orate: 4, falconry: 5, folklore: 4,
          stewardship: 5, recognize: 9, playInstrument: 7, intrigue: 4, gaming: 7, literacy: 0, firstAid: 7, religion: 5, flirting: 4, awareness: 10 },
        { horsemanship: 15, greatWeapon: 7, charge: 15, sword: 15, hafted: 12, spear: 12, brawling: 10 }) },
      hunter: { ...common, label: "Le chevalier chasseur", religion: "pagan",
        pitch: "Païen, il n'est heureux qu'au fond des bois, au son de la meute et des cors.",
        playIf: "vous voulez un maître de la nature et de la chasse.",
        chars: { siz: 15, dex: 12, str: 13, con: 15, app: 8 },
        traits: T(7, 10, 13, 16, 15, 13, 10, 10, 10, 5, 10, 8, 15),
        passions: { honor: 15, loyalty: 10, deity: 5, "Amour (Famille)": 10, "Haine (Saxons)": 10, "Rang": 10, "Hospitalité": 15 },
        skills: sk({ battle: 7, singing: 7, hunting: 14, compose: 5, courtesy: 6, dancing: 8, orate: 6, falconry: 8, folklore: 3,
          stewardship: 5, recognize: 5, playInstrument: 8, intrigue: 3, gaming: 5, literacy: 0, firstAid: 10, religion: 5, flirting: 3, awareness: 10 },
        { horsemanship: 14, bow: 10, greatWeapon: 8, charge: 14, sword: 12, hafted: 8, spear: 14, brawling: 12 }) },
      courtier: { ...common, label: "Le chevalier courtisan", religion: "christian",
        pitch: "Chrétien, jeune ambitieux qui compte autant sur sa parole que sur son épée.",
        playIf: "vous voulez manœuvrer à la cour des puissants et porter la parole de votre seigneur en ambassade.",
        chars: { siz: 12, dex: 11, str: 12, con: 14, app: 14 },
        traits: T(13, 8, 13, 12, 10, 8, 13, 10, 13, 13, 16, 13, 15),
        passions: { honor: 15, loyalty: 10, deity: 5, "Amour (Famille)": 10, "Haine (Saxons)": 5, "Rang": 15, "Hospitalité": 15 },
        skills: sk({ battle: 5, singing: 5, hunting: 5, compose: 5, courtesy: 14, dancing: 8, orate: 12, falconry: 8, folklore: 9,
          stewardship: 5, recognize: 10, playInstrument: 7, intrigue: 14, gaming: 5, literacy: 0, firstAid: 6, religion: 5, flirting: 10, awareness: 6 },
        { horsemanship: 15, greatWeapon: 6, charge: 15, sword: 12, hafted: 6, spear: 9, brawling: 10 }) },
      fierce: { ...common, label: "Le chevalier farouche", religion: "pagan",
        pitch: "Païen, il méprise chevalerie et courtoisie : seule compte la loi du plus fort.",
        playIf: "vous vous moquez des intrigues et des belles manières, ou voulez un chevalier qui frappe fort.",
        chars: { siz: 15, dex: 12, str: 13, con: 15, app: 8 },
        traits: T(7, 10, 13, 15, 13, 13, 10, 10, 8, 7, 8, 10, 16),
        passions: { honor: 15, loyalty: 15, deity: 5, "Amour (Famille)": 10, "Haine (Saxons)": 5, "Rang": 15, "Hospitalité": 10 },
        skills: sk({ battle: 10, singing: 5, hunting: 10, compose: 5, courtesy: 6, dancing: 6, orate: 3, falconry: 5, folklore: 3,
          stewardship: 5, recognize: 6, playInstrument: 6, intrigue: 3, gaming: 8, literacy: 0, firstAid: 6, religion: 5, flirting: 3, awareness: 7 },
        { horsemanship: 15, greatWeapon: 12, charge: 15, sword: 15, hafted: 6, spear: 6, brawling: 10 }) },
      religious: { ...common, label: "Le chevalier religieux", religion: "christian",
        pitch: "Chrétien, il tourne ses pensées vers les mystères de la foi et ses pouvoirs.",
        playIf: "vous voulez un guerrier mystique, en route vers l'Idéal du Chevalier Religieux chrétien.",
        chars: { siz: 12, dex: 14, str: 12, con: 15, app: 10 },
        traits: T(15, 10, 16, 10, 10, 10, 13, 10, 13, 16, 10, 15, 15),
        passions: { honor: 15, loyalty: 10, deity: 15, "Amour (Famille)": 10, "Haine (Saxons)": 5, "Rang": 10, "Hospitalité": 10 },
        skills: sk({ battle: 5, singing: 8, hunting: 5, compose: 5, courtesy: 10, dancing: 6, orate: 7, falconry: 5, folklore: 10,
          stewardship: 5, recognize: 5, playInstrument: 7, intrigue: 7, gaming: 5, literacy: 0, firstAid: 7, religion: 12, flirting: 7, awareness: 5 },
        { horsemanship: 12, greatWeapon: 7, charge: 12, sword: 12, hafted: 10, spear: 10, brawling: 10 }) }
    };
  })(),

  /** Idéaux accessibles à la création. */
  ideals: [
    { id: "courteous", label: "Chevalier Courtois", traits: ["energetic.left", "generous.left", "just.left", "merciful.left", "modest.left", "valorous.left"], total: 96,
      passions: [{ name: "Rang", min: 10 }, { name: "Hospitalité", min: 10 }, { name: "Chevalerie", min: 15 }] },
    { id: "religious", label: "Chevalier Religieux", religionVirtues: 16, deityMin: 16, skills: [{ id: "religion", min: 10 }] },
    { id: "romantic", label: "Chevalier Romantique", traits: ["chaste.left", "spiritual.left", "generous.left", "honest.left", "modest.left", "temperate.left"], total: 90,
      passions: [{ prefix: "Adoration", min: 10 }] }
  ],

  /** Prénoms (listes du Livre du joueur). */
  names: {
    male: [
      "Abel", "Adam", "Adtherp", "Alain", "André", "Arnold", "Badan", "Barnabus", "Bellangere", "Bellias", "Berel", "Bertram",
      "Bliant", "Breunis", "Brian", "Brice", "Bruce", "Cadal", "Caradoc", "Carwyn", "Clegis", "Cleremond", "Daniel", "David",
      "Driant", "Drogo", "Drustin", "Dylan", "Ebel", "Édouard", "Elias", "Eliot", "Éric", "Erwin", "Faramond", "Ferand",
      "Filibert", "Galien", "Galonors", "Garhaus", "Geoffrey", "Gérald", "Gerin", "Gilbert", "Godfrey", "Grégory", "Griffith",
      "Guillaume", "Guy", "Gwinas", "Harvis", "Henri", "Herlews", "Hermel", "Hervis", "Hewgon", "Hughes", "Idres", "Idwallon",
      "Ifan", "Iorath", "Isaac", "Jason", "Jasper", "Jean", "Jeremy", "Jordan", "Joseph", "Lambert", "Liam", "Llwyd", "Madog",
      "Malcolm", "Matteas", "Maurice", "Melion", "Michel", "Miles", "Morien", "Moris", "Nerovens", "Nicholas", "Nigel", "Noah",
      "Owen", "Paul", "Pedivere", "Perin", "Phelot", "Pierre", "Raymond", "Richard", "Robert", "Roger", "Simon", "Stéphane",
      "Thomas", "Tobias", "Wynn"
    ],
    female: [
      "Agnès", "Albiona", "Albreda", "Alice", "Anna", "Annabelle", "Avariet", "Avice", "Béatrice", "Bella", "Bérengère",
      "Blanche", "Bragwine", "Brangolet", "Brevres", "Cécile", "Christina", "Clarine", "Cliane", "Cunddydd", "Désirée", "Diana",
      "Dilwen", "Drusilla", "Dwynwen", "Édith", "Eithene", "Éléonore", "Élisabeth", "Ella", "Emma", "Enid", "Enidamors", "Enild",
      "Ermine", "Ettard", "Eva", "Félicie", "Fenice", "Fiona", "Gabrielle", "Galienne", "Ganieuse", "Gisèle", "Griane",
      "Griselda", "Guinet", "Gwenddydd", "Gwendrie", "Hafwen", "Heledd", "Hélène", "Héloïse", "Herleva", "Herzeloyde",
      "Herzenna", "Ida", "Idette", "Isabelle", "Iseunne", "Isolt", "Jacqueline", "Jane", "Jenna", "Julienne", "Laudine",
      "Lausanne", "Lillian", "Lilwen", "Linette", "Lineve", "Ludette", "Luned", "Lyonette", "Marguerite", "Marie", "Mathilde",
      "Millicent", "Muriel", "Nerys", "Nina", "Niniane", "Olwen", "Orcate", "Pridwyn", "Raewyn", "Rhonwyn", "Rosamonde",
      "Rowena", "Sarah", "Sigune", "Soredamors", "Soredine", "Suzanne", "Tryamon", "Tryamors", "Ydenne", "Yvaine", "Yvette"
    ]
  }
};
