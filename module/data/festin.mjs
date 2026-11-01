import { PDVF } from "../config.mjs";

const fields = foundry.data.fields;
const int = (initial = 0, opts = {}) => new fields.NumberField({ required: true, nullable: false, integer: true, initial, ...opts });
const intOrNull = (opts = {}) => new fields.NumberField({ required: true, nullable: true, integer: true, initial: null, ...opts });
const str = (initial = "", opts = {}) => new fields.StringField({ initial, ...opts });
const bool = (initial = false) => new fields.BooleanField({ initial });

/**
 * Objet « Festin » (Livre du maître, chap. 3, p. 37–44) : placement par le test de Gloire, tours de festin
 * (cartes d'évènement tirées par les joueurs et saisies sur la fiche, ou autres activités de cour),
 * départs, puis Gloire du festin (Table 3.7).
 * Seul le MJ écrit dans ce document ; les joueurs passent par le MJ (socket).
 */
export class FestinData extends foundry.abstract.TypeDataModel {

  static defineSchema() {
    return {
      year: intOrNull(),
      place: str(""),
      host: str(""),
      notes: str(""),
      size: str("medium", { choices: () => Object.keys(PDVF.feast.sizes) }),
      // Nombre de tours (au moins celui de la Table 3.2) et tour en cours (0 : pas commencé)
      rounds: int(3, { min: 1, max: 12 }),
      round: int(0, { min: 0 }),
      // Tournoi dont c'est le festin du soir
      tournament: str(""),
      // Mets phares des trois services
      dishes: new fields.ArrayField(new fields.StringField(), { initial: ["", "", ""] }),
      guests: new fields.ArrayField(new fields.SchemaField({
        uuid: str(""),
        // Vêtements (niveau de vie, Table 3.1 ; vide : celui de l'année du chevalier) et autres bonus d'Engouement
        clothing: str(""),
        bonus: int(0),
        seat: str(""),
        seatTest: new fields.SchemaField({ outcome: str(""), second: str("") }),
        // Test de Modeste quand on est placé sous un PJ de même rang moins glorieux
        modest: str(""),
        // Céder sa place : résultat du test de Modeste
        yielded: str(""),
        // Écritures d'Engouement : place (chaque tour), carte, départ, ajustement du MJ
        entries: new fields.ArrayField(new fields.SchemaField({
          round: int(0),
          kind: str("gm"),
          label: str(""),
          mod: int(0),
          host: bool(),
          outcome: str(""),
          floorZero: bool(),
          reset: bool()
        })),
        // Gloire gagnée en cours de festin (activité, place cédée, départ courtois)
        glory: new fields.ArrayField(new fields.SchemaField({ label: str(""), glory: int(0) })),
        // Tour après lequel il est parti (null : présent)
        left: intOrNull({ min: 0 }),
        leftHow: str(""),
        inscribed: int(0, { min: 0 })
      })),
      log: new fields.ArrayField(new fields.StringField())
    };
  }

  prepareDerivedData() {
    const sizes = PDVF.feast.sizes;
    this.sizeData = sizes[this.size] ?? sizes.medium;
    this.over = this.round >= this.rounds;
  }
}
