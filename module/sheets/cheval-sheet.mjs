import { PDVF, SYSTEM_ID } from "../config.mjs";
import { rollAttribute, promptTestOptions, rollDamage, rollHorseExhaustion } from "../dice/tests.mjs";
import { horseFromType, horsePrice, formatDenarii } from "../rules/horses.mjs";
import { isRollableFormula } from "./pnj-sheet.mjs";
import { horseTypeLabel } from "../documents/followers.mjs";
import { periodAvailable } from "../documents/period.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;
const L = (k) => game.i18n.localize(k);
const F = (k, d) => game.i18n.format(k, d);
const NULLABLE = ["system.born"];

/** Fiche de cheval (Livre du joueur, chap. 10). */
export class ChevalSheet extends HandlebarsApplicationMixin(ActorSheetV2) {

  _editMode = false;

  static DEFAULT_OPTIONS = {
    classes: [SYSTEM_ID, "pdvf-sheet", "pdvf-npc-sheet", "pdvf-horse-sheet"],
    position: { width: 760, height: 820 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      toggleEdit: ChevalSheet.#onToggleEdit,
      roll: ChevalSheet.#onRoll,
      damage: ChevalSheet.#onDamage,
      exhaustion: ChevalSheet.#onExhaustion,
      step: ChevalSheet.#onStep,
      age: ChevalSheet.#onAge,
      applyType: ChevalSheet.#onApplyType,
      rollPersonality: ChevalSheet.#onRollPersonality,
      removePersonality: ChevalSheet.#onRemovePersonality,
      editImage: ChevalSheet.#onEditImage,
      openOwner: ChevalSheet.#onOpenOwner
    }
  };

  static PARTS = {
    sheet: { template: `systems/${SYSTEM_ID}/templates/actor/cheval/sheet.hbs`, scrollable: [".pdvf-npc-body"] }
  };

  get title() { return this.document.name; }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.document;
    const s = actor.system;
    const d = s.derived;
    const editMode = this._editMode && this.isEditable;
    const max = Math.max(1, s.health.hp.max);
    const owners = game.actors?.filter?.(a => a.type === "chevalier" && a.system.horses?.some(h => h.uuid === actor.uuid)) ?? [];
    const opt = (list, current, prefix) => list.map(id => ({ value: id, label: L(`${prefix}.${id}`), selected: id === current }));
    const groups = ["war", "riding", "work", "fae"].map(g => ({
      label: L(`PDVF.Horse.Group.${g}`),
      options: Object.entries(PDVF.horseTypes).filter(([, t]) => t.group === g)
        .map(([id]) => ({ value: id, label: horseTypeLabel(id), selected: id === s.horseType }))
    }));
    const type = PDVF.horseTypes[s.horseType];
    const price = horsePrice(s);

