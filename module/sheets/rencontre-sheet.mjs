import { PDVF, SYSTEM_ID } from "../config.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;
const L = (k) => game.i18n.localize(k);

const FLAGS = ["mounted", "counterCharge", "ranged", "noCharge", "forbidPrudent"];

/** Fiche d'une rencontre de bataille (opposant ou opportunité). */
export class RencontreSheet extends HandlebarsApplicationMixin(ItemSheetV2) {

  static DEFAULT_OPTIONS = {
    classes: [SYSTEM_ID, "pdvf-sheet", "pdvf-encounter-sheet"],
    position: { width: 760, height: 760 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      openNpc: RencontreSheet.#onOpenNpc,
      clearNpc: RencontreSheet.#onClearNpc
    }
  };

  static PARTS = {
    sheet: { template: `systems/${SYSTEM_ID}/templates/item/rencontre/sheet.hbs`, scrollable: [".pdvf-encounter-body"] }
  };

  get title() { return this.document.name; }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const s = this.document.system;
    let npc = null;
    try { npc = s.npc ? fromUuidSync(s.npc) : null; } catch (e) { npc = null; }
    return Object.assign(context, {
      item: this.document, system: s, editable: this.isEditable,
      kindChoices: ["opponent", "opportunity"].map(id => ({ value: id, label: L(`PDVF.Battle.Kind.${id}`), selected: id === s.kind })),
      flags: FLAGS.map(id => ({ id, label: L(`PDVF.Battle.Flag.${id}`), checked: s[id], name: `system.${id}` })),
      armies: Object.keys(PDVF.battle.armies).map(id => ({ id, label: L(`PDVF.Battle.Army.${id}`), checked: s.armies.includes(id) })),
      npcName: npc?.name ?? (s.npc ? L("PDVF.Battle.MissingActor") : ""),
      npcImg: npc?.img ?? ""
    });
  }

  async _onFirstRender(context, options) {
    await super._onFirstRender?.(context, options);
    this.element.addEventListener("dragover", (e) => e.preventDefault());
    this.element.addEventListener("drop", async (event) => {
      if (!this.isEditable) return;
      const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
      const doc = data?.uuid ? await fromUuid(data.uuid) : null;
      if (doc?.documentName !== "Actor" || doc.type !== "pnj") return;
      const update = { "system.npc": doc.uuid };
      if (!this.document.system.glory) update["system.glory"] = doc.system.gloryReward ?? 0;
      await this.document.update(update);
    });
  }

  _processFormData(event, form, formData) {
    const data = super._processFormData(event, form, formData);
    const armies = data.armies;
    delete data.armies;
    if (armies) foundry.utils.setProperty(data, "system.armies", Object.entries(armies).filter(([, v]) => v).map(([id]) => id));
    if (foundry.utils.getProperty(data, "system.fixedCount") === 0) foundry.utils.setProperty(data, "system.fixedCount", null);
    return data;
  }

  static #onOpenNpc() {
    const s = this.document.system;
    if (s.npc) fromUuid(s.npc).then(a => a?.sheet?.render(true));
  }

  static #onClearNpc() {
    return this.document.update({ "system.npc": "" });
  }
}
