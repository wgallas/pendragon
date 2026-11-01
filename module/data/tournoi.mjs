import { PDVF } from "../config.mjs";
import { difficultyLevel } from "../rules/tournament.mjs";

const fields = foundry.data.fields;
const int = (initial = 0, opts = {}) => new fields.NumberField({ required: true, nullable: false, integer: true, initial, ...opts });
const intOrNull = (opts = {}) => new fields.NumberField({ required: true, nullable: true, integer: true, initial: null, ...opts });
const str = (initial = "", opts = {}) => new fields.StringField({ initial, ...opts });
const bool = (initial = false) => new fields.BooleanField({ initial });

/** Résultat d'une épreuve en procédure abrégée (Table 3.16). */
function abridgedField() {
  return new fields.SchemaField({
    row: str(""), skill: str(""), glory: int(0), damageRow: str(""), damage: int(0)
  });
}

/** Un concurrent d'une rencontre de joute : un PJ (index du chevalier) ou un adversaire de la Table 3.14. */
function jousterField() {
  return new fields.SchemaField({
    kind: str("npc", { choices: ["pc", "npc"] }),
    index: intOrNull({ min: 0 }),
    name: str(""),
    charge: int(13),
    dex: int(12),
    horsemanship: int(15),
    horseDamage: str(""),
    lances: int(0, { min: 0 }),
    unhorsed: bool(),
    disqualified: bool(),
    // Test de Charge de la passe en cours, lancé par le joueur (vide : pas encore lancé)
    roll: new fields.SchemaField({
      die: intOrNull(), adjusted: intOrNull(), outcome: str(""), success: bool(), total: intOrNull()
    })
  });
}

/**
 * Objet « Tournoi » (Livre du maître, chap. 3) : préparé par le MJ (taille, difficulté, chevaliers),
 * joué en procédure abrégée, en joute passe par passe et en mêlée (une Bataille liée, en mode tournoi),
 * avec ses à-côtés (tests de cour, festin, messe, défis courtois) et ses trophées.
 * Seul le MJ écrit dans ce document ; les joueurs passent par le MJ (socket).
 */
export class TournoiData extends foundry.abstract.TypeDataModel {

  static defineSchema() {
    return {
      year: intOrNull(),
      place: str(""),
      host: str(""),
      lady: str(""),
      notes: str(""),
      size: str("neighborhood", { choices: () => Object.keys(PDVF.tournament.sizes) }),
      sizeRoll: intOrNull(),
      // Armes émoussées et lances de joute (« à plaisance ») ou armes de guerre (« à outrance »)
      stakes: str("love", { choices: ["love", "war"] }),
      // Le roi ou la reine sont présents : Gloire des tests de cour doublée
      royalPresence: bool(),
      difficulty: new fields.SchemaField({
        roll: intOrNull(),
        mod: int(0),
        cause: str(""),
        // NDT imposé par le MJ (vide : la plus faible Charge des PJ + modificateur)
        override: intOrNull()
      }),
      joust: new fields.SchemaField({
        // Joute proposée (d'office à partir de la Période des Conquêtes) et barrière (Période des Tournois)
        enabled: bool(),
        barrier: bool(),
        round: int(0, { min: 0 }),
        matches: new fields.ArrayField(new fields.SchemaField({
          id: str(""),
          round: int(1),
          pass: int(0, { min: 0 }),
          a: jousterField(),
          b: jousterField(),
          state: str("open", { choices: ["open", "done"] }),
          winner: str(""),
          lines: new fields.ArrayField(new fields.StringField())
        }))
      }),
      melee: new fields.SchemaField({ battle: str("") }),
      knights: new fields.ArrayField(new fields.SchemaField({
        uuid: str(""),
        melee: bool(true),
        joust: bool(true),
        favor: bool(),
        abridged: new fields.SchemaField({ melee: abridgedField(), joust: abridgedField() }),
        court: new fields.SchemaField({
          allowed: intOrNull({ min: 0 }),
          penalty: int(0),
          tests: new fields.ArrayField(new fields.SchemaField({ skill: str(""), outcome: str(""), glory: int(0) }))
        }),
        side: new fields.SchemaField({ feast: str(""), mass: str(""), temptation: str("") }),
        joustWins: int(0, { min: 0 }),
        joustGlory: int(0, { min: 0 }),
        joustOut: bool(),
        champion: new fields.SchemaField({ melee: bool(), joust: bool() }),
        inscribed: int(0, { min: 0 })
      })),
      challenges: new fields.ArrayField(new fields.SchemaField({ skill: str(""), winner: str(""), lines: new fields.ArrayField(new fields.StringField()) })),
      prizes: new fields.ArrayField(new fields.SchemaField({ r: int(1), pounds: int(0), to: str("") })),
      log: new fields.ArrayField(new fields.StringField())
    };
  }

  prepareDerivedData() {
    const sizes = PDVF.tournament.sizes;
    this.sizeData = sizes[this.size] ?? sizes.neighborhood;
    const charges = this.knights.map(k => {
      try { return globalThis.fromUuidSync?.(k.uuid)?.system?.skills?.charge?.value ?? null; } catch (err) { return null; }
    }).filter(v => v !== null);
    this.ndtBase = difficultyLevel(charges, 0);
    this.ndt = this.difficulty.override ?? (this.ndtBase === null ? null : this.ndtBase + (Number(this.difficulty.mod) || 0));
    this.royal = !!this.sizeData.royal || this.royalPresence;
  }
}
