# Pendragon (VF) pour Foundry VTT v14

Système non officiel pour Pendragon 6e édition en français. Version 0.1.0 : première brique.

## Installation

1. Décompresser l'archive dans le dossier des systèmes de Foundry :
   `Données utilisateur/Data/systems/pendragon-vf/` (le nom du dossier doit être exactement `pendragon-vf`, et `system.json` doit se trouver directement dedans).
2. Relancer Foundry, créer un monde avec le système « Pendragon (VF) ».
3. Dans les réglages du monde, renseigner l'« Année de jeu en cours » (508 par défaut).

## Contenu de la version 0.1.0

- Fiche de chevalier : bandeau (écusson, Gloire, Honneur, jauge de PV), onglets Chevalier, Traits & passions, Lignée et Chronique.
- Mode jeu (valeurs cliquables) et mode édition (bouton dans le bandeau).
- Jets : clic = test de d20 avec le modificateur choisi ; Maj + clic = options (modificateur, opposition fixe, test opposé contre le jeton ciblé avec modificateur réfléchi).
- Règles automatisées : critique, échec critique, bonus de critique au-delà de 20, valeurs négatives, tests opposés et succès partiel, procédure des traits (trait Célèbre testé en premier, trait opposé en cas d'échec), passions (Inspiré, Enflammé, crise, Mélancolie, Folie, perte de point), test de Gloire, croix d'expérience cochées automatiquement sur critique.
- Caractéristiques dérivées, Gloire totale tirée de la chronique, récompenses de prestige, Gloire passive (traits, passions, Attrait).

Les onglets « Combat & équipement » et « Suite & domaine » sont partiels : objets (armes, armures), blessures, montures, PNJ et domaines arrivent aux étapes suivantes.

## Si quelque chose ne marche pas

Ouvrir la console du navigateur (F12), copier les lignes rouges qui commencent par `pendragon-vf` ou qui citent un fichier du système, et les transmettre.

## Publier une version (GitHub)

Sur github.com, dans le dépôt : Releases › Draft a new release › tag `v0.1.0` (ou suivant) › Publish release.
Le workflow `.github/workflows/release.yml` joint alors `system.json` et `system.zip` à la version.

Adresse du manifeste à coller dans Foundry (local ou The Forge) :
`https://github.com/wgallas/pendragon/releases/latest/download/system.json`
