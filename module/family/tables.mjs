/**
 * Tables de l'historique familial.
 *
 * Trois générations d'ancêtres chevaliers :
 *  - « gg » : l'arrière-grand-père (né en 410, adoubé en 431) ;
 *  - « g »  : le grand-père (né en 439, adoubé en 460) ;
 *  - « p »  : le parent du personnage (né en 462, adoubé en 483, mort avant 508).
 *
 * Les années 439–484 reprennent la mécanique de l'historique de Salisbury de
 * King Arthur Pendragon 5.2 (chapitre 3), décalée d'une génération. Les années
 * 483–507 sont écrites pour ce système d'après la chronologie de la 6e édition
 * et la Table 3.1 (Évènements héroïques) du Livre du joueur.
 * Les intitulés sont de brefs résumés ; il faut les livres pour le détail.
 * Les valeurs indiquées ici sont celles de l'ancêtre ; le personnage en hérite
 * selon la 6e (passions : valeur − 15, +5 au plus ; traits dirigés : la moitié).
 *
 * Convention : r = [min, max] sur 1d20 ; glory = Gloire gagnée ;
 * end = mort de l'ancêtre ; glorious = mort glorieuse (+1000) ;
 * misc = mort sans rapport avec les évènements (table des causes de décès).
 */

/* -------------------------------------------- */
/*  Tables communes                              */
/* -------------------------------------------- */

export const DEATH_MALE = [
  { r: [1, 2], text: "tué au combat lors d'une querelle personnelle" },
  { r: [3, 5], text: "tué au combat contre un domaine voisin" },
  { r: [6, 7], text: "tué au combat contre des envahisseurs" },
  { r: [8, 9], text: "mort dans un accident de chasse" },
  { r: [10, 11], text: "mort accidentellement" },
  { r: [12, 16], text: "mort de maladie ou de causes naturelles" },
  { r: [17, 20], text: "disparu sans laisser de trace" }
];

export const DEATH_FEMALE = [
  { r: [1, 1], text: "tuée par des pillards" },
  { r: [2, 2], text: "enlevée par des pillards, morte en captivité" },
  { r: [3, 5], text: "morte accidentellement" },
  { r: [6, 11], text: "morte en couches" },
  { r: [12, 18], text: "morte de maladie ou de causes naturelles" },
  { r: [19, 20], text: "disparue sans laisser de trace" }
];

/** Gloire apportée par l'épouse (veuve dotée d'un manoir). */
export const BRIDE_GLORY = [
  { r: [1, 4], glory: 25 }, { r: [5, 7], glory: 50 }, { r: [8, 17], glory: 100 },
  { r: [18, 19], glory: 200 }, { r: [20, 20], glory: 350 }
];

/** Vivant ou mort (famille vivante). */
export const LIVING = [
  { r: [1, 7], alive: true, married: true },
  { r: [8, 14], alive: true, married: false },
  { r: [15, 17], alive: false, married: true },
  { r: [18, 20], alive: false, married: false }
];

/* -------------------------------------------- */
/*  Passions et traits dirigés                   */
/* -------------------------------------------- */

export const PASSION_TABLES = {
  p439: [{ r: [1, 15] }, { r: [16, 20], passion: { name: "Haine (Irlandais)", dice: "3d6" } }],
  p440: [{ r: [1, 10] }, { r: [11, 20], trait: { name: "Méfiant (chevaliers de Silchester)", dice: "1d6+6" } }],
  p443: [{ r: [1, 10] }, { r: [11, 20], passion: { name: "Haine (Pictes)", dice: "1d6+6" } }],
  p457a: [{ r: [1, 15] }, { r: [16, 20], flag: "loyalist" }],
  p457b: [{ r: [1, 10] }, { r: [11, 20], passion: { name: "Haine (Vortigern)", dice: "2d6+6" } }]
};

/* -------------------------------------------- */
/*  Batailles                                    */
/*  Gloire de participation = taille × durée × victoire                  */
/* -------------------------------------------- */

