import { PDVF, SYSTEM_ID } from "../config.mjs";
import { describeDamage, formatPrice } from "../rules/equipment.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;
const L = (k) => game.i18n.localize(k);
const choice = (ids, prefix, current) => ids.map(id => ({ value: id, label: L(`${prefix}.${id}`), selected: id === current }));

/** Fiche d'un objet d'équipement : arme, armure ou bouclier. */
export class EquipementSheet extends HandlebarsApplicationMixin(ItemSheetV2) {

  static DEFAULT_OPTIONS = {
    classes: [SYSTEM_ID, "pdvf-sheet", "pdvf-gear-sheet"],
    position: { width: 760, height: 760 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      addAlt: EquipementSheet.#onAddAlt,
      deleteAlt: EquipementSheet.#onDeleteAlt
    }
  };

  static PARTS = {
    sheet: { template: `systems/${SYSTEM_ID}/templates/item/equipement/sheet.hbs`, scrollable: [".pdvf-gear-body"] }
  };

  get title() { return this.document.name; }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const item = this.document;
    const s = item.system;
    const type = item.type;
    const skills = PDVF.weaponSkills.map(id => ({ value: id, label: L(`PDVF.Skill.${id}`), selected: id === s.skill }));
    Object.assign(context, {
      item, system: s, editable: this.isEditable, type,
      isWeapon: type === "arme", isArmor: type === "armure", isShield: type === "bouclier",
      typeLabel: L(`TYPES.Item.${type}`),
      priceLabel: formatPrice(s.price),
      periodChoices: Object.entries(PDVF.periods).map(([id, label]) => ({ value: id, label: L(label), selected: id === s.period })),
      periodLabel: L(PDVF.periods[s.period] ?? ""),
      owned: !!item.parent
    });
    if (type === "arme") {
      Object.assign(context, {
        groupChoices: choice(PDVF.weaponGroups, "PDVF.Gear.Group", s.group),
        skillChoices: skills,
        thrownSkillChoices: PDVF.weaponSkills.map(id => ({ value: id, label: L(`PDVF.Skill.${id}`), selected: id === s.thrown.skill })),
        useChoices: choice(["foot", "horse", "both"], "PDVF.Gear.Use", s.use),
        baseChoices: choice(PDVF.damageBases, "PDVF.Gear.Base", s.damage.base),
        thrownBaseChoices: choice(PDVF.damageBases, "PDVF.Gear.Base", s.thrown.damage.base),
        rangeChoices: [{ value: "", label: "—", selected: !s.range }, ...choice(PDVF.ranges, "PDVF.Gear.Range", s.range)],
        thrownRangeChoices: choice(PDVF.ranges, "PDVF.Gear.Range", s.thrown.range),
        damageLabel: describeDamage(s.damage, { quality: s.quality }),
        thrownLabel: s.thrown.enabled ? describeDamage(s.thrown.damage, { quality: s.quality }) : "",
        alts: s.alts.map((a, i) => ({ ...a, index: i,
          whenChoices: ["", "mail", "plate", "unarmored"].map(w => ({ value: w, label: L(`PDVF.Gear.When.${w || "manual"}`), selected: w === (a.when ?? "") })) })),
        skillLabel: L(`PDVF.Skill.${s.skill}`),
        useLabel: L(`PDVF.Gear.Use.${s.use}`),
        rangeLabel: s.range ? L(`PDVF.Gear.Range.${s.range}`) : ""
      });
    } else if (type === "armure") {
      Object.assign(context, {
        kindChoices: choice(PDVF.armorKinds, "PDVF.Gear.Kind", s.kind),
        materialChoices: choice(PDVF.armorMaterials, "PDVF.Gear.Material", s.material),
        kindLabel: L(`PDVF.Gear.Kind.${s.kind}`),
        materialLabel: L(`PDVF.Gear.Material.${s.material}`)
      });
    } else if (type === "bouclier") {
      Object.assign(context, {
        sizeChoices: choice(["small", "medium", "large"], "PDVF.Gear.Size", s.size),
        sizeLabel: L(`PDVF.Gear.Size.${s.size}`)
      });
    }
    return context;
  }

  _processFormData(event, form, formData) {
    const data = super._processFormData(event, form, formData);
    const alts = foundry.utils.getProperty(data, "system.alts");
    if (alts && !Array.isArray(alts)) foundry.utils.setProperty(data, "system.alts", Object.values(alts));
    const price = foundry.utils.getProperty(data, "system.price");
    if (price === "" || price === undefined) { if (foundry.utils.hasProperty(data, "system.price")) foundry.utils.setProperty(data, "system.price", null); }
    return data;
  }

  static #onAddAlt() {
    const alts = foundry.utils.deepClone(this.document._source.system.alts ?? []);
    alts.push({ label: "", dice: 1, when: "" });
    return this.document.update({ "system.alts": alts });
  }

  static #onDeleteAlt(event, target) {
    const alts = foundry.utils.deepClone(this.document._source.system.alts ?? []);
    alts.splice(Number(target.dataset.index), 1);
    return this.document.update({ "system.alts": alts });
  }
}