    Object.assign(context, {
      actor, system: s, editMode,
      typeLabel: L(`PDVF.Horse.Type.${s.horseType}`),
      typeGroups: groups,
      typeNote: type?.note ? L(`PDVF.Horse.Note.${type.note}`) : "",
      line: [
        L(`PDVF.Horse.Type.${s.horseType}`), L(`PDVF.Horse.Sex.${s.sex}`), L(`PDVF.Horse.Color.${s.color}`),
        s.age !== null ? F("PDVF.Sheet.Age", { age: s.age }) : "", s.warTrained ? L("PDVF.Horse.WarTrained") : ""
      ].filter(Boolean).join(" · "),
      owners: owners.map(a => ({ id: a.id, name: a.name })),
      hp: { value: s.health.hp.value, max: s.health.hp.max, pct: Math.max(0, Math.min(100, Math.round(100 * s.health.hp.value / max))),
        unconsciousPct: Math.round(100 * d.unconscious / max) },
      status: d.status, statusLabel: L(`PDVF.Status.${d.status}`),
      characteristics: ["siz", "dex", "str", "con"].map(id => ({
        id, key: `char.${id}`, abbr: L(`PDVF.Char.${id}.abbr`), long: L(`PDVF.Char.${id}.long`),
        value: s.characteristics[id].value, name: `system.characteristics.${id}.value`
      })),
      health: [
        { label: L("PDVF.Health.hp"), value: d.hp },
        { label: L("PDVF.Derived.knockdown.label"), value: d.knockdown },
        { label: L("PDVF.Derived.majorWound.label"), value: d.majorWound },
        { label: L("PDVF.Derived.unconscious.label"), value: d.unconscious },
        { label: L("PDVF.Derived.healRate.label"), value: d.healRate }
      ],
      gaits: [["walk", 1], ["trot", 2], ["gallop", 3], ["fullGallop", 6]].map(([id, m]) => ({
        label: L(`PDVF.Horse.Gait.${id}`), value: d.move * m, blocked: s.exhausted && m >= 3
      })),
      damageRollable: isRollableFormula(s.damage),
      chargeRollable: isRollableFormula(s.charge),
      sexChoices: opt(PDVF.horseSexes, s.sex, "PDVF.Horse.Sex"),
      colorChoices: Object.keys(PDVF.horseColors).map(id => ({
        value: id, selected: id === s.color,
        label: `${L(`PDVF.Horse.Color.${id}`)}${PDVF.horseColors[id].glory ? ` (${F("PDVF.Horse.GloryPerYear", { glory: PDVF.horseColors[id].glory })})` : ""}`
      })),
      colorGlory: s.colorGlory,
      bardingChoices: Object.entries(PDVF.horseBarding).map(([id, b]) => ({
        value: id, selected: id === s.barding,
        label: `${L(`PDVF.Horse.Barding.${id}`)}${b.armor ? ` (+${b.armor}${b.str ? `, ${L("PDVF.Char.str.abbr")} ${b.str}` : ""})` : ""}${b.period && !periodAvailable(b.period) ? ` — ${L(PDVF.periods[b.period])}` : ""}`
      })),
      bardingLabel: L(`PDVF.Horse.Barding.${s.barding}`),
      tricks: PDVF.horseTricks.map(id => ({ id, label: L(`PDVF.Horse.Trick.${id}`), checked: s.tricks.includes(id) })),
      knownTricks: s.tricks.map(id => L(`PDVF.Horse.Trick.${id}`)).join(", "),
      personality: s.personality.map((id, index) => ({ index, label: L(`PDVF.Horse.Personality.${id}.label`), tip: L(`PDVF.Horse.Personality.${id}.tip`) })),
      priceLabel: price === null ? L("PDVF.Horse.NotForSale") : formatDenarii(price),
      stallionHint: s.sex === "stallion" ? F("PDVF.Horse.StallionHint", { skill: PDVF.horseStallionSkill }) : ""
    });
    return context;
  }

  _processFormData(event, form, formData) {
    const data = super._processFormData(event, form, formData);
    const flat = foundry.utils.flattenObject(data);
    for (const [k, v] of Object.entries(flat)) if (v === null && !NULLABLE.includes(k) && k !== "img") foundry.utils.setProperty(data, k, 0);
    // Tours : cases à cocher → liste
    if (data.tricks) {
      foundry.utils.setProperty(data, "system.tricks", PDVF.horseTricks.filter(id => data.tricks[id]));
      delete data.tricks;
    }
    return data;
  }

  static #onToggleEdit() { this._editMode = !this._editMode; this.render(); }

  static async #onRoll(event, target) {
    const key = target.dataset.key;
    const rollable = this.document.getRollable(key);
    if (!rollable) return;
    let options = { modifier: 0 };
    if (event.shiftKey) { options = await promptTestOptions(this.document, rollable, 0); if (!options) return; }
    await rollAttribute(this.document, key, options);
  }

  static async #onDamage(event, target) {
    const which = target.dataset.which;
    const formula = which === "charge" ? this.document.system.charge : this.document.system.damage;
    await rollDamage(this.document, formula, L(which === "charge" ? "PDVF.Horse.ChargeDamage" : "PDVF.Horse.Damage"));
  }

  static async #onExhaustion() { await rollHorseExhaustion(this.document); }

  static #onStep(event, target) {
    const input = target.closest(".pdvf-stepper")?.querySelector("input");
    if (!input) return;
    let value = (Number(input.value) || 0) + (Number(target.dataset.step) || 0);
    if (input.min !== "") value = Math.max(Number(input.min), value);
    input.value = value;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  /** Âge + ou − 1 an (l'année de naissance suit ; l'âge suit ensuite l'année de jeu). */
  static async #onAge(event, target) {
    const step = Number(target.dataset.step) || 0;
    const year = Number(game.settings.get(SYSTEM_ID, "currentYear")) || 508;
    const born = this.document.system.born ?? (year - 6);
    await this.document.update({ "system.born": year - Math.max(0, year - born + step) });
  }

  /** Remet les valeurs du type choisi (Tables 10.2 à 10.4). */
  static async #onApplyType() {
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: L("PDVF.Horse.ApplyType") },
      classes: [SYSTEM_ID, "pdvf-dialog"],
      content: `<p>${F("PDVF.Horse.ApplyTypeConfirm", { type: L(`PDVF.Horse.Type.${this.document.system.horseType}`) })}</p>`,
      rejectClose: false
    });
    if (!ok) return;
    const data = horseFromType(this.document.system.horseType);
    await this.document.update({ system: { ...data, hpLoss: 0 } });
  }

  /** 1D3 traits de personnalité tirés sur la Table 10.5 (sans doublon). */
  static async #onRollPersonality() {
    const count = (await new Roll("1d3").evaluate()).total;
    const list = [...this.document.system.personality];
    const rolls = [];
    for (let i = 0; i < count; i++) {
      const r = (await new Roll("1d20").evaluate()).total;
      rolls.push(r);
      const id = PDVF.horsePersonality[r - 1];
      if (id && !list.includes(id)) list.push(id);
    }
    await this.document.update({ "system.personality": list });
    ui.notifications.info(F("PDVF.Horse.PersonalityRolled", { count, rolls: rolls.join(", ") }));
  }

  static async #onRemovePersonality(event, target) {
    const list = [...this.document.system.personality];
    list.splice(Number(target.dataset.index), 1);
    await this.document.update({ "system.personality": list });
  }

  static async #onEditImage() {
    if (!this.isEditable) return;
    const FP = foundry.applications.apps.FilePicker.implementation ?? foundry.applications.apps.FilePicker;
    return new FP({ type: "image", current: this.document.img, callback: (path) => this.document.update({ img: path }) }).browse();
  }

  static #onOpenOwner(event, target) { game.actors.get(target.dataset.id)?.sheet?.render(true); }
}
