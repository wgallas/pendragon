import { PDVF } from "../config.mjs";
import { attributeLevel } from "../rules/resolution.mjs";
import { derivedValues, squireSkill, squireKnightly, squireOrigin } from "../rules/followers.mjs";

const fields = foundry.data.fields;

function int(initial = 0, { min = undefined, nullable = false } = {}) {
  return new fields.NumberField({ required: true, nullable, integer: true, initial, min });
}
const text = (initial = "") => new fields.StringField({ initial });
const row = (schema) => new fields.ArrayField(new fields.SchemaField(schema));

/**
 * PNJ : écuyer, suivant, personnage ou créature.
 * Présenté comme les blocs du Livre du maître : caractéristiques, santé, attaques,
 * puis seulement les traits, passions et compétences notables.
 */
export class PnjData extends foundry.abstract.TypeDataModel {

  static defineSchema() {
    const characteristics = {};
    for (const id of PDVF.characteristics) characteristics[id] = new fields.SchemaField({ value: int(10, { min: 0 }) });

    return {
      category: new fields.StringField({ initial: "character", choices: PDVF.npcCategories }),
      tagline: text(),
      characteristics: new fields.SchemaField(characteristics),
      health: new fields.SchemaField({
        hp: new fields.SchemaField({ value: int(20) })
      }),
      // Valeurs dérivées imposées (vide : calculées à partir des caractéristiques)
      overrides: new fields.SchemaField({
        hp: int(null, { nullable: true }),
        knockdown: int(null, { nullable: true }),
        majorWound: int(null, { nullable: true }),
        unconscious: int(null, { nullable: true }),
        move: int(null, { nullable: true }),
        healRate: int(null, { nullable: true })
      }),
      armor: new fields.SchemaField({
        value: int(0, { min: 0 }),
        shield: int(0, { min: 0 }),
        description: text()
      }),
      gloryReward: int(0),
      valorousMod: int(null, { nullable: true }),

      attacks: row({ name: text(), skill: text(), value: int(10), damage: text("") }),
      skills: row({ name: text(), value: int(10) }),
      traits: row({ name: text(), value: int(10) }),
      honor: int(null, { nullable: true }),
      passions: row({ name: text(), value: int(10) }),
      defaultSkill: int(PDVF.npcDefaultSkill),

      possessions: text(),
      notes: text(),

      squire: new fields.SchemaField({
        born: int(null, { nullable: true }),
        origin: new fields.StringField({ initial: "secondSon", choices: PDVF.squireOrigins.map(o => o.id) }),
        otherSkill: new fields.StringField({ initial: PDVF.squireDefaultOther }),
        first: new fields.BooleanField({ initial: false }),
        // Progrès de la compétence Écuyer pendant les phases d'hiver ; esquire resté au service.
        skillBonus: int(0),
        esquire: new fields.BooleanField({ initial: false })
      })
    };
  }

  prepareDerivedData() {
    const c = Object.fromEntries(PDVF.characteristics.map(k => [k, Number(this.characteristics[k].value) || 0]));
    const auto = derivedValues(c);
    this.derivedAuto = auto;
    const pick = (k) => (this.overrides[k] ?? null) === null ? auto[k] : this.overrides[k];
    this.derived = {
      hp: pick("hp"), knockdown: pick("knockdown"), majorWound: pick("majorWound"),
      unconscious: pick("unconscious"), move: pick("move"), healRate: pick("healRate"), damage: auto.damage
    };
    this.health.hp.max = this.derived.hp;
    const hp = this.health.hp.value;
    this.derived.status = hp <= 0 ? "dead" : hp < this.derived.unconscious ? "unconscious" : hp < this.derived.hp ? "wounded" : "unhurt";

    // Écuyer : âge tenu à jour par l'année du monde, compétences tirées de l'âge.
    this.isSquire = this.category === "squire";
    if (this.isSquire) {
      const year = currentYear();
      const age = this.squire.born === null || year === null ? null : year - this.squire.born;
      const origin = squireOrigin(this.squire.origin);
      const knightly = squireKnightly(age, origin.id);
      const ids = [...PDVF.squireKnightlySkills];
      if (this.squire.otherSkill && !ids.includes(this.squire.otherSkill)) ids.push(this.squire.otherSkill);
      this.squireView = {
        age, origin,
        skill: squireSkill(origin.id) + (Number(this.squire.skillBonus) || 0),
        knightly,
        knightlyIds: ids,
        tooOld: !this.squire.esquire && age !== null && age >= PDVF.squireMaxAge,
        esquire: this.squire.esquire
      };
    } else {
      this.squireView = null;
    }
    this.honorLevel = this.honor === null ? null : attributeLevel(this.honor);
  }
}

function currentYear() {
  try { return Number(game.settings.get("pendragon-vf", "currentYear")) || null; } catch (err) { return null; }
}
