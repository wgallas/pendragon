import { PDVF, SYSTEM_ID } from "../config.mjs";
import { formatValue } from "../rules/resolution.mjs";
import { rollAttribute, promptTestOptions, rollDamage, signed } from "../dice/tests.mjs";
import { convertNpcToKnight } from "../documents/followers.mjs";
import { engage } from "../combat/exchange.mjs";
import * as CD from "../combat/dialogs.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

const L = (k) => game.i18n.localize(k);
const ARRAY_PATHS = ["system.attacks", "system.skills", "system.traits", "system.passions"];
/** Champs vides autorisés (valeur calculée, ou absente). */
const NULLABLE = ["system.overrides.hp", "system.overrides.knockdown", "system.overrides.majorWound", "system.overrides.unconscious",
  "system.overrides.move", "system.overrides.healRate", "system.honor", "system.valorousMod", "system.squire.born"];

/**
 * Fiche de PNJ (écuyer, suivant, personnage, créature), sur le modèle des blocs du Livre du maître.
 */
export class PnjSheet extends HandlebarsApplicationMixin(ActorSheetV2) {

  _editMode = false;

  static DEFAULT_OPTIONS = {
    classes: [SYSTEM_ID, "pdvf-sheet", "pdvf-npc-sheet"],
    position: { width: 820, height: 860 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      toggleEdit: PnjSheet.#onToggleEdit,
      roll: PnjSheet.#onRoll,
      damage: PnjSheet.#onDamage,
      addRow: PnjSheet.#onAddRow,
      deleteRow: PnjSheet.#onDeleteRow,
      step: PnjSheet.#onStep,
      editImage: PnjSheet.#onEditImage,
      convert: PnjSheet.#onConvert,
      openMaster: PnjSheet.#onOpenMaster,
      squireAge: PnjSheet.#onSquireAge,
      engage: PnjSheet.#onEngage,
      combatDamage: PnjSheet.#onCombatDamage,
      combatMount: PnjSheet.#onCombatMount,
      combatStand: PnjSheet.#onCombatStand,
      combatRearm: PnjSheet.#onCombatRearm,
      woundAid: PnjSheet.#onWoundAid,
      woundDelete: PnjSheet.#onWoundDelete
    }
  };

  static PARTS = {
    sheet: { template: `systems/${SYSTEM_ID}/templates/actor/pnj/sheet.hbs`, scrollable: [".pdvf-npc-body"] }
  };

