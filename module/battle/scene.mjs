/**
 * Scène des combats d'une bataille : celle choisie dans la préparation, sinon la scène par défaut
 * « Champ de bataille », créée par le MJ au chargement du monde si elle n'existe pas.
 */
import { SYSTEM_ID } from "../config.mjs";

const L = (k) => game.i18n.localize(k);
const FLAG = "battlefield";

/** La scène par défaut (reconnue par son drapeau, sinon par son nom). */
export function defaultBattlefield() {
  return game.scenes?.find(s => s.getFlag(SYSTEM_ID, FLAG)) ?? game.scenes?.getName(L("PDVF.Battle.DefaultScene")) ?? null;
}

/** Crée la scène « Champ de bataille » si elle n'existe pas (MJ seulement). */
export async function ensureBattlefield() {
  if (!game.user.isGM || defaultBattlefield()) return null;
  try {
    const scene = await Scene.implementation.create({
      name: L("PDVF.Battle.DefaultScene"),
      navigation: false,
      width: 4000,
      height: 2800,
      padding: 0.1,
      backgroundColor: "#4F5A35",
      grid: { size: 100 },
      flags: { [SYSTEM_ID]: { [FLAG]: true } }
    });
    console.log(`${SYSTEM_ID} | Scène « ${scene?.name} » créée`);
    return scene;
  } catch (err) {
    console.error(`${SYSTEM_ID} | Création de la scène de bataille impossible`, err);
    return null;
  }
}

/** Scène de la bataille. */
export function battleScene(battle) {
  const id = battle?.system?.scene;
  let scene = null;
  if (id) {
    try { scene = fromUuidSync(id); } catch (err) { scene = null; }
  }
  return scene ?? defaultBattlefield();
}

/** Affiche la scène de la bataille chez le MJ (pour y poser les ennemis). */
export async function viewBattleScene(battle) {
  const scene = battleScene(battle);
  if (!scene) return null;
  if (canvas?.scene?.id !== scene.id) await scene.view();
  return scene;
}
