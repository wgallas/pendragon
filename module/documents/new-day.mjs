import { SYSTEM_ID } from "../config.mjs";

/**
 * « Nouveau jour » du MJ : chaque passion peut de nouveau être invoquée
 * et les inspirations en cours prennent fin, pour tous les chevaliers
 * (acteurs du monde comme jetons non liés), en avançant le jour du monde.
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
  // Avancer le jour du monde suffit : les invocations notées un autre jour ne comptent plus.
  try {
    const day = (Number(game.settings.get(SYSTEM_ID, "currentDay")) || 1) + 1;
    await game.settings.set(SYSTEM_ID, "currentDay", day);
    console.log(`${SYSTEM_ID} | Nouveau jour : jour ${day}`);
  } catch (err) {
    console.error(`${SYSTEM_ID} | Nouveau jour impossible`, err);
    return ui.notifications.error(`${L("PDVF.Invoke.NewDay")} : ${err.message}`);
  }
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
    onChange: (event) => { console.log(`${SYSTEM_ID} | Outil Nouveau jour`); newDayForAll(); }
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

/**
 * Bouton du MJ en haut de l'onglet Acteurs, toujours accessible
 * (les outils de la barre de gauche ne répondent pas sans scène active).
 */
export function addNewDayDirectoryButton(app, html) {
  if (!game.user.isGM) return;
  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root || root.querySelector(".pdvf-newday-dir")) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "pdvf-newday-dir";
  button.innerHTML = `<i class="fa-solid fa-sun" aria-hidden="true"></i> ${game.i18n.localize("PDVF.Invoke.NewDay")}`;
  button.dataset.tooltip = game.i18n.localize("PDVF.Invoke.NewDayControl");
  button.addEventListener("click", (event) => { event.preventDefault(); newDayForAll(); });
  const actions = root.querySelector(".header-actions") ?? root.querySelector(".directory-header") ?? root;
  actions.append(button);
}