export const BATTLES = {
  carlion439: { name: "bataille de Carlion", size: 15, rounds: "1d6", mult: 1, passion: "p439", results: [
    { r: [1, 1], glorious: true }, { r: [2, 2], end: true }, { r: [3, 20] }] },
  lincoln: { name: "bataille de Lincoln", size: 30, rounds: "1d6", mult: 2, passion: "p443", results: [
    { r: [1, 1], glorious: true }, { r: [2, 3], end: true }, { r: [4, 20] }] },
  chalons: { name: "bataille de Châlons, aux côtés d'Aetius", size: 45, rounds: "1d6", mult: 3, results: [
    { r: [1, 2], glorious: true }, { r: [3, 5], end: true },
    { r: [6, 20], text: "Revient couvert de gloire ; Vortigern l'accueille froidement." }] },
  kentLoyal: { name: "bataille de Kent, dans l'armée de Vortigern", size: 30, rounds: "1d6", mult: 1.5, passion: "p457a", results: [
    { r: [1, 1], glorious: true, noPassion: true }, { r: [2, 3], end: true, noPassion: true }, { r: [4, 19] },
    { r: [20, 20], text: "Abat un héros rebelle ; Vortigern le loue publiquement et le récompense.", glory: 125, passionMod: 15 }] },
  kentRebel: { name: "bataille de Kent, dans l'armée de Vortimer", size: 30, rounds: "1d6", mult: 0.75, passion: "p457b", results: [
    { r: [1, 1], glorious: true, noPassion: true }, { r: [2, 5], end: true, noPassion: true }, { r: [6, 19] },
    { r: [20, 20], text: "Abat un garde du corps de Vortigern avant d'être repoussé.", glory: 100, passionMod: 10 }] },
  cambridge461: { name: "bataille de Cambridge, contre Vortigern", size: 30, rounds: "1d6", mult: 1, results: [
    { r: [1, 1], glorious: true }, { r: [2, 3], end: true }, { r: [4, 20], glory: 10 }] },
  carlionSiege: { name: "siège de Carlion", size: 15, rounds: "1d6", mult: 1, results: [
    { r: [1, 1], glorious: true }, { r: [2, 3], end: true }, { r: [4, 20] }] },
  snowdon: { name: "bataille de Snowdon", size: 15, rounds: "1d3", mult: 2, results: [
    { r: [1, 1], glorious: true }, { r: [2, 20] }] },
  windsor: { name: "bataille de Windsor", size: 30, rounds: "1d6", mult: 0.5, results: [
    { r: [1, 1], glorious: true },
    { r: [2, 9], end: true, passion: { name: "Haine (Saxons)", dice: "2d6+6" } },
    { r: [10, 20], passion: { name: "Haine (Saxons)", dice: "2d6+6" } }] },
  raidsSalisbury: { name: "raids saxons sur Salisbury", size: 20, rounds: "1d6", mult: 1, results: [
    { r: [1, 1], glorious: true }, { r: [2, 5], end: true }, { r: [6, 20] }] },
  frisia: { name: "bataille de Frise", size: 15, rounds: "1d6", mult: 1, results: [
    { r: [1, 1], glorious: true }, { r: [2, 5], end: true }, { r: [6, 20] }] },
  menevia: { name: "bataille de Salisbury, à Menevia", size: 45, rounds: "1d6", mult: 2, results: [
    { r: [1, 1], glorious: true }, { r: [2, 5], end: true },
    { r: [6, 20], text: "Assiste aux funérailles d'Aurelius Ambrosius et au couronnement d'Uther.", glory: 100 }] },
  eburacumG: { name: "bataille d'Eburacum", size: 30, rounds: "1d6", mult: 0.5, results: [
    { r: [1, 1], glorious: true, passion: { name: "Haine (Saxons)", dice: "1d6+6" } },
    { r: [2, 15], end: true, text: "Meurt au combat ou de ses blessures.", passion: { name: "Haine (Saxons)", dice: "1d6+6" } },
    { r: [16, 20], text: "Réchappe au désastre.", passion: { name: "Haine (Saxons)", dice: "1d6+6" } }] },
  mtDamenG: { name: "bataille du mont Damen", size: 30, rounds: "1d6", mult: 3, results: [
    { r: [1, 1], glorious: true }, { r: [2, 20], end: true, text: "Meurt au combat ou de ses blessures." }] },

  // --- Génération du parent (483–507), d'après la 6e édition ---
  eburacumP: { name: "bataille d'Eburacum", size: 30, rounds: "1d6", mult: 0.5, results: [
    { r: [1, 19], passion: { name: "Haine (Saxons)", dice: "1d6+6" } },
    { r: [20, 20], text: "Sauve le comte Roderick au cœur de la déroute.", glory: 250, legacy: "Le comte Roderick lui devait la vie.",
      passion: { name: "Haine (Saxons)", dice: "1d6+6" } }] },
  mtDamenP: { name: "bataille du mont Damen", size: 30, rounds: "1d6", mult: 3, results: [
    { r: [1, 20], text: "Survit à la victoire nocturne d'Uther." }] },
  lindsey: { name: "bataille de Lindsey", size: 30, rounds: "1d6", mult: 1.5, results: [
    { r: [1, 1], glorious: true }, { r: [2, 2], end: true }, { r: [3, 18] },
    { r: [19, 20], once: "octa", text: "Prend part à la capture du roi Octa.", glory: 150 }] },
  terrabil: { name: "bataille de Terrabil", size: 30, rounds: "1d6", mult: 1, results: [
    { r: [1, 1], glorious: true }, { r: [2, 2], end: true }, { r: [3, 19] },
    { r: [20, 20], text: "Aide à abattre le roi Gorlois de Cornouailles.", glory: 150 }] },
  stAlbans: { name: "bataille de St Albans", size: 45, rounds: "1d6", mult: 2, results: [
    { r: [1, 1], glorious: true }, { r: [2, 4], end: true }, { r: [5, 18] },
    { r: [19, 20], once: "octa", text: "Prend part à la capture du roi Octa.", glory: 150 }] },
  dorchester: { name: "bataille de Dorchester", size: 30, rounds: "1d6", mult: 1, results: [
    { r: [1, 1], glorious: true }, { r: [2, 4], end: true }, { r: [5, 18] },
    { r: [19, 20], text: "Devient un héros du Dorset.", glory: 150,
      legacy: "Héros du Dorset, mais les Cornouaillais gardent rancune à sa famille." }] },
  sarum: { name: "bataille de Sarum, contre Cerdic", size: 30, rounds: "1d6", mult: 1, results: [
    { r: [1, 1], glorious: true }, { r: [2, 4], end: true }, { r: [5, 19] },
    { r: [20, 20], text: "Blesse gravement le roi Cerdic, qui parvient à s'enfuir.", glory: 200,
      legacy: "Le roi Cerdic de Wessex n'a pas oublié la famille." }] },
  nanteleod: { name: "campagne du roi Nanteleod (Levcomagus, Royston, Hereford)", size: 45, rounds: "1d6", mult: 1.5, results: [
    { r: [1, 1], glorious: true }, { r: [2, 4], end: true }, { r: [5, 17] },
    { r: [18, 19], text: "Aide à abattre le roi Aescwine d'Essex à Royston.", glory: 200 },
    { r: [20, 20], text: "Blesse gravement le roi Cwichelm, qui parvient à s'enfuir.", glory: 200,
      legacy: "Le roi Cwichelm garde rancune à la famille." }] },
  summerland: { name: "campagne du Summerland, contre le roi Idres", size: 30, rounds: "1d6", mult: 1.5, results: [
    { r: [1, 1], glorious: true }, { r: [2, 5], end: true }, { r: [6, 18] },
    { r: [19, 20], text: "Devient un héros du Summerland.", glory: 150,
      legacy: "Héros du Summerland, mais les Cornouaillais gardent rancune à sa famille." }] }
};

