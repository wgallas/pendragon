/**
 * Compendiums du système (« Adversaires », « Rencontres de bataille », « Équipement ») : créés et tenus à jour dans
 * le monde par le MJ, à partir des fichiers data/*.json (Livre du maître).
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
 * Crée un compendium du monde s'il n'existe pas, ou le remplace si les données du système sont plus récentes.
 * @param {object} spec
 * @param {string} spec.file      fichier de données (data/…json : version, folders, documents)
 * @param {string} spec.name      nom du compendium dans le monde
 * @param {"Actor"|"Item"} spec.type
 * @param {string} spec.label     clé de traduction du nom
 * @param {string} spec.setting   réglage qui retient la version importée
 * @param {string} spec.key       clé des documents dans le fichier (« actors », « items »)
 * @param {boolean} [force]       réimporter même si la version est à jour
 */
async function ensurePack({ file, name, type, label, setting, key }, force = false) {
  if (!game.user.isGM) return null;
  let data;
  try {
    const response = await fetch(foundry.utils.getRoute(`systems/${SYSTEM_ID}/data/${file}`));
    data = await response.json();
  } catch (err) {
    console.error(`${SYSTEM_ID} | Lecture de ${file} impossible`, err);
    return null;
  }
  const stored = Number(game.settings.get(SYSTEM_ID, setting)) || 0;
  let pack = game.packs.get(`world.${name}`);
  if (pack && stored >= data.version && !force) return pack;

  const cls = type === "Actor" ? Actor.implementation : Item.implementation;
  const docs = data[key] ?? [];
  try {
    if (!pack) pack = await CompendiumCollectionClass().createCompendium({ type, label: L(label), name });
    if (pack.locked) await pack.configure({ locked: false });

    // Remplacement complet : dossiers puis documents (identifiants fixes)
    const index = await pack.getIndex();
    if (index.size) await cls.deleteDocuments([...index.keys()], { pack: pack.collection });
    const oldFolders = pack.folders?.map(f => f.id) ?? [];
    if (oldFolders.length) await Folder.implementation.deleteDocuments(oldFolders, { pack: pack.collection });
    if (data.folders?.length) await Folder.implementation.createDocuments(data.folders, { pack: pack.collection, keepId: true });
    await cls.createDocuments(docs, { pack: pack.collection, keepId: true, pdvfSkipWizard: true });

    await pack.configure({ locked: true });
    await game.settings.set(SYSTEM_ID, setting, data.version);
    ui.notifications.info(F("PDVF.Compendium.Imported", { count: docs.length, label: L(label) }));
    console.log(`${SYSTEM_ID} | Compendium ${name} : ${docs.length} documents (version ${data.version})`);
  } catch (err) {
    console.error(`${SYSTEM_ID} | Création du compendium ${name} impossible`, err);
    ui.notifications.error(`${L(label)} : ${err.message}`);
  }
  return pack;
}

/** Compendium « Pendragon — Adversaires » (blocs du Livre du maître). */
export function ensureAdversaries({ force = false } = {}) {
  return ensurePack({ file: "adversaires.json", name: PACK_NAME, type: "Actor", label: "PDVF.Compendium.Adversaries", setting: "adversariesVersion", key: "actors" }, force);
}

/** Compendium « Pendragon — Rencontres de bataille » (Livre du maître, chap. 6). */
export function ensureEncounters({ force = false } = {}) {
  return ensurePack({ file: "rencontres.json", name: "pendragon-rencontres", type: "Item", label: "PDVF.Compendium.Encounters", setting: "encountersVersion", key: "items" }, force);
}

/** Compendium « Pendragon — Équipement » (Livre du joueur, chap. 8 et 9 ; appendice A). */
export const EQUIPMENT_PACK = "pendragon-equipement";
export function ensureEquipment({ force = false } = {}) {
  return ensurePack({ file: "equipement.json", name: EQUIPMENT_PACK, type: "Item", label: "PDVF.Compendium.Equipment", setting: "equipmentVersion", key: "items" }, force);
}
