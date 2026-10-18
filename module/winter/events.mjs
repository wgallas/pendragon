/**
 * Table 14.1 : événements personnels de la phase d'hiver (Livre du joueur p. 222–227).
 * Textes reformulés en bref ; effets en données, appliqués par des boutons dans l'assistant.
 *
 * Clés testées : « trait.<id>.left|right », « passion:<motif> » (passion de la fiche dont le nom
 * commence par le motif), « honor ».
 * Effets : glory (nombre ou « app », « app2 », « app3 », « honor2 »), pounds, honor, passion
 * ({ match, delta, all }), check (liste de clés à cocher), duel, test ({ key, mod, success, failure }),
 * wound (formule, avec Affaibli), training (points en plus), skipTraining, conception (« sure » ou
 * modificateur), pair (test d'une paire de traits : effets selon le côté qui l'emporte), note.
 */

/** Motifs de passion (début du nom, sans accents ni casse). */
export const PASSION_MATCH = {
  homage: ["hommage", "allegeance"],
  loveFamily: ["amour (famille)"],
  loveSpouse: ["amour (conjoint", "amour (epou"],
  devotion: ["devotion"],
  hospitality: ["hospitalite"],
  station: ["rang"],
  hate: ["haine"],
  loyaltyKing: ["loyaute (roi"],
  loyaltyCompanions: ["loyaute (compagnons"]
};

const duel = { duel: true };

