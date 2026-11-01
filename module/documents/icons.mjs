/**
 * Icônes par défaut des acteurs et des objets du système (icons/types, icons/gear), à la place
 * de celles de Foundry. Les PNJ prennent l'icône de leur catégorie, les rencontres de bataille
 * celle de leur genre (adversaire ou occasion).
 */
import { SYSTEM_ID } from "../config.mjs";

const T = `systems/${SYSTEM_ID}/icons/types`;
const G = `systems/${SYSTEM_ID}/icons/gear`;

export const ACTOR_ICONS = {
  chevalier: `${T}/knight.svg`,
  cheval: `${T}/horse.svg`,
  pnj: { squire: `${T}/squire.svg`, follower: `${T}/follower.svg`, character: `${T}/character.svg`, creature: `${T}/creature.svg` }
};

export const ITEM_ICONS = {
  bataille: `${T}/battle.svg`,
  tournoi: `${T}/tournament.svg`,
  rencontre: { opponent: `${T}/encounter.svg`, opportunity: `${T}/opportunity.svg` },
  arme: `${G}/sword.svg`,
  armure: `${G}/mail.svg`,
  bouclier: `${G}/shield_norman.svg`,
  domaine: `${G}/domain.svg`
};

/** Icônes de Foundry (et anciennes icônes par défaut du système) qu'on remplace. */
const FOUNDRY_ACTOR = ["icons/svg/mystery-man.svg"];
const FOUNDRY_ITEM = ["icons/svg/item-bag.svg"];
const OLD_ITEM = { bataille: ["icons/svg/combat.svg"], rencontre: ["icons/svg/sword.svg", "icons/svg/aura.svg"] };

const values = (o) => (typeof o === "string" ? [o] : Object.values(o ?? {}));

export function actorIcon(type, system = {}) {
  const def = ACTOR_ICONS[type];
  if (!def) return null;
  return typeof def === "string" ? def : (def[system?.category] ?? def.character);
}

export function itemIcon(type, system = {}) {
  const def = ITEM_ICONS[type];
  if (!def) return null;
  return typeof def === "string" ? def : (def[system?.kind] ?? def.opponent);
}

/** L'image est-elle une icône par défaut (de Foundry, ou une des nôtres pour ce type) ? */
export function isDefaultActorImg(img, type) {
  return !img || FOUNDRY_ACTOR.includes(img) || img === globalThis.CONST?.DEFAULT_TOKEN || values(ACTOR_ICONS[type]).includes(img);
}
export function isDefaultItemImg(img, type) {
  return !img || FOUNDRY_ITEM.includes(img) || (OLD_ITEM[type] ?? []).includes(img) || values(ITEM_ICONS[type]).includes(img);
}

/**
 * Changements d'image d'un acteur à créer ou mis à jour : l'icône du type si l'image (et la
 * texture du jeton) sont encore celles par défaut.
 * @returns {object} mises à jour à plat (vide s'il n'y a rien à faire)
 */
export function actorIconUpdates({ type, img, tokenSrc, system }) {
  const icon = actorIcon(type, system);
  const out = {};
  if (!icon) return out;
  if (isDefaultActorImg(img, type) && img !== icon) out.img = icon;
  if (isDefaultActorImg(tokenSrc, type) && tokenSrc !== icon) out["prototypeToken.texture.src"] = icon;
  return out;
}

export function itemIconUpdates({ type, img, system }) {
  const icon = itemIcon(type, system);
  return icon && isDefaultItemImg(img, type) && img !== icon ? { img: icon } : {};
}

/**
 * Une fois par monde (MJ) : les acteurs et objets existants qui portent encore l'icône de Foundry
 * prennent celle de leur type, de même que les jetons posés sur les scènes.
 */
export async function migrateDefaultIcons() {
  if (!game.user.isGM) return;
  const VERSION = 1;
  if ((Number(game.settings.get(SYSTEM_ID, "iconsVersion")) || 0) >= VERSION) return;
  const actors = game.actors.map(a => ({ _id: a.id, ...actorIconUpdates({ type: a.type, img: a._source.img, tokenSrc: a._source.prototypeToken?.texture?.src, system: a._source.system }) }))
    .filter(u => Object.keys(u).length > 1);
  if (actors.length) await Actor.implementation.updateDocuments(actors);
  const items = game.items.map(i => ({ _id: i.id, ...itemIconUpdates({ type: i.type, img: i._source.img, system: i._source.system }) }))
    .filter(u => Object.keys(u).length > 1);
  if (items.length) await Item.implementation.updateDocuments(items);
  for (const scene of game.scenes) {
    const tokens = scene.tokens.filter(t => t.actor && isDefaultActorImg(t._source.texture?.src, t.actor.type))
      .map(t => ({ _id: t.id, "texture.src": actorIcon(t.actor.type, t.actor.system) }))
      .filter(u => u["texture.src"] && u["texture.src"] !== scene.tokens.get(u._id)._source.texture?.src);
    if (tokens.length) await scene.updateEmbeddedDocuments("Token", tokens);
  }
  await game.settings.set(SYSTEM_ID, "iconsVersion", VERSION);
  console.log(`${SYSTEM_ID} | Icônes par défaut : ${actors.length} acteurs, ${items.length} objets`);
}
