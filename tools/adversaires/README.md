# Adversaires du Livre du maître

`data/adversaires.json` est produit par ces deux scripts à partir du texte du Livre du maître
(extrait du PDF, non fourni dans ce dépôt, fichier `gm.txt` placé dans ce dossier) :

1. `python3 parse.py` : repère les blocs de statistiques et en extrait les valeurs de jeu ;
2. `python3 build.py` : choisit les adversaires, corrige l'extraction, ajoute les résumés de capacités
   (reformulés) et la page du livre, puis écrit `data/adversaires.json`.

Seules les valeurs de jeu sont reprises ; aucun texte descriptif du livre n'est recopié.
Après une modification, augmenter `version` dans le fichier produit : le compendium du monde est alors
recréé au prochain chargement par le MJ.
