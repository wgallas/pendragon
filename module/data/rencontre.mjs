const fields = foundry.data.fields;

/**
 * Champs d'une rencontre de bataille (opposant ou opportunité), partagés par l'objet « Rencontre »
 * et par les copies rangées dans le paquet d'une bataille.
 */
export function encounterFields() {
  const num = (initial, opts = {}) => new fields.NumberField({ required: true, nullable: false, initial, ...opts });
  const bool = (initial = false) => new fields.BooleanField({ initial });
  return {
    kind: new fields.StringField({ initial: "opponent", choices: ["opponent", "opportunity"] }),
    // Règles et texte guidé du MJ (cachés aux joueurs)
    description: new fields.StringField({ initial: "" }),
    // Description évocatrice montrée aux joueurs, sans règles ni coûts
    teaser: new fields.StringField({ initial: "" }),
    moraleLoss: new fields.StringField({ initial: "1D6" }),
    moraleMin: num(10, { integer: true }),
    kv: num(1, { min: 0 }),
    perKnight: num(1, { min: 0 }),
    fixedCount: new fields.NumberField({ required: true, nullable: true, integer: true, initial: null, min: 1 }),
    npc: new fields.StringField({ initial: "" }),
    glory: num(0, { integer: true, min: 0 }),
    mounted: bool(),
    counterCharge: bool(),
    ranged: bool(),
    noCharge: bool(),
    forbidPrudent: bool(),
    ransom: new fields.StringField({ initial: "" }),
    armies: new fields.ArrayField(new fields.StringField())
  };
}

/** Objet « Rencontre » : une carte du paquet de bataille. */
export class RencontreData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return encounterFields();
  }
}
