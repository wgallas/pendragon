import { PDVF } from "../config.mjs";

const fields = foundry.data.fields;
const str = (initial = "", opts = {}) => new fields.StringField({ initial, ...opts });
const num = (initial, opts = {}) => new fields.NumberField({ required: true, nullable: false, initial, ...opts });
const year = () => new fields.NumberField({ required: true, nullable: true, integer: true, initial: null });

/**
 * Objet « Domaine » : manoir, seigneurie ou baronnie tenu par un chevalier.
 * La gestion du manoir suit le Livre des Nobles (chap. 3) : la rente (income) fait vivre la maisonnée,
 * le test de Gestion annuel donne les fonds privés ; investissements, embellissements, défenses, gens.
 */
export class DomaineData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      rank: str("vassal", { choices: Object.keys(PDVF.domainRanks) }),
      tenure: str("fief", { choices: ["gift", "fief"] }),
      lord: str(),
      location: str(),
      // Rente fixée en livres (en nature : grain, bétail, corvées) ; elle paie l'entretien de la maisonnée
      income: num(10, { min: 0 }),
      manors: num(1, { integer: true, min: 1 }),
      harvest: new fields.SchemaField({
        fumbles: num(0, { integer: true, min: 0 }),
        hunger: new fields.BooleanField({ initial: false }),
        famine: new fields.BooleanField({ initial: false }),
        famineNext: new fields.BooleanField({ initial: false })
      }),
      investments: new fields.ArrayField(new fields.SchemaField({
        type: str(), name: str(), paid: num(0, { min: 0 }), cost: num(10, { min: 0 }),
        check: str(), lastFunded: year(), destroyed: new fields.BooleanField({ initial: false }), notes: str()
      })),
      enhancements: new fields.ArrayField(new fields.SchemaField({
        type: str(), name: str(), paid: num(0, { min: 0 }), cost: num(10, { min: 0 }),
        check: str(), lastPaid: year(), ruined: new fields.BooleanField({ initial: false }), notes: str()
      })),
      improvements: new fields.ArrayField(new fields.SchemaField({
        type: str(), name: str(), pending: new fields.BooleanField({ initial: false }), notes: str()
      })),
      features: new fields.ArrayField(new fields.SchemaField({ type: str(), name: str(), notes: str() })),
      defenses: new fields.ArrayField(new fields.SchemaField({ type: str(), name: str(), notes: str() })),
      professionals: new fields.ArrayField(new fields.SchemaField({
        type: str(), name: str(), skill: num(0, { integer: true, min: 0 }), cost: new fields.NumberField({ required: true, nullable: true, initial: null, min: 0 }),
        entourage: new fields.BooleanField({ initial: false })
      })),
      soldiers: new fields.ArrayField(new fields.SchemaField({ type: str("spearman"), count: num(1, { integer: true, min: 0 }) })),
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
