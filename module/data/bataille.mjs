import { PDVF } from "../config.mjs";
import { encounterFields } from "./rencontre.mjs";
import { maxRounds, effectiveIntensity } from "../rules/battle.mjs";

const fields = foundry.data.fields;
const int = (initial = 0, opts = {}) => new fields.NumberField({ required: true, nullable: false, integer: true, initial, ...opts });
const intOrNull = (opts = {}) => new fields.NumberField({ required: true, nullable: true, integer: true, initial: null, ...opts });
const str = (initial = "", opts = {}) => new fields.StringField({ initial, ...opts });
const bool = (initial = false) => new fields.BooleanField({ initial });

/** Une armée : nom du commandant, sa Bataille, circonstances de la Table 6.2 et résultat de son test. */
function armyField() {
  return new fields.SchemaField({
    name: str(""),
    battle: intOrNull({ min: 0 }),
    mods: new fields.ArrayField(new fields.StringField()),
    outcome: str("")
  });
}

/**
 * Objet « Bataille » : préparation, déroulement tour par tour et bilan (Livre du maître, chap. 6).
 * Seul le MJ écrit dans ce document ; les joueurs passent par le MJ (socket).
 */
export class BatailleData extends foundry.abstract.TypeDataModel {

  static defineSchema() {
    return {
      // Préparation
      size: str("skirmish", { choices: () => Object.keys(PDVF.battle.sizes) }),
      intensity: intOrNull({ min: 0 }),
      rounds: intOrNull({ min: 1 }),
      tournament: bool(),
      army: str("feudal"),
      odds: str("even"),
      favors: str("allied", { choices: ["allied", "enemy"] }),
      allied: armyField(),
      enemy: armyField(),
      notes: str(""),
      events: new fields.ArrayField(new fields.SchemaField({ round: int(1, { min: 1 }), text: str("") })),

      // Paquet de rencontres et d'opportunités
      encounters: new fields.ArrayField(new fields.SchemaField({
        id: str(""),
        name: str(""),
        source: str(""),
        used: bool(),
        ...encounterFields()
      })),

      // Conroi des PJ
      conroi: new fields.SchemaField({
        commander: str(""),
        commanderName: str(""),
        commanderBattle: intOrNull({ min: 0 }),
        npcKnights: int(0, { min: 0 }),
        court: str("fidelitas"),
        moraleStart: int(0, { min: 0 }),
        morale: int(0, { min: 0 })
      }),
      knights: new fields.ArrayField(new fields.SchemaField({
        uuid: str(""),
        role: str("none"),
        status: str("field"),
        passion: intOrNull(),
        posture: str(""),
        pendingMorale: str(""),
        battleRoll: str(""),
        proposal: str(""),
        invoked: str(""),
        invokedTarget: str(""),
        invokedRound: int(0),
        squire: str(""),
        squireLost: bool(),
        participated: bool(),
        kills: new fields.ArrayField(new fields.SchemaField({
          name: str(""), kv: new fields.NumberField({ required: true, initial: 0 }), glory: int(0),
          captured: bool(), round: int(0), ransom: str("")
        }))
      })),

      // Déroulement
      state: new fields.SchemaField({
        phase: str("prep", { choices: ["prep", "active", "done"] }),
        round: int(0, { min: 0 }),
        step: str(""),
        position: str("field"),
        defaultId: str(""),
        selectedId: str(""),
        charge: str(""),
        chargeOutcome: str(""),
        intensityOutcome: str(""),
        doubled: bool(),
        moraleLoss: intOrNull(),
        rangedRounds: intOrNull(),
        counterCharge: str(""),
        engagedLast: bool(),
        firstCharge: bool(true),
        firstRoundPenalty: bool(),
        enemyImposes: bool(),
        enemyImposeUsed: bool(),
        moraleImmunity: bool(),
        moraleImmunityUsed: bool(),
        immune: bool(),
        imposed: bool(),
        moraleMinMod: int(0),
        moraleLossMod: int(0)
      }),
      log: new fields.ArrayField(new fields.SchemaField({ round: int(0), text: str("") })),

      // Bilan
      result: new fields.SchemaField({
        lossOutcome: str(""),
        npcLost: int(0, { min: 0 }),
        npcKilled: int(0, { min: 0 }),
        npcCaptured: int(0, { min: 0 }),
        otherLosses: new fields.NumberField({ required: true, initial: 0, min: 0 }),
        override: str(""),
        decisiveBonus: int(0, { min: 0 }),
        applied: bool()
      })
    };
  }

  prepareDerivedData() {
    const C = PDVF.battle;
    this.maxRounds = maxRounds(this.size, this.rounds, C);
    this.effectiveIntensity = this.intensity === null ? null : effectiveIntensity(this.intensity, this.tournament, C);
    this.armyTests = !!C.sizes[this.size]?.armyTests;
  }
}
