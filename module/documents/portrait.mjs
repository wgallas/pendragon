/**
 * Portrait du chevalier et image de son jeton. Le portrait est l'image de l'acteur ; le jeton peut
 * le reprendre dans l'anneau dynamique de Foundry (qui le découpe en cercle), ou prendre une
 * image propre, déjà circulaire.
 */
import { isDefaultActorImg, actorIcon } from "./icons.mjs";

/** Couleurs de l'anneau : or et parchemin, comme les fiches. */
export const RING_COLORS = { ring: "#b8892b", background: "#f4ead0" };

export function portraitView(actor) {
  const src = actor._source ?? actor;
  const img = src.img || actor.img || actorIcon(actor.type, src.system);
  const token = src.prototypeToken?.texture?.src || img;
  const ring = !!src.prototypeToken?.ring?.enabled;
  const L = (k) => game.i18n.localize(k);
  return {
    img, token, ring,
    custom: !isDefaultActorImg(img, actor.type),
    tokenState: ring ? L("PDVF.Portrait.StateRing") : isDefaultActorImg(token, actor.type) ? L("PDVF.Portrait.StateDefault") : L("PDVF.Portrait.StateOwn")
  };
}

/**
 * Change l'image du jeton de l'acteur (prototype et jetons déjà posés sur les scènes).
 * @param {Actor} actor
 * @param {string} path
 * @param {{ring:boolean}} options anneau dynamique (découpe circulaire) ou image telle quelle
 */
export async function setTokenImage(actor, path, { ring }) {
  const data = { "texture.src": path, "ring.enabled": !!ring };
  if (ring) {
    const colors = actor._source.prototypeToken?.ring?.colors ?? {};
    if (!colors.ring) data["ring.colors.ring"] = RING_COLORS.ring;
    if (!colors.background) data["ring.colors.background"] = RING_COLORS.background;
  }
  await actor.update(Object.fromEntries(Object.entries(data).map(([k, v]) => [`prototypeToken.${k}`, v])));
  for (const scene of game.scenes ?? []) {
    const tokens = scene.tokens.filter(t => t.actorId === actor.id && t.actorLink && t.canUserModify?.(game.user, "update"));
    if (tokens.length) await scene.updateEmbeddedDocuments("Token", tokens.map(t => ({ _id: t.id, ...data })));
  }
}
