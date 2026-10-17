import { PDVF } from "../config.mjs";
import { roundPendragon } from "../rules/resolution.mjs";

const fields = foundry.data.fields;
const int = (initial = 0, { min = undefined, nullable = false } = {}) =>
  new fields.NumberField({ required: true, nullable, integer: true, initial, min });

/**
 * Cheval (Livre du joueur, chap. 10). Les valeurs de départ viennent du type (Tables 10.2 à 10.4)
 * et restent modifiables : chaque cheval est un individu.
 */
export class ChevalData extends foundry.abstract.TypeDataModel {

  static defineSchema() {
    const characteristics = {};
    for (const id of ["siz", "dex", "str", "con"]) characteristics[id] = new fields.SchemaField({ value: int(10, { min: 0 }) });
    return {
      horseType: new fields.StringField({ initial: "roncin" }),
      sex: new fields.StringField({ initial: "gelding", choices: PDVF.horseSexes }),
      color: new fields.StringField({ initial: "bay" }),
      born: int(null, { nullable: true }),
      characteristics: new fields.SchemaField(characteristics),
      health: new fields.SchemaField({ hp: new fields.SchemaField({ value: int(40) }) }),
      move: int(16, { min: 0 }),
      naturalArmor: int(4, { min: 0 }),
      damage: new fields.StringField({ initial: "3D6" }),
      charge: new fields.StringField({ initial: "" }),
      warTrained: new fields.BooleanField({ initial: false }),
      barding: new fields.StringField({ initial: "none" }),
      tricks: new fields.ArrayField(new fields.StringField()),
      personality: new fields.ArrayField(new fields.StringField()),
      // État : affaibli (Table 14.7) et épuisé (Table 10.1, ne peut plus galoper)
      weakened: int(0, { min: 0 }),
      exhausted: new fields.BooleanField({ initial: false }),
      hpLoss: int(0, { min: 0 }),
      price: int(0, { min: 0 }),
      notes: new fields.StringField({ initial: "" })
    };
  }

  prepareDerivedData() {
    const c = Object.fromEntries(Object.entries(this.characteristics).map(([k, v]) => [k, Number(v.value) || 0]));
    const hp = Math.max(1, c.siz + c.con - (Number(this.hpLoss) || 0));
    const barding = PDVF.horseBarding[this.barding] ?? PDVF.horseBarding.none;
    this.derived = {
      hp,
      knockdown: c.siz,
      majorWound: c.con,
      unconscious: roundPendragon(hp / 4),
      healRate: roundPendragon(c.con / 5),
      move: Math.max(0, (Number(this.move) || 0) - 2 * (Number(this.weakened) || 0)),
      bardingArmor: barding.armor,
      bardingTooHeavy: c.str < barding.str,
      armor: (Number(this.naturalArmor) || 0) + barding.armor
    };
    this.health.hp.max = hp;
    const v = this.health.hp.value;
    this.derived.status = v <= 0 ? "dead" : v < this.derived.unconscious ? "unconscious" : v < hp ? "wounded" : "unhurt";
    const type = PDVF.horseTypes[this.horseType];
    this.typeGroup = type?.group ?? "riding";
    this.isWarHorse = this.warTrained;
    this.colorGlory = PDVF.horseColors[this.color]?.glory ?? 0;
    let year = null;
    try { year = Number(game.settings.get("pendragon-vf", "currentYear")) || null; } catch (err) { /* hors Foundry */ }
    this.age = this.born === null || year === null ? null : year - this.born;
  }
}
