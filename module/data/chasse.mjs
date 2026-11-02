import { PDVF } from "../config.mjs";

const fields = foundry.data.fields;
const int = (initial = 0, opts = {}) => new fields.NumberField({ required: true, nullable: false, integer: true, initial, ...opts });
const intOrNull = (opts = {}) => new fields.NumberField({ required: true, nullable: true, integer: true, initial: null, ...opts });
const str = (initial = "", opts = {}) => new fields.StringField({ initial, ...opts });
const bool = (initial = false) => new fields.BooleanField({ initial });

/**
 * Objet « Chasse » (Livre du maître, chap. 3, p. 45–49) : une partie de chasse (levée, poursuite,
 * obstacles, aboi, ruée), ou une course, ou une poursuite (lignes et tests de Mouvement).
 * Seul le MJ écrit dans ce document ; les joueurs passent par le MJ (socket).
 */
export class ChasseData extends foundry.abstract.TypeDataModel {

  static defineSchema() {
    return {
      mode: str("hunt", { choices: ["hunt", "race", "pursuit"] }),
      year: intOrNull(),
      place: str(""),
      host: str(""),
      notes: str(""),
      season: str("autumn", { choices: () => Object.keys(PDVF.hunt.seasonRounds) }),
      round: int(0, { min: 0 }),
      lines: int(6, { min: 4, max: 20 }),
      heavyArmor: bool(),
      phase: str("setup"),
      // Bonus de Chasse du segment suivant (proie échappée sur un succès partiel)
      bonus: int(0),
      prey: new fields.SchemaField({
        uuid: str(""), name: str(""), img: str(""),
        avoidance: int(10), move: int(10), hp: int(20), hpMax: int(20), armor: int(0), majorWound: int(10),
        glory: int(0), damage: str(""), attack: int(10), grievous: bool(), dead: bool(), killer: str(""), fleeing: bool()
      }),
      participants: new fields.ArrayField(new fields.SchemaField({
        uuid: str(""),
        // Chasse : groupe (le meneur est la meilleure Chasse du groupe) ; poursuite : poursuivant ou poursuivi
        group: int(1, { min: 1 }),
        side: str("hunter", { choices: ["hunter", "runner", "pursuer", "quarry"] }),
        mounted: bool(true),
        pos: int(0),
        out: bool(),
        outReason: str(""),
        skip: bool(),
        escaped: bool(),
        // Hôte ou invité d'honneur : le premier coup lui revient
        honored: bool(),
        glory: int(0)
      })),
      // Ruée : attaquants du tour et coups portés
      rush: new fields.SchemaField({ attackers: new fields.ArrayField(new fields.NumberField({ integer: true })), done: new fields.ArrayField(new fields.NumberField({ integer: true })), escapes: int(0) }),
      first: new fields.SchemaField({ index: intOrNull(), done: bool(), outcome: str("") }),
      winners: new fields.ArrayField(new fields.NumberField({ integer: true })),
      caught: new fields.ArrayField(new fields.SchemaField({ quarry: int(0), pursuer: int(0) })),
      log: new fields.ArrayField(new fields.StringField())
    };
  }

  prepareDerivedData() {
    this.maxRounds = this.mode === "hunt" ? (PDVF.hunt.seasonRounds[this.season] ?? 8) : null;
  }
}