/* -------------------------------------------- */
/*  Hauts faits de la 6e (Table 3.1)             */
/* -------------------------------------------- */

/** Raid saxon (1D6). */
export const RAID_DEEDS = [
  { r: [1, 3], text: "Met en déroute, seul, une bande de pillards saxons.", glory: 100 },
  { r: [4, 4], text: "Sauve une demoiselle et tue ses ravisseurs.", glory: 100, legacy: "favor" },
  { r: [5, 5], text: "Vainc un chef saxon.", glory: 150,
    legacy: "Une épée saxonne gravée de runes ; le fils du chef saxon est un ennemi de la famille." },
  { r: [6, 6], text: "Vainc un berserk saxon.", glory: 100,
    legacy: "Une pierre d'ambre polie et un pagne de cuir (valeur 1 £)." }
];

/** Quête (1D6). */
export const QUESTS = [
  { r: [1, 1], text: "Accomplit des quêtes pour Merlin, qui lui valent le surnom d'Archidruide.", glory: 150 },
  { r: [2, 2], text: "Tue Djerl le gobelin, mais est maudit.", glory: 150, legacy: "Malédiction de Djerl (effet au choix du MJ)." },
  { r: [3, 3], text: "Tue Jongon le géant.", glory: 150, legacy: "Les géants survivants de la bande de Jongon haïssent la famille." },
  { r: [4, 4], text: "Tue Djell le spriggan, mais est maudit.", glory: 150, legacy: "Malédiction de Djell (effet au choix du MJ)." },
  { r: [5, 5], text: "Escorte la princesse Morgane jusqu'à ses noces avec le roi Urien de Gorre.", glory: 150,
    legacy: "Morgane n'a pas oublié la famille." },
  { r: [6, 6], text: "Envoyé auprès du roi Nanteleod d'Escavalon, le convainc de secourir Salisbury.", glory: 150 }
];

