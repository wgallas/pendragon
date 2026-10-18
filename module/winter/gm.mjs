/**
 * Phase d'hiver côté MJ : ouverture de l'hiver (l'assistant s'ouvre chez chaque joueur),
 * tableau de suivi, clôture (l'année de jeu avance : chevaliers, écuyers et chevaux vieillissent).
 */
import { SYSTEM_ID } from "../config.mjs";
import * as E from "./engine.mjs";
import { openWinterWizard, WinterWizard } from "./wizard.mjs";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;
const L = (k) => game.i18n.localize(k);
const F = (k, d) => game.i18n.format(k, d);

/** Chevaliers concernés : tous les chevaliers en vie (ceux des joueurs d'abord). */
function playerKnights() {
  return game.actors.filter(a => a.type === "chevalier" && !a.system.dates?.died)
    .sort((a, b) => (b.hasPlayerOwner - a.hasPlayerOwner) || a.name.localeCompare(b.name, "fr"));
}

export class WinterPanel extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "pdvf-winter-panel",
    classes: [SYSTEM_ID, "pdvf-sheet", "pdvf-winter-panel"],
    window: { title: "PDVF.Winter.PanelTitle", resizable: true, icon: "fa-solid fa-snowflake" },
    position: { width: 760, height: 560 },
    actions: {
      start: WinterPanel.#onStart,
      remind: WinterPanel.#onRemind,
      closeWinter: WinterPanel.#onCloseWinter,
      open: WinterPanel.#onOpen
    }
  };

  static PARTS = { body: { template: `systems/${SYSTEM_ID}/templates/winter/panel.hbs`, scrollable: [".pdvf-battle-body"] } };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const year = E.winterYear();
    const current = game.settings.get(SYSTEM_ID, "currentYear");
    const knights = playerKnights().map(a => {
      const st = year ? E.getState(a, year) : null;
      const owners = game.users.filter(u => !u.isGM && a.testUserPermission(u, "OWNER")).map(u => u.name).join(", ") || L("PDVF.Winter.GmOnly");
      return { id: a.id, uuid: a.uuid, name: a.name, img: a.img, owners,
        stepLabel: st ? L(`PDVF.Winter.Step.${E.STEPS[st.step]}`) : "", stepNumber: st ? st.step + 1 : 0, finished: !!st?.finished };
    });
    return Object.assign(context, {
      year, current, active: !!year, knights, total: knights.length, finishedCount: knights.filter(k => k.finished).length
    });
  }

  static async #onStart() {
    await startWinter();
    this.render();
  }

  static #onRemind() {
    broadcastOpen();
    ui.notifications.info(L("PDVF.Winter.Notify.Reminded"));
  }

  static async #onCloseWinter() {
    await closeWinter();
    this.render();
  }

  static #onOpen(event, target) {
    const a = game.actors.get(target.dataset.id);
    if (a) openWinterWizard(a);
  }
}

export function openWinterPanel() {
  const existing = foundry.applications.instances?.get?.("pdvf-winter-panel");
  if (existing) { existing.render({ force: true }); existing.bringToFront?.(); return existing; }
  const p = new WinterPanel();
  p.render({ force: true });
  return p;
}

/** Ouvre l'hiver de l'année en cours. */
export async function startWinter() {
  if (!game.user.isGM) return;
  const year = Number(game.settings.get(SYSTEM_ID, "currentYear"));
  await game.settings.set(SYSTEM_ID, "winterYear", year);
  await ChatMessage.implementation.create({
    content: `<div class="pdvf-card"><div class="pdvf-verdict victory"><i class="fa-solid fa-snowflake" aria-hidden="true"></i> ${F("PDVF.Winter.StartChat", { year })}</div></div>`,
    speaker: { alias: L("PDVF.Winter.Title") }
  });
  broadcastOpen();
}

/** Demande aux joueurs d'ouvrir l'assistant de leurs chevaliers. */
export function broadcastOpen() {
  game.socket.emit(E.SOCKET, { type: "winterOpen" });
}

/** Clôt l'hiver : l'année avance d'un an, un nouveau jour commence. */
export async function closeWinter() {
  if (!game.user.isGM) return;
  const year = E.winterYear();
  if (!year) return;
  const unfinished = playerKnights().filter(a => !E.getState(a, year).finished).map(a => a.name);
  const ok = await DialogV2.confirm({
    window: { title: L("PDVF.Winter.CloseTitle") }, classes: [SYSTEM_ID, "pdvf-dialog"],
    content: `<p>${F("PDVF.Winter.CloseConfirm", { year, next: year + 1 })}</p>${unfinished.length ? `<p class="pdvf-warn">${F("PDVF.Winter.CloseUnfinished", { names: unfinished.join(", ") })}</p>` : ""}`
  });
  if (!ok) return;
  await game.settings.set(SYSTEM_ID, "currentYear", year + 1);
  await game.settings.set(SYSTEM_ID, "winterYear", 0);
  await game.settings.set(SYSTEM_ID, "currentDay", (Number(game.settings.get(SYSTEM_ID, "currentDay")) || 1) + 1);
  for (const app of foundry.applications.instances?.values?.() ?? []) if (app instanceof WinterWizard) app.close();
  await ChatMessage.implementation.create({
    content: `<div class="pdvf-card"><div class="pdvf-verdict victory"><i class="fa-solid fa-seedling" aria-hidden="true"></i> ${F("PDVF.Winter.CloseChat", { year, next: year + 1 })}</div></div>`,
    speaker: { alias: L("PDVF.Winter.Title") }
  });
}

/** Messages du socket propres à l'hiver. */
export function onWinterSocket(data) {
  if (data?.type === "winterOpen") return openOwnWizards();
  if (data?.type === "winterUpdate") return E.onWinterUpdate(data);
}

/** Côté joueur : ouvre l'assistant de chacun de ses chevaliers qui n'a pas fini. */
export function openOwnWizards() {
  const year = E.winterYear();
  if (!year || game.user.isGM) return;
  for (const a of game.actors.filter(x => x.type === "chevalier" && x.isOwner && !x.system.dates?.died)) {
    if (!E.getState(a, year).finished) openWinterWizard(a);
  }
}

/** Bouton « Phase d'hiver » du MJ en haut de l'onglet Acteurs. */
export function addWinterDirectoryButton(app, html) {
  if (!game.user.isGM) return;
  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root || root.querySelector(".pdvf-winter-dir")) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "pdvf-newday-dir pdvf-winter-dir";
  button.innerHTML = `<i class="fa-solid fa-snowflake" aria-hidden="true"></i> ${L("PDVF.Winter.Title")}`;
  button.dataset.tooltip = L("PDVF.Winter.DirectoryTip");
  button.addEventListener("click", (event) => { event.preventDefault(); openWinterPanel(); });
  const actions = root.querySelector(".header-actions") ?? root.querySelector(".directory-header") ?? root;
  actions.append(button);
}

/** Rafraîchit le tableau de suivi quand un chevalier avance ; prévient le MJ quand un hiver est terminé. */
export function refreshPanel(actor, changes) {
  if (actor.type !== "chevalier") return;
  foundry.applications.instances?.get?.("pdvf-winter-panel")?.render();
  const w = changes?.flags?.[SYSTEM_ID]?.winter;
  if (game.user.isGM && w?.finished === true && w.year === E.winterYear()) {
    ui.notifications.info(F("PDVF.Winter.FinishedLine", { name: actor.name }));
  }
}
