/**
 * Bandeau d'une bataille : image du tour, sinon celle de la bataille, sinon le bandeau par défaut du
 * monde (réglage « Bandeau de bataille par défaut »), sinon le bandeau neutre dessiné par le système.
 * Le cadre doré est dessiné en CSS autour de toutes les images.
 */
import { PDVF, SYSTEM_ID } from "../config.mjs";

export const BANNER_SETTING = "battleBanner";

/** Réglage du monde : chemin de l'image par défaut (vide : bandeau neutre du système). */
export function defaultBannerPath() {
  try { return game.settings.get(SYSTEM_ID, BANNER_SETTING) || ""; } catch (err) { return ""; }
}

/**
 * Image et hauteur de cadrage (%) du bandeau.
 * @param {Item} battle
 * @param {number|null} [round]  tour de bataille dont on veut l'image propre
 * @returns {{src:string, focus:number, own:boolean}}
 */
export function bannerFor(battle, round = null) {
  const s = battle?.system;
  if (s && round) {
    const ev = s.events?.find(e => e.round === Number(round) && e.img);
    if (ev) return { src: ev.img, focus: ev.focus ?? PDVF.battle.bannerFocus, own: true };
  }
  if (s?.banner?.img) return { src: s.banner.img, focus: s.banner.focus ?? PDVF.battle.bannerFocus, own: true };
  const world = defaultBannerPath();
  if (world) return { src: world, focus: PDVF.battle.bannerFocus, own: false };
  return { src: PDVF.battle.defaultBanner, focus: 50, own: false };
}

/** Ouvre le sélecteur d'images de Foundry ; renvoie le chemin choisi (ou null). */
export function pickImage(current = "") {
  const FP = foundry.applications.apps?.FilePicker?.implementation ?? globalThis.FilePicker;
  return new Promise((resolve) => {
    const picker = new FP({ type: "image", current, callback: (path) => resolve(path) });
    picker.render(true);
  });
}
