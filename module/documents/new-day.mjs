import { SYSTEM_ID } from "../config.mjs";

/**
 * « Nouveau jour » du MJ : chaque passion peut de nouveau être invoquée
 * et les inspirations en cours prennent fin, pour tous les chevaliers
 * (acteurs du monde et jetons non liés des scènes).
 */
export async function newDayForAll({ confirm = true } = {}) {
  if (!game.user.isGM) return;
  const L = (k) => game.i18n.localize(k);
  if (confirm) {
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: L("PDVF.Invoke.NewDay") },
      content: `<p>${L("PDVF.Invoke.NewDayConfirm")}</p>`,
      rejectClose: false
    });
    if (!ok) return;
  }
  const actors = new Set(game.actors.filter(a => a.type === "chevalier"));
  for (const scene of game.scenes) {
    for (const token of scene.tokens) {
      if (!token.actorLink && token.actor?.type === "chevalier") actors.add(token.actor);
    }
  }
  for (const actor of actors) await actor.newDay();
  await ChatMessage.implementation.create({
    content: `<div class="pdvf-card"><div class="pdvf-verdict victory"><i class="fa-solid fa-sun" aria-hidden="true"></i> ${L("PDVF.Invoke.NewDayChat")}</div></div>`,
    speaker: { alias: L("PDVF.Invoke.NewDay") },
    flags: { [SYSTEM_ID]: { kind: "newDay" } }
  });
}

/** Bouton du MJ dans les outils des jetons (barre de gauche). */
export function addNewDayControl(controls) {
  if (!game.user.isGM) return;
  const tool = {
    name: "pdvfNewDay",
    title: "PDVF.Invoke.NewDayControl",
    icon: "fa-solid fa-sun",
    order: 99,
    button: true,
    visible: true,
    onChange: () => newDayForAll()
  };
  // v13+ : objet indexé par nom ; versions plus anciennes : tableau.
  if (Array.isArray(controls)) {
    const tokens = controls.find(c => c.name === "token" || c.name === "tokens");
    tokens?.tools.push({ ...tool, onClick: tool.onChange });
  } else {
    const tokens = controls.tokens ?? controls.token;
    if (tokens?.tools) tokens.tools[tool.name] = tool;
  }
}