  get title() {
    return this.document.name;
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.document;
    const s = actor.system;
    const editMode = this._editMode && this.isEditable;
    const hp = s.health.hp;
    const max = Math.max(1, hp.max);
    const isCreature = s.category === "creature";

    const masters = game.actors?.filter?.(a => a.type === "chevalier" && a.system.followers?.some(f => f.uuid === actor.uuid)) ?? [];

    Object.assign(context, {
      actor, system: s, editMode, isCreature,
      isSquire: s.category === "squire",
      categoryLabel: L(`PDVF.Npc.Category.${s.category}`),
      categoryChoices: PDVF.npcCategories.map(id => ({ value: id, label: L(`PDVF.Npc.Category.${id}`), selected: id === s.category })),
      masters: masters.map(a => ({ id: a.id, name: a.name })),
      hp: {
        value: hp.value, max: hp.max,
        pct: Math.max(0, Math.min(100, Math.round(100 * hp.value / max))),
        unconscious: s.derived.unconscious,
        unconsciousPct: Math.round(100 * s.derived.unconscious / max)
      },
      status: s.derived.status,
      statusLabel: L(`PDVF.Status.${s.derived.status}`),
      characteristics: PDVF.characteristics
        .filter(id => !(isCreature && id === "app" && !s.characteristics.app.value))
        .map(id => ({
          id, key: `char.${id}`, abbr: L(`PDVF.Char.${id}.abbr`), long: L(`PDVF.Char.${id}.long`),
          value: s.characteristics[id].value, name: `system.characteristics.${id}.value`
        })),
      health: [
        this.#derivedRow("hp", "PDVF.Health.hp", s),
        this.#derivedRow("knockdown", "PDVF.Derived.knockdown.label", s),
        this.#derivedRow("majorWound", "PDVF.Derived.majorWound.label", s),
        this.#derivedRow("unconscious", "PDVF.Derived.unconscious.label", s)
      ],
      other: [
        this.#derivedRow("move", "PDVF.Derived.move.label", s),
        this.#derivedRow("healRate", "PDVF.Derived.healRate.label", s)
      ],
      armorLabel: s.armor.shield ? `${s.armor.value}+${s.armor.shield}` : String(s.armor.value),
      damageLabel: s.derived.damage,
      attacks: s.attacks.map((a, index) => ({
        ...a, index, key: `attack.${index}`, display: formatValue(a.value),
        damageRollable: isRollableFormula(a.damage)
      })),
      skills: s.skills.map((r, index) => ({ ...r, index, key: `nskill.${index}`, display: formatValue(r.value) })),
      traits: s.traits.map((r, index) => ({ ...r, index, key: `ntrait.${index}`, display: formatValue(r.value) })),
      passions: s.passions.map((r, index) => ({ ...r, index, key: `passion.${index}`, display: formatValue(r.value) })),
      hasHonor: s.honor !== null,
      honorDisplay: s.honor === null ? "" : formatValue(s.honor),
      honorLevel: s.honorLevel ? L(`PDVF.Level.${s.honorLevel}`) : "",
      skillNames: Object.keys(PDVF.skills).map(id => L(`PDVF.Skill.${id}`)).sort((a, b) => a.localeCompare(b, "fr")),
      traitNames: PDVF.traits.flatMap(id => [L(`PDVF.Trait.${id}.left`), L(`PDVF.Trait.${id}.right`)]).sort((a, b) => a.localeCompare(b, "fr")),
      canConvert: !isCreature && actor.isOwner && game.user.can?.("ACTOR_CREATE") !== false
    });

    if (s.squireView) {
      const v = s.squireView;
      context.squire = {
        ...v,
        ageLabel: v.age === null ? "—" : game.i18n.format("PDVF.Sheet.Age", { age: v.age }),
        originChoices: PDVF.squireOrigins.map(o => ({
          value: o.id,
          label: `${L(`PDVF.Npc.SquireOrigin.${o.id}`)} (${o.range ? `${o.range[0]}–${o.range[1]}` : L("PDVF.Npc.GMChoice")}) : ${signed(o.squire)} / ${signed(o.knightly)}`,
          selected: o.id === v.origin.id
        })),
        otherChoices: Object.entries(PDVF.skills).filter(([id, c]) => c.group === "general")
          .map(([id]) => ({ value: id, label: L(`PDVF.Skill.${id}`), selected: id === s.squire.otherSkill }))
          .sort((a, b) => a.label.localeCompare(b.label, "fr")),
        knightlyRows: v.knightlyIds.map(id => ({ id, key: `squire.${id}`, label: L(`PDVF.Skill.${id}`), display: v.knightly === null ? "—" : formatValue(v.knightly) })),
        skillDisplay: formatValue(v.skill),
        originLabel: L(`PDVF.Npc.SquireOrigin.${v.origin.id}`)
      };
    }
    context.combat = CD.woundsView(actor);
    return context;
  }

