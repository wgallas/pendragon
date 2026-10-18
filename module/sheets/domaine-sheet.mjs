import { PDVF, SYSTEM_ID } from "../config.mjs";
import { rankInfo, landFavor } from "../rules/domains.mjs";
import { transferDomain, returnDomain } from "../documents/domains.mjs";

const { HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;
const L = (k) => game.i18n.localize(k);
const F = (k, d) => game.i18n.format(k, d);

/** Fiche d'un domaine. */
export class DomaineSheet extends HandlebarsApplicationMixin(ItemSheetV2) {

  static DEFAULT_OPTIONS = {
    classes: [SYSTEM_ID, "pdvf-sheet", "pdvf-gear-sheet", "pdvf-domain-sheet"],
    position: { width: 760, height: 780 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      typical: DomaineSheet.#onTypical,
      addLedger: DomaineSheet.#onAddLedger,
      deleteLedger: DomaineSheet.#onDeleteLedger,
      transfer: DomaineSheet.#onTransfer,
      giveBack: DomaineSheet.#onGiveBack
    }
  };

  static PARTS = {
    sheet: { template: `systems/${SYSTEM_ID}/templates/item/domaine/sheet.hbs`, scrollable: [".pdvf-gear-body"] }
  };

  get title() { return this.document.name; }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const item = this.document;
    const s = item.system;
    const info = rankInfo(s.rank, PDVF.domainRanks);
    return Object.assign(context, {
      item, system: s, editable: this.isEditable,
      holder: item.parent?.type === "chevalier" ? item.parent : null,
      rankChoices: Object.entries(PDVF.domainRanks).map(([id, r]) => ({ value: id, label: `${L(`PDVF.Domain.Rank.${id}`)} — ${r.income} £`, selected: id === s.rank })),
      tenureChoices: ["fief", "gift"].map(id => ({ value: id, label: L(`PDVF.Domain.Tenure.${id}`), selected: id === s.tenure })),
      rankLabel: L(`PDVF.Domain.Rank.${s.rank}`),
      tenureLabel: L(`PDVF.Domain.Tenure.${s.tenure}`),
      typical: F("PDVF.Domain.TypicalLine", {
        income: info.income, min: info.range[0], max: info.range[1], upkeep: info.upkeep,
        living: L(`PDVF.Living.${info.living}`), passive: info.passive,
        title: L(`PDVF.Domain.Title.${info.title}`), glory: PDVF.titleGlory[info.title] ?? 0
      }),
      favorValue: landFavor(s.income, s.tenure),
      ledger: s.ledger.map((l, i) => ({ ...l, index: i })).reverse(),
      isFief: s.tenure === "fief"
    });
  }

  _processFormData(event, form, formData) {
    const data = super._processFormData(event, form, formData);
    const ledger = foundry.utils.getProperty(data, "system.ledger");
    if (ledger && !Array.isArray(ledger)) {
      const rows = foundry.utils.deepClone(this.document._source.system.ledger ?? []);
      for (const [i, row] of Object.entries(ledger)) rows[Number(i)] = { ...rows[Number(i)], ...row };
      foundry.utils.setProperty(data, "system.ledger", rows);
    }
    return data;
  }

  /** Revenu et Gloire passive typiques du rang (Table A.2). */
  static #onTypical() {
    const info = rankInfo(this.document.system.rank, PDVF.domainRanks);
    return this.document.update({ "system.income": info.income, "system.passiveGlory": info.passive });
  }

  static #onAddLedger() {
    const rows = foundry.utils.deepClone(this.document._source.system.ledger ?? []);
    rows.push({ year: Number(game.settings.get(SYSTEM_ID, "currentYear")) || null, income: this.document.system.income, note: "" });
    return this.document.update({ "system.ledger": rows });
  }

  static #onDeleteLedger(event, target) {
    const rows = foundry.utils.deepClone(this.document._source.system.ledger ?? []);
    rows.splice(Number(target.dataset.index), 1);
    return this.document.update({ "system.ledger": rows });
  }

  /** Fief : transmis à l'héritier (un autre chevalier). */
  static async #onTransfer() {
    const domain = this.document;
    const holder = domain.parent;
    if (!holder) return;
    const heirs = game.actors.filter(a => a.type === "chevalier" && a.id !== holder.id && a.isOwner);
    if (!heirs.length) return ui.notifications.warn(L("PDVF.Domain.NoHeir"));
    const r = await DialogV2.wait({
      window: { title: F("PDVF.Domain.TransferTitle", { name: domain.name }) }, classes: [SYSTEM_ID, "pdvf-dialog"], rejectClose: false,
      content: `<div class="form-group"><label>${L("PDVF.Domain.Heir")}</label><select name="heir">${heirs.map(a => `<option value="${a.id}">${a.name}</option>`).join("")}</select></div>
        <p class="pdvf-hint">${L("PDVF.Domain.TransferHint")}</p>`,
      buttons: [{ action: "ok", label: L("PDVF.Domain.Transfer"), default: true, callback: (e, b) => new foundry.applications.ux.FormDataExtended(b.form).object },
        { action: "cancel", label: L("PDVF.Dialog.Cancel") }]
    });
    if (!r || r === "cancel") return;
    const heir = game.actors.get(r.heir);
    await this.close();
    const created = await transferDomain(domain, heir);
    if (created) ui.notifications.info(F("PDVF.Domain.Transferred", { name: created.name, heir: heir.name }));
  }

  /** Don : retour au seigneur. */
  static async #onGiveBack() {
    const domain = this.document;
    const ok = await DialogV2.confirm({ window: { title: L("PDVF.Domain.GiveBack") }, content: `<p>${F("PDVF.Domain.GiveBackText", { name: domain.name })}</p>`, rejectClose: false });
    if (!ok) return;
    await this.close();
    await returnDomain(domain);
  }
}
