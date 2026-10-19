/**
 * Portrait du chevalier (image de l'acteur), affiché dans l'onglet Lignée.
 * Les jetons se règlent à part, dans Foundry.
 */
import { isDefaultActorImg, actorIcon } from "./icons.mjs";

export function portraitView(actor) {
  const src = actor._source ?? actor;
  const img = src.img || actor.img || actorIcon(actor.type, src.system);
  return { img, custom: !isDefaultActorImg(img, actor.type) };
}