  #derivedRow(id, labelKey, s) {
    const override = s.overrides[id];
    return {
      id, label: L(labelKey), value: s.derived[id], auto: s.derivedAuto[id],
      override, overridden: override !== null && override !== undefined, name: `system.overrides.${id}`
    };
  }

  _processFormData(event, form, formData) {
    const data = super._processFormData(event, form, formData);
    // Un champ numérique vidé : null pour les valeurs facultatives, 0 sinon.
    const flat = foundry.utils.flattenObject(data);
    for (const [k, v] of Object.entries(flat)) {
      if (v === null && !NULLABLE.includes(k) && k !== "img") foundry.utils.setProperty(data, k, 0);
    }
    for (const path of ARRAY_PATHS) {
      const incoming = foundry.utils.getProperty(data, path);
      if (!incoming || Array.isArray(incoming)) continue;
      const rows = foundry.utils.deepClone(foundry.utils.getProperty(this.document._source, path) ?? []);
      for (const [i, row] of Object.entries(incoming)) {
        if (!rows[Number(i)]) continue;
        rows[Number(i)] = foundry.utils.mergeObject(rows[Number(i)], row, { inplace: false });
      }
      foundry.utils.setProperty(data, path, rows);
    }
    return data;
  }

  /* -------------------------------------------- */
  /*  Actions                                      */
  /* -------------------------------------------- */

  static #onToggleEdit() {
    this._editMode = !this._editMode;
    this.render();
  }

  static async #onRoll(event, target) {
    const key = target.dataset.key;
    const rollable = this.document.getRollable(key);
    if (!rollable) return;
    let options = { modifier: 0 };
    if (event.shiftKey) {
      options = await promptTestOptions(this.document, rollable, 0);
      if (!options) return;
    }
    await rollAttribute(this.document, key, options);
  }

  static async #onDamage(event, target) {
    const a = this.document.system.attacks[Number(target.dataset.index)];
    if (!a) return;
    await rollDamage(this.document, a.damage, a.name || a.skill);
  }

  static async #onAddRow(event, target) {
    const path = target.dataset.path;
    const defaults = {
      "system.attacks": { name: "", skill: "", value: 10, damage: "" },
      "system.skills": { name: "", value: 10 },
      "system.traits": { name: "", value: 10 },
      "system.passions": { name: "", value: 10 }
    };
    if (!(path in defaults)) return;
    const rows = foundry.utils.deepClone(foundry.utils.getProperty(this.document._source, path) ?? []);
    rows.push(defaults[path]);
    await this.document.update({ [path]: rows });
  }

  static async #onDeleteRow(event, target) {
    const { path, index } = target.dataset;
    const rows = foundry.utils.deepClone(foundry.utils.getProperty(this.document._source, path) ?? []);
    rows.splice(Number(index), 1);
    await this.document.update({ [path]: rows });
  }

  static #onStep(event, target) {
    const input = target.closest(".pdvf-stepper")?.querySelector("input");
    if (!input) return;
    let value = (Number(input.value) || 0) + (Number(target.dataset.step) || 0);
    if (input.min !== "") value = Math.max(Number(input.min), value);
    input.value = value;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  static async #onEditImage() {
    if (!this.isEditable) return;
    const FP = foundry.applications.apps.FilePicker.implementation ?? foundry.applications.apps.FilePicker;
    return new FP({ type: "image", current: this.document.img, callback: (path) => this.document.update({ img: path }) }).browse();
  }

  static async #onConvert() {
    const knight = await convertNpcToKnight(this.document);
    knight?.sheet?.render(true);
  }

  /**
   * Âge de l'écuyer, + ou − 1 an : l'âge se déduit de l'année de naissance et de l'année de jeu,
   * on déplace donc l'année de naissance. (La phase d'hiver fera vieillir tout le monde en avançant l'année.)
   */
  static #onEngage(event, target) {
    const ref = target.dataset.index !== undefined ? `attack:${target.dataset.index}` : null;
    return engage(this.document, { weapon: ref, token: this.token ?? null });
  }
  static #onCombatDamage() { return CD.promptDamage(this.document); }
  static #onCombatMount() { return CD.toggleMounted(this.document); }
  static #onCombatStand() { return CD.standUp(this.document); }
  static #onCombatRearm() { return CD.rearm(this.document); }
  static #onWoundAid(event, target) { return CD.promptFirstAid(this.document, target.dataset.id); }
  static async #onWoundDelete(event, target) {
    const wounds = foundry.utils.deepClone(this.document._source.system.health.wounds ?? []);
    wounds.splice(Number(target.dataset.index), 1);
    await this.document.update({ "system.health.wounds": wounds });
  }

  static async #onSquireAge(event, target) {
    const step = Number(target.dataset.step) || 0;
    const year = Number(game.settings.get(SYSTEM_ID, "currentYear")) || 508;
    const born = this.document.system.squire.born ?? (year - 14);
    const age = Math.max(0, year - born + step);
    await this.document.update({ "system.squire.born": year - age });
  }

  static #onOpenMaster(event, target) {
    game.actors.get(target.dataset.id)?.sheet?.render(true);
  }
}

/** Une formule de dégâts lançable (« 5D6 », « 2D6+4 », « 4D6+2D6 », « 6 »). */
export function isRollableFormula(f) {
  return /^\s*\d*\s*[dD]?\s*\d+(\s*[+-]\s*\d*\s*[dD]?\s*\d+)*\s*$/.test(String(f ?? "")) && String(f).trim() !== "";
}
