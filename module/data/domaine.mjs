import { PDVF } from "../config.mjs";

const fields = foundry.data.fields;
const str = (initial = "", opts = {}) => new fields.StringField({ initial, ...opts });
const num = (initial, opts = {}) => new fields.NumberField({ required: true, nullable: false, initial, ...opts });

/**
 * Objet « Domaine » : manoir, seigneurie ou baronnie tenu par un chevalier.
 * Les règles de gestion détaillées (Livre des Nobles) viendront compléter ce cadre.
 */
export class DomaineData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      rank: str("vassal", { choices: Object.keys(PDVF.domainRanks) }),
      tenure: str("fief", { choices: ["gift", "fief"] }),
      lord: str(),
      location: str(),
      // Revenu annuel en livres (en nature : grain, bétail, corvées)
      income: num(10, { min: 0 }),
      passiveGlory: num(0, { integer: true, min: 0 }),
      obligations: str("40 jours de service armé par an ; conseil au seigneur."),
      steward: new fields.SchemaField({
        name: str(),
        skill: num(0, { integer: true, min: 0 })
      }),
      garrison: str(),
      since: new fields.NumberField({ required: true, nullable: true, integer: true, initial: null }),
      ledger: new fields.ArrayField(new fields.SchemaField({
        year: new fields.NumberField({ required: true, nullable: true, integer: true, initial: null }),
        income: num(0),
        note: str()
      })),
      description: str(),
      notes: str()
    };
  }
}
