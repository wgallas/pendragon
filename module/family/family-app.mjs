import { SYSTEM_ID } from "../config.mjs";
import { generateFamily } from "./generator.mjs";
import { familyView } from "./view.mjs";
import { applyFamilyHistory, getFamilyHistory } from "./apply.mjs";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

/**
 * Fenêtre de l'historique familial : trois propositions tirées au hasard,
 * que l'on peut relancer une à une avant d'en choisir une.
 */
export class FamilyHistoryApp extends HandlebarsApplicationMixin(ApplicationV2) {

  constructor(actor, options = {}) {
    super(options);
    this.actor = actor;
    this.proposals = [generateFamily(), generateFamily(), generateFamily()];
  }

  static DEFAULT_OPTIONS = {
    classes: [SYSTEM_ID, "pdvf-family-app"],
    window: { title: "PDVF.FamilyApp.Title", resizable: true, icon: "fa-solid fa-scroll" },
    position: { width: 1200, height: 820 },
    actions: {
      reroll: FamilyHistoryApp.#onReroll,
      rerollAll: FamilyHistoryApp.#onRerollAll,
      choose: FamilyHistoryApp.#onChoose
    }
  };

  static PARTS = {
    main: { template: `systems/${SYSTEM_ID}/templates/family/proposals.hbs`, scrollable: [".pdvf-proposals"] }
  };

  get title() {
    return game.i18n.format("PDVF.FamilyApp.TitleFor", { name: this.actor.name });
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.proposals = this.proposals.map((r, i) => familyView(r, i));
    context.hasHistory = !!getFamilyHistory(this.actor);
    return context;
  }

  static #onReroll(event, target) {
    const i = Number(target.dataset.index);
    this.proposals[i] = generateFamily();
    this.render({ parts: ["main"] });
  }

  static #onRerollAll() {
    this.proposals = this.proposals.map(() => generateFamily());
    this.render({ parts: ["main"] });
  }

  static async #onChoose(event, target) {
    const i = Number(target.dataset.index);
    const result = this.proposals[i];
    const column = this.element.querySelector(`[data-proposal="${i}"]`);
    const checked = (kind) => [...column.querySelectorAll(`input[data-kind="${kind}"]:checked`)].map(el => el.value);
    const selection = { passions: checked("passion"), traits: checked("trait") };

    if (getFamilyHistory(this.actor)) {
      const ok = await DialogV2.confirm({
        window: { title: game.i18n.localize("PDVF.FamilyApp.ReplaceTitle") },
        content: `<p>${game.i18n.localize("PDVF.FamilyApp.ReplaceText")}</p>`,
        rejectClose: false
      });
      if (!ok) return;
    }
    await applyFamilyHistory(this.actor, result, selection);
    ui.notifications.info(game.i18n.format("PDVF.FamilyApp.Applied", { name: this.actor.name }));
    this.close();
  }
}