export const WINTER_EVENTS = [
  { roll: 1, options: ["trait.chaste.left", "trait.chaste.right"], outcomes: {
    "trait.chaste.left": {
      critical: { text: "Vous résistez à un(e) courtisan(e) venu(e) éprouver votre vertu.", effects: [{ glory: "app" }] },
      success: { text: "Vous acceptez les flatteries de la cour sans les encourager." },
      failure: { text: "Votre empressement fait jaser.", effects: [{ honor: -1 }] },
      fumble: { text: "Surpris en galante compagnie : prétendez-vous à un enchantement (cochez Trompeur, −1 Honneur) ou assumez-vous ? Une querelle de famille menace.", effects: [{ check: ["trait.honest.right"] }, { honor: -1 }] }
    },
    "trait.chaste.right": {
      critical: { text: "Si vous le souhaitez et si c'est possible, un enfant est conçu cette année.", effects: [{ conception: "sure" }] },
      success: { text: "Un enfant peut être conçu cette année… mais la paternité pourrait être discutée.", effects: [{ conception: "sure" }] },
      failure: { text: "Les tests de conception de l'année subissent −1.", effects: [{ conception: -1 }] },
      fumble: { text: "Vous éconduisez rudement un(e) soupirant(e) : marié, −1 en Amour (Conjoint) ou (Famille) ; sinon le MJ peut créer une Haine contre vous.", effects: [{ passion: { match: "loveSpouse", fallback: "loveFamily", delta: -1 } }] }
    }
  } },
  { roll: 2, options: ["trait.energetic.left"], outcomes: {
    "trait.energetic.left": {
      critical: { text: "Votre zèle est un exemple : 2 points de compétence en plus à l'étape Formation.", effects: [{ training: 2 }] },
      success: { text: "Vous travaillez dur tout l'hiver." },
      failure: { text: "Votre paresse vous coûte 1 point dans une compétence de votre choix.", effects: [{ note: "skillLoss" }] },
      fumble: { text: "Oisiveté complète : pas de Formation ni d'entraînement cette année.", effects: [{ skipTraining: true }] }
    }
  } },
  { roll: 3, options: ["trait.forgiving.left", "trait.forgiving.right"], outcomes: {
    "trait.forgiving.left": {
      critical: { text: "Vous tournez la page : −1 à toutes vos Haines.", effects: [{ passion: { match: "hate", delta: -1, all: true } }] },
      success: { text: "Vous changez en plaisanterie une insulte involontaire." },
      failure: { text: "Offensé, vous demandez réparation à un rival : duel.", effects: [duel] },
      fumble: { text: "Vous ruminez contre vos ennemis : cochez toutes vos Haines (ou créez-en une).", effects: [{ check: ["passion:hate*"] }] }
    },
    "trait.forgiving.right": {
      critical: { text: "Vous ruminez contre vos ennemis : cochez toutes vos Haines (ou créez-en une).", effects: [{ check: ["passion:hate*"] }] },
      success: { text: "Offensé, vous demandez réparation à un rival : duel.", effects: [duel] },
      failure: { text: "Vous pardonnez une insulte involontaire." },
      fumble: { text: "À quoi bon tant de colère ? −1 à toutes vos Haines.", effects: [{ passion: { match: "hate", delta: -1, all: true } }] }
    }
  } },
  { roll: 4, options: ["trait.generous.left"], outcomes: {
    "trait.generous.left": {
      critical: { text: "Don de 2 £ aux œuvres ; les paysans vous en savent gré.", effects: [{ pounds: -2 }, { check: ["skill.folklore"] }] },
      success: { text: "Don de 1 £ aux pauvres.", effects: [{ pounds: -1 }] },
      failure: { text: "Vous extorquez 1 £ aux paysans.", effects: [{ pounds: 1 }, { check: ["passion:station"] }] },
      fumble: { text: "Vous extorquez 2 £ aux paysans : +1 en Rang.", effects: [{ pounds: 2 }, { passion: { match: "station", delta: 1 } }, { check: ["passion:station"] }] }
    }
  } },
  { roll: 5, options: ["trait.honest.left", "trait.honest.right"], outcomes: {
    "trait.honest.left": {
      critical: { text: "Vous refusez de témoigner faussement contre un rival : il vous doit une faveur F1D6.", effects: [{ note: "favor" }] },
      success: { text: "Vous tenez votre opinion, même contre votre seigneur." },
      failure: { text: "Vous mentez pour vous tirer d'affaire." },
      fumble: { text: "Pris en flagrant délit de mensonge.", effects: [{ honor: -1 }] }
    },
    "trait.honest.right": {
      critical: { text: "Faux témoignage dans un litige foncier : la parcelle (1 £) est à vous, une querelle de famille éclate.", effects: [{ note: "land" }] },
      success: { text: "Vos récits fabuleux divertissent la cour.", effects: [{ glory: "app" }] },
      failure: { text: "Empêtré dans vos mensonges, un rival vous accuse : duel.", effects: [duel] },
      fumble: { text: "Pris en flagrant délit de mensonge.", effects: [{ honor: -1 }] }
    }
  } },
  { roll: 6, options: ["trait.just.left"], outcomes: {
    "trait.just.left": {
      critical: { text: "Vous refusez l'aide de votre seigneur dans un litige : il vous doit une faveur F1D6.", effects: [{ note: "favor" }] },
      success: { text: "Jugement équitable, pots-de-vin refusés." },
      failure: { text: "1 £ de pots-de-vin acceptés.", effects: [{ pounds: 1 }, { check: ["trait.honest.right", "trait.just.right"] }] },
      fumble: { text: "2 £ de pots-de-vin, puis une amende publique de 2 £ de l'évêque (si vous l'esquivez, cochez Égoïste et Matérialiste).", effects: [{ pounds: 2 }, { pounds: -2 }, { check: ["trait.honest.right", "trait.just.right"] }, { honor: -1 }] }
    }
  } },
  { roll: 7, options: ["trait.merciful.left"], outcomes: {
    "trait.merciful.left": {
      critical: { text: "1 £ pour les veuves et les orphelins ; le chapelain loue votre piété.", effects: [{ pounds: -1 }, { check: ["trait.spiritual.left"] }] },
      success: { text: "Votre justice est tempérée de miséricorde." },
      failure: { text: "Vous restez sourd aux suppliques : quelqu'un vous voue une Haine de 1D6+6.", effects: [{ note: "hatred" }] },
      fumble: { text: "Vous réduisez une famille au servage pour la faute d'une fille.", effects: [{ check: ["passion:station"] }] }
    }
  } },
  { roll: 8, options: ["trait.modest.left", "trait.modest.right"], outcomes: {
    "trait.modest.left": {
      critical: { text: "Vous félicitez celui qui s'est approprié votre idée : il vous doit une faveur F1D6.", effects: [{ note: "favor" }] },
      success: { text: "Vous laissez vos pairs passer devant vous à la table du seigneur." },
      failure: { text: "Un ménestrel chante vos exploits (1 £).", effects: [{ pounds: -1 }, { glory: "app" }] },
      fumble: { text: "Vos vantardises offensent un chevalier : duel.", effects: [duel] }
    },
    "trait.modest.right": {
      critical: { text: "Votre suzerain lève son verre à vos exploits.", effects: [{ glory: "app3" }] },
      success: { text: "Vous vantez vos exploits.", effects: [{ glory: "app" }] },
      failure: { text: "Vous perdez un concours de vantardise." },
      fumble: { text: "Vos vantardises offensent un chevalier : duel.", effects: [duel] }
    }
  } },
  { roll: 9, options: ["trait.prudent.left", "trait.prudent.right"], outcomes: {
    "trait.prudent.left": {
      critical: { text: "Provisions d'hiver bien préparées : 1 £ gagnée.", effects: [{ pounds: 1 }] },
      success: { text: "À la chasse, vous ne suivez pas les imprudents qui sautent le précipice." },
      failure: { text: "Vous sautez le précipice à cheval : Équitation −5 ; échec, vous perdez votre meilleur cheval de monte ; réussite, Gloire égale à l'ATT.",
        effects: [{ test: { key: "skill.horsemanship", mod: -5, success: [{ glory: "app" }], failure: [{ note: "loseHorse" }] } }] },
      fumble: { text: "Seul contre un gros sanglier : affaibli, blessure de 3D6 ; 30 Gloire si vous réussissez un test de Lance.",
        effects: [{ wound: "3D6" }, { check: ["skill.hunting"] }, { test: { key: "skill.spear", success: [{ glory: 30 }] } }] }
    },
    "trait.prudent.right": {
      critical: { text: "Vous abattez seul un gros sanglier.", effects: [{ glory: 30 }, { check: ["skill.spear", "skill.hunting"] }] },
      success: { text: "Vous franchissez le précipice avec aisance.", effects: [{ glory: "app" }, { check: ["skill.horsemanship"] }] },
      failure: { ifOpposite: "fails", text: "Vous renâclez au dernier moment ; si Prudent échoue aussi, Équitation −5 (échec : meilleur cheval perdu ; réussite : Gloire égale à l'ATT).",
        effects: [{ test: { key: "skill.horsemanship", mod: -5, success: [{ glory: "app" }], failure: [{ note: "loseHorse" }] } }] },
      fumble: { text: "Le sanglier vous surprend : affaibli, blessure de 3D6 ; 30 Gloire si vous réussissez un test de Lance.",
        effects: [{ wound: "3D6" }, { check: ["skill.hunting"] }, { test: { key: "skill.spear", success: [{ glory: 30 }] } }] }
    }
  } },
  { roll: 10, options: ["trait.spiritual.left"], outcomes: {
    "trait.spiritual.left": {
      critical: { text: "Pèlerinage (1 £) : une relance gratuite pour l'année à venir.", effects: [{ pounds: -1 }, { note: "reroll" }] },
      success: { text: "Le chapelain ou le druide cite votre piété en exemple." },
      failure: { text: "Offices négligés : −1 en Dévotion.", effects: [{ passion: { match: "devotion", delta: -1 } }] },
      fumble: { text: "Votre manque de foi est dénoncé en chaire : −2 en Dévotion.", effects: [{ passion: { match: "devotion", delta: -2 } }] }
    }
  } },
  { roll: 11, options: ["trait.temperate.left"], outcomes: {
    "trait.temperate.left": {
      critical: { text: "Vœu de pauvreté tenu : 1 £ d'économies.", effects: [{ pounds: 1 }] },
      success: { text: "Une vie sans excès." },
      failure: { text: "Biens de luxe : 1 £ de plus pour votre entretien.", effects: [{ pounds: -1 }] },
      fumble: { text: "Festins et vins fins : 3 £ (ou −1 Honneur et une faveur F3 due au seigneur s'il paie vos dettes).", effects: [{ pounds: -3 }] }
    }
  } },
  { roll: 12, options: ["trait.trusting.left"], outcomes: {
    "trait.trusting.left": {
      critical: { text: "Vous défendez publiquement un ami accusé : faveur F1D6.", effects: [{ note: "favor" }] },
      success: { text: "Vous faites confiance à un proche malgré les rumeurs : cochez la passion qui vous lie à lui (ou créez Amour ou Loyauté 1D6+6).", effects: [{ note: "trustPassion" }] },
      failure: { text: "Vous accusez un courtisan, qui exige un duel.", effects: [duel] },
      fumble: { text: "Vos accusations déclenchent une querelle de famille." }
    }
  } },
  { roll: 13, options: ["trait.valorous.left"], outcomes: {
    "trait.valorous.left": {
      critical: { text: "Vous sauvez seul un ami d'un sanglier.", effects: [{ glory: 30 }, { check: ["skill.hunting", "skill.spear"] }] },
      success: { text: "Chasse au sanglier.", effects: [{ glory: 10 }, { check: ["skill.hunting"] }] },
      failure: { text: "Vous feignez la maladie pour éviter la chasse.", effects: [{ check: ["trait.honest.right"] }] },
      fumble: { text: "Réfugié dans un arbre devant un sanglier.", effects: [{ honor: -1 }] }
    }
  } },
  { roll: 14, options: ["passion:homage"], outcomes: {
    "passion:homage": {
      critical: { text: "Invité à la haute table de votre seigneur.", effects: [{ glory: "app3" }, { check: ["honor"] }] },
      success: { text: "Votre seigneur loue publiquement votre loyauté.", effects: [{ glory: "app" }] },
      failure: { text: "Ignoré tout un festin : test de Modeste/Fier ; si Fier l'emporte, −1 en Hommage ou Allégeance.",
        effects: [{ pair: { trait: "modest", right: [{ passion: { match: "homage", delta: -1 } }] } }] },
      fumble: { text: "Vous trahissez un secret : −1 Honneur ; test de Modeste/Fier : Fier, vous quittez la cour un an (−1 en Hommage) ; Modeste, pardon au printemps.",
        effects: [{ honor: -1 }, { pair: { trait: "modest", right: [{ passion: { match: "homage", delta: -1 } }] } }] }
    }
  } },
  { roll: 15, options: ["passion:loveFamily"], outcomes: {
    "passion:loveFamily": {
      critical: { text: "Duel pour l'honneur des vôtres : blessure de 3D6, 30 Gloire.", effects: [{ wound: "3D6" }, { check: ["trait.valorous.left", "passion:loveFamily"] }, { glory: 30 }] },
      success: { text: "Vous vous portez garant d'un parent accusé." },
      failure: { text: "Querelles mesquines dans la famille.", effects: [{ passion: { match: "loveFamily", delta: -1 } }] },
      fumble: { text: "Vous calomniez un parent : −1 et une Jalousie envers lui.", effects: [{ passion: { match: "loveFamily", delta: -1 } }] }
    }
  } },
  { roll: 16, options: ["honor"], outcomes: {
    honor: {
      critical: { text: "Votre seigneur loue votre honneur et vous offre 2 £.", effects: [{ pounds: 2 }, { glory: "honor2" }, { check: ["passion:homage"] }] },
      success: { text: "Vos pairs louent votre conduite.", effects: [{ glory: "app" }] },
      failure: { text: "Votre honneur est mis en cause : duel.", effects: [duel] },
      fumble: { text: "Rumeurs sur votre conduite indigne.", effects: [{ honor: -1 }] }
    }
  } },
  { roll: 17, options: ["passion:hospitality"], outcomes: {
    "passion:hospitality": {
      critical: { text: "Votre seigneur vous visite et vous offre 2 £.", effects: [{ pounds: 2 }, { glory: "app2" }, { check: ["passion:homage", "honor"] }] },
      success: { text: "Votre hospitalité est reconnue.", effects: [{ glory: "app" }] },
      failure: { text: "Accusé d'un manquement : banquet ordonné (1 £).", effects: [{ pounds: -1 }] },
      fumble: { text: "Rumeurs : −1 en Hospitalité et un grand banquet (2 £).", effects: [{ passion: { match: "hospitality", delta: -1 } }, { pounds: -2 }] }
    }
  } },
  { roll: 18, options: ["passion:station"], outcomes: {
    "passion:station": {
      critical: { text: "Vous remettez à sa place un bourgeois parvenu : faveur F1D6 du seigneur.", effects: [{ note: "favor" }] },
      success: { text: "Vous révélez la liaison du prêtre local." },
      failure: { text: "Ridicule à la Fête de l'Âne.", effects: [{ honor: -1 }] },
      fumble: { text: "Vous prenez un chevalier pauvre pour un paysan : test de Modeste/Fier ; Modeste, vous payez son entretien (2 £) ; Fier, une Haine mutuelle naît.",
        effects: [{ pair: { trait: "modest", left: [{ pounds: -2 }], right: [{ note: "hatred" }] } }] }
    }
  } },
  { roll: 19, famous: true, options: ["passion:hate", "passion:loyaltyCompanions", "passion:loyaltyKing"], outcomes: {
    "passion:hate": {
      critical: { text: "Votre Haine vous pousse à agir : cochez Rancunier ; tests d'Hospitalité et d'Honneur (−1 sur échec) ; un échec : test de Cruel.", effects: [{ check: ["trait.forgiving.right"] }, { note: "hateAct" }] },
      success: { text: "Vous ruminez les affronts : cochez Rancunier.", effects: [{ check: ["trait.forgiving.right"] }] },
      failure: { text: "Plutôt serein : test d'Indulgent ; réussi, −1 en Haine et cochez Indulgent.", effects: [{ note: "hateCalm" }] },
      fumble: { text: "Cela en vaut-il la peine ? −1 en Haine, cochez Indulgent.", effects: [{ passion: { match: "hate", delta: -1 } }, { check: ["trait.forgiving.left"] }] }
    },
    "passion:loyaltyCompanions": {
      critical: { text: "Festin pour vos compagnons (1 £) ; vous aiderez celui qui en aura besoin.", effects: [{ pounds: -1 }, { glory: 10 }] },
      success: { text: "Festin pour vos compagnons (1 £).", effects: [{ pounds: -1 }, { glory: 10 }] },
      failure: { text: "Vous vous éloignez du groupe (trait dirigé positif perdu, ou négatif +1)." },
      fumble: { text: "Vous ruminez une offense.", effects: [{ passion: { match: "loyaltyCompanions", delta: -1 } }] }
    },
    "passion:loyaltyKing": {
      critical: { text: "Votre émotion devant le roi fait l'admiration de tous.", effects: [{ glory: "app" }, { check: ["honor"] }] },
      success: { text: "Vous reprenez des ivrognes qui moquaient le roi." },
      failure: { text: "Vous riez avec eux." },
      fumble: { text: "Vous doutez ouvertement d'un exploit du roi.", effects: [{ passion: { match: "loyaltyKing", delta: -1 } }] }
    }
  } },
  { roll: 20, choice: true }
];

/** Événement d'après le jet. */
export function winterEvent(roll) {
  return WINTER_EVENTS.find(e => e.roll === Number(roll)) ?? null;
}
