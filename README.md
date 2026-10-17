# Pendragon (VF) pour Foundry VTT v14

Système non officiel pour Pendragon 6e édition en français. Version 0.1.0 : première brique.

## Installation

1. Décompresser l'archive dans le dossier des systèmes de Foundry :
   `Données utilisateur/Data/systems/pendragon-vf/` (le nom du dossier doit être exactement `pendragon-vf`, et `system.json` doit se trouver directement dedans).
2. Relancer Foundry, créer un monde avec le système « Pendragon (VF) ».
3. Dans les réglages du monde, renseigner l'« Année de jeu en cours » (508 par défaut).

## Contenu de la version 0.1.0

- Fiche de chevalier : bandeau (écusson, Gloire, Honneur, jauge de PV), onglets Chevalier, Traits & passions, Lignée et Chronique.
- Mode jeu (valeurs cliquables) et mode édition (bouton dans le bandeau), avec boutons − et + pour les caractéristiques, compétences, traits, passions et l'Honneur.
- Jets : clic = test de d20 avec le modificateur choisi ; Maj + clic = options (modificateur, opposition fixe, test opposé contre le jeton ciblé avec modificateur réfléchi).
- Règles automatisées : critique, échec critique, bonus de critique au-delà de 20, valeurs négatives, tests opposés et succès partiel, procédure des traits (trait Célèbre testé en premier, trait opposé en cas d'échec), passions (Inspiré, Enflammé, crise, Mélancolie, Folie, perte de point), test de Gloire, croix d'expérience cochées automatiquement sur critique.
- Caractéristiques dérivées, Gloire totale tirée de la chronique, récompenses de prestige, Gloire passive (traits, passions, Attrait).
- Assistant de création (s'ouvre à la création d'un chevalier ; bouton dans l'onglet Lignée en mode édition) : méthode construite ou aléatoire, origines par listes déroulantes (fonction, classe, culture, région, religion), caractéristiques, traits, passions, famille, compétences, années d'écuyer, adoubement. Les listes sont des données ouvertes (`CONFIG.PDVF.creation`) que des suppléments pourront compléter.
- Fiche de PNJ (écuyer, suivant, personnage, créature) sur le modèle des blocs du Livre du maître ; suite du chevalier (onglet Suite & domaine) avec « Nouvel écuyer » ; conversion d'un PNJ en chevalier.
- Compendium « Pendragon — Adversaires » (81 adversaires du Livre du maître : chevaliers, combattants, Saxons, Pictes, unités de bataille, animaux, créatures féeriques et monstres), créé dans le monde au premier chargement par le MJ. Seules les valeurs de jeu sont reprises, avec la page du livre ; `game.pendragon.importAdversaries({ force: true })` le recrée.
- Chevaux : fiche de cheval (19 types, robe, sexe, âge, tours, personnalité, barde, épuisement), écurie du chevalier, chevaux de départ, Gloire passive des chevaux.
- Batailles (Livre du maître, chap. 6) : objet « Bataille » (préparation, déroulement tour par tour, bilan) et objet « Rencontre » (opposant ou opportunité). Le MJ conduit chaque tour (rencontre par défaut, test de charge, Intensité, choix, Moral) ; les joueurs lancent eux-mêmes leurs tests de Bataille, postures, passions et tests d'Écuyer depuis la fiche ou les cartes du chat ; « Placer les ennemis » pose les jetons de l'adversaire sur la scène ; le bilan calcule le résultat, la Gloire (Tables 6.6 à 6.8) et le butin, puis l'inscrit sur les fiches. Compendium « Pendragon — Rencontres de bataille » (12 opposants et 6 opportunités, résumés reformulés), `game.pendragon.importEncounters({ force: true })` le recrée.
- Historique familial (onglet Lignée, mode édition) : trois propositions tirées au hasard sur trois générations (arrière-grand-père, grand-père, père), d'après l'historique de Salisbury de la 5.2 pour 439–484 et la chronologie de la 6e pour 483–507. Gloire héritée et passions héritées selon les règles de la 6e, traits dirigés, legs et obligations, famille vivante.

Les onglets « Combat & équipement » et « Suite & domaine » sont partiels : objets (armes, armures), blessures, montures, PNJ et domaines arrivent aux étapes suivantes.

## Si quelque chose ne marche pas

Ouvrir la console du navigateur (F12), copier les lignes rouges qui commencent par `pendragon-vf` ou qui citent un fichier du système, et les transmettre.

## Publier une version (GitHub)

Sur github.com, dans le dépôt : Releases › Draft a new release › tag `v0.1.0` (ou suivant) › Publish release.
Le workflow `.github/workflows/release.yml` joint alors `system.json` et `system.zip` à la version.

Adresse du manifeste à coller dans Foundry (local ou The Forge) :
`https://github.com/wgallas/pendragon/releases/latest/download/system.json`
