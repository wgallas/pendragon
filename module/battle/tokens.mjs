/**
 * « Placer les ennemis » : pose sur la scène active le bon nombre de jetons de l'adversaire
 * d'une rencontre (acteur du compendium importé une fois dans le monde, jetons non liés).
 */
import { SYSTEM_ID } from "../config.mjs";
import { enemyCount } from "../rules/battle.mjs";
import { findEncounter, onField } from "./engine.mjs";

const L = (k) => game.i18n.localize(k);
const F = (k, d) => game.i18n.format(k, d);

/** Acteur du monde correspondant à l'adversaire (importé du compendium au besoin). */
async function worldActorFor(uuid) {
  const existing = game.actors.find(a => a.getFlag(SYSTEM_ID, "battleSource") === uuid || a._stats?.compendiumSource === uuid);
  if (existing) return existing;
  const doc = await fromUuid(uuid);
  if (!doc) return null;
  if (!doc.pack) return doc;
  let folder = game.folders.find(f => f.type === "Actor" && f.getFlag(SYSTEM_ID, "battleFolder"));
  if (!folder) folder = await Folder.implementation.create({ name: L("PDVF.Battle.EnemyFolder"), type: "Actor", flags: { [SYSTEM_ID]: { battleFolder: true } } });
  const data = doc.toObject();
  delete data._id;
  data.folder = folder.id;
  foundry.utils.setProperty(data, `flags.${SYSTEM_ID}.battleSource`, uuid);
  foundry.utils.setProperty(data, "_stats.compendiumSource", uuid);
  return Actor.implementation.create(data, { pdvfSkipWizard: true });
}

/** Pose les ennemis de la rencontre retenue, en rangées au centre de la vue. */
export async function placeEnemies(battle) {
  if (!game.user.isGM) return;
  const s = battle.system;
  const enc = findEncounter(s, s.state.selectedId);
  if (!enc) return ui.notifications.warn(L("PDVF.Battle.Notify.NoEncounter"));
  if (!enc.npc) return ui.notifications.warn(F("PDVF.Battle.Notify.NoNpc", { name: enc.name }));
  if (!canvas?.scene) return ui.notifications.warn(L("PDVF.Battle.Notify.NoScene"));
  const actor = await worldActorFor(enc.npc);
  if (!actor) return ui.notifications.warn(F("PDVF.Battle.Notify.NoNpc", { name: enc.name }));

  const count = enemyCount(enc, onField(s).length, s.state.doubled);
  const proto = await actor.getTokenDocument();
  const w = Math.max(1, proto.width ?? 1);
  const h = Math.max(1, proto.height ?? 1);
  const grid = canvas.grid.size;
  const perRow = Math.min(count, 6);
  const center = canvas.stage.pivot;
  const x0 = center.x - (perRow * w * grid) / 2;
  const y0 = center.y - (Math.ceil(count / perRow) * h * grid) / 2;
  const tokens = [];
  for (let i = 0; i < count; i++) {
    let x = x0 + (i % perRow) * w * grid;
    let y = y0 + Math.floor(i / perRow) * h * grid;
    const snapped = canvas.grid.getSnappedPoint?.({ x, y }, { mode: CONST.GRID_SNAPPING_MODES.TOP_LEFT_CORNER });
    if (snapped) ({ x, y } = snapped);
    const td = await actor.getTokenDocument({
      x, y, actorLink: false, name: count > 1 ? `${actor.name} ${i + 1}` : actor.name,
      flags: { [SYSTEM_ID]: { battle: battle.uuid, battleRound: s.state.round } }
    });
    tokens.push(td.toObject());
  }
  await canvas.scene.createEmbeddedDocuments("Token", tokens);
  ui.notifications.info(F("PDVF.Battle.Notify.Placed", { count, name: actor.name }));
}

/** Retire de la scène active les jetons posés par cette bataille. */
export async function removeEnemies(battle) {
  if (!game.user.isGM || !canvas?.scene) return;
  const ids = canvas.scene.tokens.filter(t => t.getFlag(SYSTEM_ID, "battle") === battle.uuid).map(t => t.id);
  if (ids.length) await canvas.scene.deleteEmbeddedDocuments("Token", ids);
}
