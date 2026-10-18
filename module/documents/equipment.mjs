/**
 * Équipement des acteurs : objets du compendium « Équipement » donnés au chevalier
 * (équipement de départ, objet de famille de la chance du débutant).
 */
import { PDVF, SYSTEM_ID } from "../config.mjs";

export const GEAR_TYPES = ["arme", "armure", "bouclier"];
const PACK = "world.pendragon-equipement";
let cache = null;

/** Objets du fichier data/equipement.json (même contenu que le compendium), par nom. */
export async function equipmentCatalog() {
  if (cache) return cache;
  const response = await fetch(foundry.utils.getRoute(`systems/${SYSTEM_ID}/data/equipement.json`));
  const data = await response.json();
  cache = new Map((data.items ?? []).map(i => [i.name, i]));
  return cache;
}

/** Données de création d'un objet du catalogue (sans dossier), reliées au compendium s'il existe. */
function itemData(entry, { equipped = false, quantity } = {}) {
  const data = foundry.utils.deepClone(entry);
  delete data.folder;
  const id = data._id;
  delete data._id;
  data.system.equipped = !!equipped;
  if (quantity !== undefined) data.system.quantity = quantity;
  if (game.packs?.get(PACK)) foundry.utils.setProperty(data, "_stats.compendiumSource", `Compendium.${PACK}.Item.${id}`);
  return data;
}

/**
 * Donne une liste d'objets (par nom) à un acteur.
 * @param {Actor} actor
 * @param {{name:string, equipped?:boolean, quantity?:number}[]} list
 */
export async function giveItems(actor, list) {
  const catalog = await equipmentCatalog();
  const docs = [];
  for (const row of list) {
    const entry = catalog.get(row.name);
    if (entry) docs.push(itemData(entry, row));
    else console.warn(`${SYSTEM_ID} | Objet d'équipement inconnu : ${row.name}`);
  }
  return docs.length ? actor.createEmbeddedDocuments("Item", docs) : [];
}

/** L'acteur a-t-il déjà des armes, armures ou boucliers ? */
export function hasGear(actor) {
  return actor.items.some(i => GEAR_TYPES.includes(i.type));
}

/**
 * Équipement de départ (Livre du joueur p. 58 et Table 9.1) : chevalier ou écuyer.
 * @param {Actor} actor
 * @param {"knight"|"squire"} kind
 */
export async function giveStartingEquipment(actor, kind = "knight") {
  return giveItems(actor, PDVF.startingEquipment[kind] ?? []);
}
