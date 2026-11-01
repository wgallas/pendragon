import { PDVF, SYSTEM_ID } from "../config.mjs";
import * as R from "../rules/domains.mjs";
import { transferDomain, returnDomain, checkLabel, payFromTreasury, rollTable } from "../documents/domains.mjs";
import { periodAvailable } from "../documents/period.mjs";

const { HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;
const L = (k) => game.i18n.localize(k);
const F = (k, d) => game.i18n.format(k, d);
const has = (k) => game.i18n.has(k);
const M = () => PDVF.manor;
const num = (v) => String(v).replace(".", ",");

/** Listes de la fiche (champs tableau du domaine). */
const LISTS = ["ledger", "investments", "enhancements", "improvements", "features", "defenses", "professionals", "soldiers"];
/** Table des types de chaque liste et préfixe des libellés. */
const LIST_DEFS = {
  investments: { table: () => M().investments, label: "PDVF.Manor.Investment" },
  enhancements: { table: () => M().enhancements, label: "PDVF.Manor.Enhancement" },
  improvements: { table: () => M().improvements.filter((x, i, a) => a.findIndex(y => y.id === x.id) === i), label: "PDVF.Manor.Improvement" },
  features: { table: () => M().features, label: "PDVF.Manor.Feature" },
  defenses: { table: () => M().defenses, label: "PDVF.Manor.Defense" },
  professionals: { table: () => M().professionals, label: "PDVF.Manor.Professional" },
  soldiers: { table: () => Object.keys(M().soldiers).map(id => ({ id })), label: "PDVF.Manor.Soldier" }
};

const TABS = ["estate", "works", "people", "ledger"];

/** Fiche d'un domaine (Livre des Nobles, chap. 3). */
export class DomaineSheet extends HandlebarsApplicationMixin(ItemSheetV2) {

  static DEFAULT_OPTIONS = {
    classes: [SYSTEM_ID, "pdvf-sheet", "pdvf-gear-sheet", "pdvf-domain-sheet"],
    position: { width: 820, height: 820 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      typical: DomaineSheet.#onTypical,
      addLedger: DomaineSheet.#onAddLedger,
      addRow: DomaineSheet.#onAddRow,
      rollRow: DomaineSheet.#onRollRow,
      deleteRow: DomaineSheet.#onDeleteRow,
      fund: DomaineSheet.#onFund,
      build: DomaineSheet.#onBuild,
      repair: DomaineSheet.#onRepair,
      hire: DomaineSheet.#onHire,
      rollImprovements: DomaineSheet.#onRollImprovements,
      transfer: DomaineSheet.#onTransfer,
      giveBack: DomaineSheet.#onGiveBack
    }
  };

  static PARTS = {
    sheet: { template: `systems/${SYSTEM_ID}/templates/item/domaine/sheet.hbs`, scrollable: [".pdvf-gear-body"] }
  };

  tabGroups = { domain: "estate" };

  get title() { return this.document.name; }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const item = this.document;
    const s = item.system;
    const m = M();
    const info = R.rankInfo(s.rank, PDVF.domainRanks);
    const active = this.tabGroups.domain ?? "estate";
    const year = Number(game.settings.get(SYSTEM_ID, "currentYear")) || 0;
    const choicesFor = (list, selected) => {
      const def = LIST_DEFS[list];
      return def.table().map(x => ({ value: x.id, label: L(`${def.label}.${x.id}`), selected: x.id === selected }));
    };
    const note = (prefix, id) => (has(`${prefix}.${id}`) ? L(`${prefix}.${id}`) : "");
    const checks = (list) => list.map(R.checkKey).map(checkLabel).join(" · ");

    const investments = s.investments.map((r, index) => {
      const def = m.investments.find(x => x.id === r.type);
      const built = r.paid >= r.cost;
      const choose = def?.id === "chace" ? def.check.map(R.checkKey) : null;
      return {
        ...r, index, choices: choicesFor("investments", r.type), built, left: num(Math.max(0, r.cost - r.paid)),
        note: note("PDVF.Manor.InvestmentNote", r.type), fundedNow: r.lastFunded === year,
        checkChoices: choose?.map(k => ({ value: k, label: checkLabel(k), selected: (r.check || choose[0]) === k })),
        checkText: !choose && def?.check ? checks(def.check) : "", repairCost: num(r.cost / 2)
      };
    });
    const enhancements = s.enhancements.map((r, index) => {
      const def = m.enhancements.find(x => x.id === r.type);
      const built = r.paid >= r.cost;
      const choose = def?.choose?.map(k => `trait.${k}`);
      return {
        ...r, index, choices: choicesFor("enhancements", r.type), built, note: note("PDVF.Manor.EnhancementNote", r.type),
        checkChoices: choose?.map(k => ({ value: k, label: checkLabel(k), selected: r.check === k })),
        checkText: !choose ? checks(def?.check ?? []) : "", repairCost: m.enhancementRepair,
        active: built && R.enhancementActive(r, year, m)
      };
    });
    const improvements = s.improvements.map((r, index) => {
      const def = m.improvements.find(x => x.id === r.type);
      return { ...r, index, choices: choicesFor("improvements", r.type), period: def?.period ? L(`PDVF.Manor.PeriodReq.${def.period}`) : "" };
    });
    const features = s.features.map((r, index) => {
      const def = m.features.find(x => x.id === r.type);
      return { ...r, index, choices: choicesFor("features", r.type), note: note("PDVF.Manor.FeatureNote", r.type) || (def && !def.privy && !def.bonusFor ? L("PDVF.Manor.FeatureNote.gm") : "") };
    });
    const defenses = s.defenses.map((r, index) => {
      const def = m.defenses.find(x => x.id === r.type);
      return { ...r, index, choices: choicesFor("defenses", r.type), dv: def?.dv ?? 0, cost: def?.cost ?? 0 };
    });
    const professionals = s.professionals.map((r, index) => {
      const def = m.professionals.find(x => x.id === r.type);
      return { ...r, index, choices: choicesFor("professionals", r.type), keySkill: def?.skill ? L(`PDVF.Skill.${def.skill}`) : "", pay: num(R.professionalPay(r, m)) };
    });
    const soldiers = s.soldiers.map((r, index) => ({ ...r, index, choices: choicesFor("soldiers", r.type), pay: num((m.soldiers[r.type] ?? 0) * r.count) }));
    const dv = R.defensiveValue(s, m);
    const due = R.mesnieDue(s.income, m);

    return Object.assign(context, {
      item, system: s, editable: this.isEditable,
      holder: item.parent?.type === "chevalier" ? item.parent : null,
      tabs: TABS.map(id => ({ id, label: L(`PDVF.Domain.Tab.${id}`), active: id === active, cssClass: id === active ? "active" : "" })),
      tab: Object.fromEntries(TABS.map(id => [id, id === active ? "active" : ""])),
      rankChoices: Object.entries(PDVF.domainRanks).map(([id, r]) => ({ value: id, label: `${L(`PDVF.Domain.Rank.${id}`)} — ${r.income} £`, selected: id === s.rank })),
      tenureChoices: ["fief", "gift"].map(id => ({ value: id, label: L(`PDVF.Domain.Tenure.${id}`), selected: id === s.tenure })),
      rankLabel: L(`PDVF.Domain.Rank.${s.rank}`),
      tenureLabel: L(`PDVF.Domain.Tenure.${s.tenure}`),
      typical: F("PDVF.Domain.TypicalLine", {
        income: info.income, min: info.range[0], max: info.range[1], upkeep: info.upkeep,
        living: L(`PDVF.Living.${info.living}`), passive: info.passive,
        title: L(`PDVF.Domain.Title.${info.title}`), glory: PDVF.titleGlory[info.title] ?? 0
      }),
      favorValue: R.landFavor(s.income, s.tenure),
      ledger: s.ledger.map((l, i) => ({ ...l, index: i })).reverse(),
      isFief: s.tenure === "fief",
      investments, enhancements, improvements, features, defenses, professionals, soldiers,
      worksPrivy: R.improvementsPrivy(s, m),
      enhUpkeep: R.enhancementUpkeep(s, m),
      staffCost: num(R.staffCost(s, m)),
      improvementRolls: R.improvementRolls(s.income, m),
      dv, dvWarning: dv > m.dvWarning,
      mesnieDue: F("PDVF.Manor.MesnieDue", due),
      entourageGlory: R.entourageGlory(s.professionals, m),
      hireChoices: choicesFor("professionals", "steward"),
      investCost: m.investmentCost
    });
  }

  _processFormData(event, form, formData) {
    const data = super._processFormData(event, form, formData);
    for (const list of LISTS) {
      const path = `system.${list}`;
      const incoming = foundry.utils.getProperty(data, path);
      if (!incoming || Array.isArray(incoming)) continue;
      const rows = foundry.utils.deepClone(this.document._source.system[list] ?? []);
      for (const [i, row] of Object.entries(incoming)) if (rows[Number(i)]) rows[Number(i)] = { ...rows[Number(i)], ...row };
      foundry.utils.setProperty(data, path, rows);
    }
    return data;
  }

  #rows(list) {
    return foundry.utils.deepClone(this.document._source.system[list] ?? []);
  }

  #setRows(list, rows) {
    return this.document.update({ [`system.${list}`]: rows });
  }

  #year() {
    return Number(game.settings.get(SYSTEM_ID, "currentYear")) || null;
  }

  /** Revenu et Gloire passive typiques du rang (Table A.2). */
  static #onTypical() {
    const info = R.rankInfo(this.document.system.rank, PDVF.domainRanks);
    return this.document.update({ "system.income": info.income, "system.passiveGlory": info.passive });
  }

  static #onAddLedger() {
    const rows = this.#rows("ledger");
    rows.push({ year: this.#year(), income: 0, note: "" });
    return this.#setRows("ledger", rows);
  }

  /** Nouvelle ligne d'une liste, du premier type de sa table. */
  static #onAddRow(event, target) {
    const list = target.dataset.list;
    const def = LIST_DEFS[list];
    if (!def) return;
    const rows = this.#rows(list);
    const type = list === "professionals" ? (this.element.querySelector("[data-hire-type]")?.value ?? "steward") : def.table()[0].id;
    rows.push(list === "soldiers" ? { type, count: 1 } : { type, name: "" });
    return this.#setRows(list, rows);
  }

  /** Nouvelle ligne tirée au hasard sur la table (1D20). */
  static async #onRollRow(event, target) {
    const list = target.dataset.list;
    const entry = await rollTable(this.document, list);
    if (!entry || entry.id === "nothing") return;
    const rows = this.#rows(list);
    const row = { type: entry.id, name: "" };
    if (list === "improvements") row.pending = !!entry.period && !periodAvailable(entry.period);
    rows.push(row);
    return this.#setRows(list, rows);
  }

  static #onDeleteRow(event, target) {
    const list = target.dataset.list;
    const rows = this.#rows(list);
    rows.splice(Number(target.dataset.index), 1);
    return this.#setRows(list, rows);
  }

  /** Verse une somme sur un investissement (au moins 1 £, un seul investissement par an). */
  static async #onFund(event, target) {
    const domain = this.document;
    const holder = domain.parent;
    if (holder?.type !== "chevalier") return ui.notifications.warn(L("PDVF.Manor.NoHolder"));
    const index = Number(target.dataset.index);
    const inv = domain.system.investments[index];
    const year = this.#year();
    const other = holder.items.filter(i => i.type === "domaine").flatMap(d => d.system.investments.map((x, j) => ({ x, d, j })))
      .find(({ x, d, j }) => x.lastFunded === year && year != null && !(d.id === domain.id && j === index));
    if (other) return ui.notifications.warn(F("PDVF.Manor.AlreadyFunded", { name: other.x.name || L(`PDVF.Manor.Investment.${other.x.type}`) }));
    const name = inv.name || L(`PDVF.Manor.Investment.${inv.type}`);
    const left = Math.max(0, inv.cost - inv.paid);
    const r = await DialogV2.wait({
      window: { title: F("PDVF.Manor.FundTitle", { name }) }, classes: [SYSTEM_ID, "pdvf-dialog"], rejectClose: false,
      content: `<div class="form-group"><label>${L("PDVF.Manor.FundAmount")}</label><input type="number" name="amount" value="${left}" min="1" max="${left}" step="1"></div>
        <p class="pdvf-hint">${L("PDVF.Manor.FundHint")}</p>`,
      buttons: [{ action: "ok", label: L("PDVF.Manor.Fund"), default: true, callback: (e, b) => new foundry.applications.ux.FormDataExtended(b.form).object },
        { action: "cancel", label: L("PDVF.Dialog.Cancel") }]
    });
    if (!r || r === "cancel") return;
    const amount = R.fundAmount(inv, Math.max(1, Number(r.amount) || 0), M());
    if (!amount) return;
    if (!(await payFromTreasury(holder, amount))) return;
    const rows = this.#rows("investments");
    rows[index].paid = (Number(rows[index].paid) || 0) + amount;
    rows[index].lastFunded = year;
    await this.#setRows("investments", rows);
    const lines = [F("PDVF.Manor.Paid1", { name, pounds: amount, paid: rows[index].paid, cost: rows[index].cost })];
    if (rows[index].paid >= rows[index].cost) lines.push(F("PDVF.Manor.Completed", { name }));
    ChatMessage.implementation.create({ speaker: ChatMessage.getSpeaker({ actor: holder }), content: `<div class="pdvf-card"><header class="pdvf-card-header"><h3 class="pdvf-card-title">${domain.name}</h3></header><ul class="pdvf-card-notes">${lines.map(l => `<li>${l}</li>`).join("")}</ul></div>` });
  }

  /** Bâtit un embellissement : le reste du coût est payé d'un coup. */
  static async #onBuild(event, target) {
    const holder = this.document.parent;
    if (holder?.type !== "chevalier") return ui.notifications.warn(L("PDVF.Manor.NoHolder"));
    const index = Number(target.dataset.index);
    const rows = this.#rows("enhancements");
    const left = Math.max(0, rows[index].cost - rows[index].paid);
    if (left && !(await payFromTreasury(holder, left))) return;
    rows[index].paid = rows[index].cost;
    rows[index].lastPaid = this.#year();
    return this.#setRows("enhancements", rows);
  }

  /** Répare un investissement détruit (moitié du coût) ou un embellissement en ruine (5 £). */
  static async #onRepair(event, target) {
    const holder = this.document.parent;
    if (holder?.type !== "chevalier") return ui.notifications.warn(L("PDVF.Manor.NoHolder"));
    const list = target.dataset.list;
    const index = Number(target.dataset.index);
    const rows = this.#rows(list);
    const cost = list === "investments" ? rows[index].cost / 2 : M().enhancementRepair;
    if (!(await payFromTreasury(holder, cost))) return;
    if (list === "investments") rows[index].destroyed = false;
    else { rows[index].ruined = false; rows[index].lastPaid = this.#year(); }
    return this.#setRows(list, rows);
  }

  /** Embauche un professionnel : compétence clé 2D6+5, lancée une seule fois. */
  static async #onHire() {
    const type = this.element.querySelector("[data-hire-type]")?.value ?? "steward";
    const roll = await new Roll(M().professionalSkill).evaluate();
    const label = L(`PDVF.Manor.Professional.${type}`);
    await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this.document.parent ?? undefined }), flavor: F("PDVF.Manor.Hired", { name: label, skill: roll.total }) });
    const rows = this.#rows("professionals");
    rows.push({ type, name: "", skill: roll.total, cost: null, entourage: false });
    return this.#setRows("professionals", rows);
  }

  /** Améliorations du manoir : un jet par tranche de 5 £ de rente (Table 3.4). */
  static async #onRollImprovements() {
    const n = R.improvementRolls(this.document.system.income, M());
    const rows = this.#rows("improvements");
    for (let i = 0; i < n; i++) {
      const entry = await rollTable(this.document, "improvements");
      if (entry && entry.id !== "nothing") rows.push({ type: entry.id, name: "", pending: !!entry.period && !periodAvailable(entry.period) });
    }
    return this.#setRows("improvements", rows);
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