/* -------------------------------------------- */
/*  Années                                       */
/*  Chaque période donne la table de chaque ancêtre en vie et en service. */
/* -------------------------------------------- */

const MISC = { r: [1, 1], misc: true };

export const PERIODS = [
  { years: [439, 439], intro: "Les Saxons pillent la côte ; naissance du grand-père.",
    gg: [MISC, { r: [2, 6], text: "Rien de notable." }, { r: [7, 20], battle: "carlion439" }] },

  { years: [440, 440], intro: "Le roi Constantin est assassiné par un de ses gardes, un chevalier de Silchester.",
    gg: [MISC,
      { r: [2, 9], text: "Tué par des pillards pictes pendant son service de garnison.", glory: 20, end: true },
      { r: [10, 18], text: "Repousse les raids pictes pendant son service de garnison.", glory: 10 },
      { r: [19, 19], text: "Assiste au meurtre de Constantin sans pouvoir l'empêcher.", passion: "p440" },
      { r: [20, 20], text: "Meurt en tentant de protéger Constantin.", glorious: true, passion: "p440", passionMod: 8 }] },

  { years: [441, 442], intro: "Le jeune Constans devient roi, conseillé par son oncle Vortigern.",
    gg: [MISC,
      { r: [2, 6], text: "Tué par des pillards pendant son service de garnison.", glory: 20, end: true },
      { r: [7, 20], text: "Repousse les pillards pendant son service de garnison.", glory: 20 }] },

  { years: [443, 443], intro: "Constans est assassiné par ses gardes pictes ; Vortigern devient roi.",
    gg: [MISC,
      { r: [2, 10], text: "Tué par des pillards pendant son service de garnison.", glory: 20, end: true },
      { r: [11, 18], text: "Repousse les pillards pendant son service de garnison.", glory: 20 },
      { r: [19, 19], text: "Assiste au meurtre de Constans sans pouvoir l'empêcher.", passion: "p443" },
      { r: [20, 20], text: "Meurt en tentant de protéger Constans.", glorious: true, passion: "p443", passionMod: 5 }] },

  { years: [444, 445], intro: "Grande invasion picte ; les armées se retranchent.",
    gg: [MISC,
      { r: [2, 2], text: "Tué par des pillards pendant son service de garnison.", glory: 10, end: true },
      { r: [3, 16], text: "Défend vaillamment sa garnison.", glory: 10 },
      { r: [17, 20], text: "Service de garnison sans combats notables." }] },

  { years: [446, 446], intro: "Vortigern engage Hengest et Horsa ; victoire sur les Pictes près de Lincoln.",
    gg: [MISC, { r: [2, 5], text: "Service de garnison sans combats notables." }, { r: [6, 20], battle: "lincoln" }] },

  { years: [447, 449], intro: "Les Saxons s'installent ; Rowena, fille d'Hengest, brille à la cour.", special: "dissent",
    gg: [MISC, { r: [2, 20], text: "Rien de notable." }] },

  { years: [450, 450], intro: "Vortigern épouse Rowena et donne le Kent à Hengest.",
    gg: [MISC, { r: [2, 5], text: "Rien de notable." },
      { r: [6, 18], text: "Assiste aux noces de Vortigern et de Rowena.", glory: 25 },
      { r: [19, 20], text: "Assiste aux noces de Vortigern et remarque que Rowena est enceinte.", glory: 50 }] },

  { years: [451, 451], intro: "Les Huns d'Attila sont vaincus à Châlons ; naissance de Cerdic.",
    gg: (s) => s.flags.dissident
      ? [MISC, { r: [2, 20], battle: "chalons" }]
      : [MISC, { r: [2, 20], text: "Service de garnison sans combats notables." }] },

  { years: [452, 454], intro: "Les Irlandais colonisent le Dal Riada.", gg: [MISC, { r: [2, 20], text: "Rien de notable." }] },

  { years: [455, 456], intro: "Rome est mise à sac ; Vortigern installe de nouveaux Saxons dans le nord.",
    gg: [MISC, { r: [2, 20], text: "Rien de notable." }] },

  { years: [457, 457], intro: "Vortigern écrase les rebelles de son fils Vortimer à Crecganford, dans le Kent.", special: "loyalty",
    gg: [MISC, { r: [2, 8], text: "Service de garnison sans combats notables." },
      { r: [9, 20], battle: (s) => (s.flags.side === "rebel" ? "kentRebel" : "kentLoyal") }],
    ggMod: (s) => (s.flags.side ? 10 : 0) },

  { years: [458, 459], intro: "Beaucoup de Bretons mécontents partent pour la Petite Bretagne ; la famille reste fidèle au comte.",
    gg: [MISC, { r: [2, 20], text: "Service de garnison sans combats notables." }] },

  { years: [460, 460], intro: "Le grand-père est adoubé.", special: "knightG",
    gg: [MISC, { r: [2, 20], text: "Service de garnison sans combats notables." }],
    g: [{ r: [1, 20], text: "Service de garnison sans combats notables." }] },

  { years: [461, 462], intro: "Révolte contre Vortigern, menée par son fils aîné ; le comte de Salisbury est parmi les rebelles.",
    special: "marriageG",
    gg: [MISC, { r: [2, 5], text: "Service de garnison sans combats notables." }, { r: [6, 20], battle: "cambridge461" }],
    g: [{ r: [1, 20], text: "Service de garnison sans combats notables." }] },

  { years: [463, 463], intro: "La nuit des Longs Couteaux : Hengest massacre la noblesse bretonne à Stonehenge ; le comte de Salisbury périt.",
    special: "longKnives",
    g: [{ r: [1, 20], text: "Échappe au massacre." }] },

  { years: [465, 465], intro: "Vortigern et ses Saxons rançonnent la Bretagne ; Merlin fait son apparition.",
    g: [{ r: [1, 20], text: "Reste sur ses terres, aux côtés de son seigneur." }] },

  { years: [466, 467], intro: "Aurelius Ambrosius débarque avec la bannière au dragon rouge.",
    g: [MISC, { r: [2, 5], text: "Service de garnison sans combats notables." }, { r: [6, 20], battle: "carlionSiege" }] },

  { years: [468, 468], intro: "Vortigern périt à Snowdon ; Aurelius Ambrosius devient Haut Roi et prend le titre de Pendragon.",
    g: [MISC, { r: [2, 5], text: "Service de garnison sans combats notables." }, { r: [6, 20], battle: "snowdon" }] },

  { years: [469, 472], intro: "Paix fragile ; Uther se distingue contre les pillards.",
    g: [MISC, { r: [2, 5], text: "Se distingue dans les combats.", glory: 25 },
      { r: [6, 10], text: "Se distingue dans les combats.", glory: 50 },
      { r: [11, 15], text: "Se distingue brillamment dans les combats.", glory: 100 },
      { r: [16, 20], text: "Accomplit de grands exploits dans les combats.", glory: 200 }] },

  { years: [473, 473], intro: "Grande victoire saxonne dans la vallée de la Tamise.",
    g: [MISC, { r: [2, 10], text: "Service de garnison sans combats notables." }, { r: [11, 20], battle: "windsor" }] },

  { years: [474, 476], intro: "Les Saxons du Kent ravagent le pays ; seuls les lieux fortifiés sont sûrs.",
    g: [MISC, { r: [2, 4], text: "Meurt en défendant sa garnison.", glory: 25, end: true },
      { r: [5, 20], text: "Défend sa garnison.", glory: 25 }] },

  { years: [477, 477], intro: "Le roi Ælle fonde le Sussex ; Aurelius Ambrosius échappe de peu au désastre.",
    g: [MISC, { r: [2, 4], text: "Meurt en défendant sa garnison.", glory: 25, end: true },
      { r: [5, 20], text: "Défend sa garnison.", glory: 25 }] },

  { years: [478, 479], intro: "La flotte d'Aurelius Ambrosius détruit les navires saxons et frappe la Frise.",
    g: [MISC, { r: [2, 6], battle: "raidsSalisbury" },
      { r: [7, 20], text: "Embarque avec la flotte du Haut Roi.", glory: 25, battle: "frisia" }] },

  { years: [480, 480], intro: "Aurelius Ambrosius, empoisonné, meurt dans la victoire de Menevia ; Uther devient Pendragon.",
    g: [MISC, { r: [2, 2], text: "Service de garnison." }, { r: [3, 20], battle: "menevia" }] },

  { years: [481, 482], intro: "Les Saxons restent relativement calmes.",
    g: [MISC, { r: [2, 4], text: "Quelques combats pendant son service de garnison.", glory: 25 },
      { r: [5, 20], text: "Service de garnison sans combats notables." }] },

  { years: [483, 483], intro: "Le parent est adoubé et se marie la même année.", special: "knightP",
    g: [MISC, { r: [2, 4], text: "Quelques combats pendant son service de garnison.", glory: 25 },
      { r: [5, 20], text: "Service de garnison sans combats notables." }],
    p: [{ r: [1, 20], text: "Service de garnison sans combats notables." }] },

  { years: [484, 484], intro: "Les Saxons écrasent Uther devant Eburacum ; il les surprend ivres de victoire au mont Damen.",
    special: "final484",
    g: [MISC, { r: [2, 2], text: "Service de garnison." }, { r: [3, 20], battle: "eburacumG" }],
    p: [{ r: [1, 14], battle: "eburacumP", then: "mtDamenP" },
      { r: [15, 19], battle: "eburacumP", after: "Blessé à Eburacum, il manque la revanche du mont Damen." },
      { r: [20, 20], battle: "eburacumP", then: "mtDamenP", force: 20 }] },

  // --- Génération du parent ---
  { years: [485, 486], intro: "Uther lève de nouvelles troupes et fait adouber les écuyers en masse.",
    p: [{ r: [1, 15], text: "Service de garnison.", glory: 10 }, { r: [16, 20], text: "Repousse des pillards.", glory: 25 }] },

  { years: [487, 487], intro: "Naissance de l'aîné : le personnage.", special: "birthPC",
    p: [{ r: [1, 20], text: "Service de garnison.", glory: 10 }] },

  { years: [488, 489], intro: "Uther guerroie contre les Saxons et les rois rebelles.",
    p: [{ r: [1, 14], text: "Service de garnison.", glory: 10 }, { r: [15, 20], text: "Repousse des pillards.", glory: 25 }] },

  { years: [490, 490], intro: "Uther affronte le roi Octa dans le Lindsey.",
    p: [{ r: [1, 5], text: "Service de garnison." }, { r: [6, 20], battle: "lindsey" }] },

  { years: [491, 491], intro: "Uther fait la guerre au duc Gorlois de Cornouailles.",
    p: [{ r: [1, 6], text: "Service de garnison." }, { r: [7, 20], battle: "terrabil" }] },

  { years: [492, 494], intro: "Le règne d'Uther se durcit ; les raids saxons continuent.",
    p: [{ r: [1, 14], text: "Service de garnison.", glory: 10 }, { r: [15, 20], text: "Repousse des pillards.", glory: 25 }] },

  { years: [495, 495], intro: "Victoire de St Albans, puis le banquet empoisonné : Uther, le comte Roderick et la plupart des barons périssent.",
    special: "poison495",
    p: [MISC, { r: [2, 3], text: "Service de garnison." }, { r: [4, 20], battle: "stAlbans" }] },

  { years: [496, 497], intro: "L'Anarchie : le royaume est sans roi ; la comtesse Ellen gouverne Salisbury.",
    p: [MISC, { r: [2, 3], text: "Tué en défendant ses terres contre des pillards.", glory: 20, end: true },
      { r: [4, 16], text: "Défend ses terres contre les pillards.", glory: 20 },
      { r: [17, 20], text: "Se distingue dans de rudes combats.", glory: 50 }] },

  { years: [498, 499], intro: "Raids saxons venus du Wessex de Cerdic.",
    p: [MISC, { r: [2, 4], text: "Tué par des pillards saxons.", glory: 25, end: true },
      { r: [5, 16], text: "Défend ses terres contre les pillards saxons.", glory: 25 },
      { r: [17, 20], deed: "raid" }] },

  { years: [500, 500], intro: "Le roi de Cornouailles marche sur le Dorset.",
    p: [MISC, { r: [2, 8], text: "Service de garnison." }, { r: [9, 20], battle: "dorchester" }] },

  { years: [501, 501], intro: "Le personnage, âgé de 14 ans, devient écuyer.", special: "squirePC",
    p: [MISC, { r: [2, 14], text: "Service de garnison.", glory: 10 }, { r: [15, 20], deed: "quest" }] },

  { years: [502, 504], intro: "L'Anarchie se prolonge ; Cerdic et Silchester convoitent Salisbury.",
    p: [MISC, { r: [2, 4], text: "Tué par des pillards saxons.", glory: 25, end: true },
      { r: [5, 14], text: "Défend ses terres contre les pillards.", glory: 25 },
      { r: [15, 17], deed: "raid" }, { r: [18, 20], deed: "quest" }] },

  { years: [505, 505], intro: "Salisbury s'allie au roi Nanteleod d'Escavalon contre les Saxons.",
    p: [MISC, { r: [2, 7], battle: "sarum" }, { r: [8, 20], battle: "nanteleod" }] },

  { years: [506, 506], intro: "Le roi Idres de Cornouailles est repoussé hors du Summerland.",
    p: [MISC, { r: [2, 5], text: "Service de garnison." }, { r: [6, 20], battle: "summerland" }] },

  { years: [507, 507], intro: "Dernière année avant l'adoubement du personnage.", special: "final507" }
];

