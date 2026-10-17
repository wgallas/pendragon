/**
 * Compendium « Pendragon — Adversaires » : créé et tenu à jour dans le monde par le MJ,
 * à partir de data/adversaires.json (blocs du Livre du maître, chap. 6 à 8).
 *
 * On passe par un compendium du monde plutôt que par un compendium du système : les fichiers
 * LevelDB d'un compendium du système seraient modifiés par Foundry à chaque lancement, ce qui
 * gênerait les mises à jour par GitHub Desktop.
 */
import { SYSTEM_ID } from "../config.mjs";

const PACK_NAME = "pendragon-adversaires";
const L = (k) => game.i18n.localize(k);
const F = (k, d) => game.i18n.format(k, d);

function CompendiumCollectionClass() {
  return foundry.documents?.collections?.CompendiumCollection ?? globalThis.CompendiumCollection;
}

/**
 * Crée le compendium s'il n'existe pas, ou le remplace si les données du système sont plus récentes.
 * @param {{force?: boolean}} [options]  force : réimporter même si la version est à jour
 */
export async function ensureAdversaries({ force = false } = {}) {
  if (!game.user.isGM) return null;
  let data;
  try {
    const response = await fetch(foundry.utils.getRoute(`systems/${SYSTEM_ID}/data/adversaires.json`));
    data = await response.json();
  } catch (err) {
    console.error(`${SYSTEM_ID} | Lecture des adversaires impossible`, err);
    return null;
  }
  const stored = Number(game.settings.get(SYSTEM_ID, "adversariesVersion")) || 0;
  let pack = game.packs.get(`world.${PACK_NAME}`);
  if (pack && stored >= data.version && !force) return pack;

  try {
    if (!pack) {
      pack = await CompendiumCollectionClass().createCompendium({ type: "Actor", label: L("PDVF.Compendium.Adversaries"), name: PACK_NAME });
    }
    if (pack.locked) await pack.configure({ locked: false });

    // Remplacement complet : dossiers puis acteurs (identifiants fixes)
    const index = await pack.getIndex();
    if (index.size) await Actor.implementation.deleteDocuments([...index.keys()], { pack: pack.collection });
    const oldFolders = pack.folders?.map(f => f.id) ?? [];
    if (oldFolders.length) await Folder.implementation.deleteDocuments(oldFolders, { pack: pack.collection });
    await Folder.implementation.createDocuments(data.folders, { pack: pack.collection, keepId: true });
    await Actor.implementation.createDocuments(data.actors, { pack: pack.collection, keepId: true, pdvfSkipWizard: true });

    await pack.configure({ locked: true });
    await game.settings.set(SYSTEM_ID, "adversariesVersion", data.version);
    ui.notifications.info(F("PDVF.Compendium.Imported", { count: data.actors.length }));
    console.log(`${SYSTEM_ID} | Compendium des adversaires : ${data.actors.length} acteurs (version ${data.version})`);
  } catch (err) {
    console.error(`${SYSTEM_ID} | Création du compendium des adversaires impossible`, err);
    ui.notifications.error(`${L("PDVF.Compendium.Adversaries")} : ${err.message}`);
  }
  return pack;
}