/* -------------------------------------------- */
/*  Prénoms (listes du Livre du joueur)          */
/* -------------------------------------------- */

export const MALE_NAMES = [
  "Adtherp", "Alain", "Badan", "Bellias", "Berel", "Bertram", "Bliant", "Brice", "Cadal", "Caradoc", "Carwyn",
  "Clegis", "Cleremond", "Driant", "Drogo", "Drustin", "Ebel", "Elias", "Faramond", "Ferand", "Galien",
  "Garhaus", "Gerin", "Gilbert", "Griffith", "Gwinas", "Harvis", "Hermel", "Hervis", "Hewgon", "Idres",
  "Idwallon", "Ifan", "Iorath", "Jasper", "Lambert", "Llwyd", "Madog", "Melion", "Miles", "Morien", "Moris",
  "Nerovens", "Owen", "Pedivere", "Perin", "Phelot", "Raymond", "Tobias", "Wynn"
];

export const FEMALE_NAMES = [
  "Agnès", "Albiona", "Albreda", "Avariet", "Avice", "Bérengère", "Blanche", "Bragwine", "Brangolet", "Clarine",
  "Cliane", "Dilwen", "Drusilla", "Dwynwen", "Eithene", "Enid", "Enild", "Ermine", "Ettard", "Félicie",
  "Fenice", "Galienne", "Ganieuse", "Griane", "Guinet", "Gwendrie", "Hafwen", "Heledd", "Herleva", "Ida",
  "Idette", "Iseunne", "Laudine", "Lilwen", "Linette", "Ludette", "Luned", "Lyonette", "Nerys", "Olwen",
  "Orcate", "Pridwyn", "Raewyn", "Rhonwyn", "Sigune", "Soredine", "Tryamon", "Ydenne", "Yvaine"
];
