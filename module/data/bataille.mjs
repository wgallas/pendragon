import { PDVF } from "../config.mjs";
import { encounterFields } from "./rencontre.mjs";
import { maxRounds, effectiveIntensity } from "../rules/battle.mjs";

const fields = foundry.data.fields;
const int = (initial = 0, opts = {}) => new fields.NumberField({ required: true, nullable: false, integer: true, initial, ...opts });
const intOrNull = (opts = {}) => new fields.NumberField({ required: true, nullable: true, integer: true, initial: null, ...opts });
const numOrNull = (opts = {}) => new fields.NumberField({ required: true, nullable: true, initial: null, ...opts });
const str = (initial = "", opts = {}) => new fields.StringField({ initial, ...opts });
const bool = (initial = false) => new fields.BooleanField({ initial });
const strings = () => new fields.ArrayField(new fields.StringField());

/**
 * Un effet d'événement, de condition ou de table (PDVF.battle.effects).
 * value : nombre, formule, choix ou texte selon le type ; ids : cartes du paquet visées.
 */
export function effectField() {
  return new fields.SchemaField({
    type: str("note"),
    value: str(""),
    ids: strings()
  });
}
const effects = () => new fields.ArrayField(effectField());

/**
 * Un camp : nom du commandant, sa Bataille (au-delà de 20 compris), circonstances de la Table 6.2,
 * modificateurs libres du scénario, résultat imposé et résultat obtenu de son test.
 */
function armyField() {
  return new fields.SchemaField({
    name: str(""),
    battle: intOrNull({ min: 0 }),
    mods: strings(),
    custom: new fields.ArrayField(new fields.SchemaField({ label: str(""), value: int(0) })),
    forced: str(""),
    outcome: str("")
  });
}

/**
 * Objet « Bataille » : une journée (ou une partie de journée) de bataille, préparée par le MJ,
 * jouée tour par tour, puis close par un bilan (Livre du maître, chap. 6 ; batailles de The Boy King).
 * Seul le MJ écrit dans ce document ; les joueurs passent par le MJ (socket).
 */
export class BatailleData extends foundry.abstract.TypeDataModel {

  static defineSchema() {
    return {
      // ----- Présentation -----
      year: intOrNull(),
      place: str(""),
      war: str(""),
      // Bataille ou partie jouée hors du système (siège réglé par l'assaut…)
      kind: str("battle", { choices: ["battle", "offsystem"] }),
      // Batailles enchaînées : une journée par bataille
      series: new fields.SchemaField({
        name: str(""),
        previous: str(""),
        day: intOrNull({ min: 1 })
      }),
      banner: new fields.SchemaField({
        img: str(""),
        focus: int(45, { min: 0, max: 100 })
      }),
      scene: str(""),
      intro: str(""),
      interlude: str(""),
      notes: str(""),

      // ----- Armées -----
      size: str("skirmish", { choices: () => Object.keys(PDVF.battle.sizes) }),
      intensity: intOrNull({ min: 0 }),
      rounds: intOrNull({ min: 1 }),
      tournament: bool(),
      army: str("feudal"),
      odds: str("even"),
      favors: str("allied", { choices: ["allied", "enemy"] }),
      firstCharge: str("test", { choices: () => PDVF.battle.firstChargeModes }),
      allied: armyField(),
      enemy: armyField(),
      // Effets permanents sur toute la bataille ou une plage de tours (pluie, nuit…)
      conditions: new fields.ArrayField(new fields.SchemaField({
        label: str(""),
        from: intOrNull({ min: 1 }),
        to: intOrNull({ min: 1 }),
        effects: effects()
      })),

      // ----- Tours : un événement facultatif par tour -----
      events: new fields.ArrayField(new fields.SchemaField({
        round: int(1, { min: 1 }),
        title: str(""),
        text: str(""),
        gmNote: str(""),
        img: str(""),
        focus: int(45, { min: 0, max: 100 }),
        trigger: str("intensity"),
        condition: str(""),
        duration: str("round"),
        until: intOrNull({ min: 1 }),
        knights: strings(),
        effects: effects()
      })),

      // Tables d'événements aléatoires (table de Badon et ses sous-tables)
      tables: new fields.ArrayField(new fields.SchemaField({
        id: str(""),
        name: str(""),
        formula: str("3D6"),
        trigger: str("manual"),
        rows: new fields.ArrayField(new fields.SchemaField({
          min: int(1),
          max: int(1),
          text: str(""),
          table: str(""),
          effects: effects()
        }))
      })),

      // ----- Paquet de rencontres et d'opportunités (copies réglables localement) -----
      encounters: new fields.ArrayField(new fields.SchemaField({
        id: str(""),
        name: str(""),
        source: str(""),
        used: bool(),
        img: str(""),
        from: intOrNull({ min: 1 }),
        to: intOrNull({ min: 1 }),
        forced: bool(),
        skillBonus: int(0),
        ...encounterFields()
      })),

      // ----- Conroi des PJ -----
      conroi: new fields.SchemaField({
        commander: str(""),
        commanderName: str(""),
        commanderBattle: intOrNull({ min: 0 }),
        // Joueur qui tient le rôle du commandant quand c'est un PNJ
        commanderPlayer: str(""),
        npcKnights: int(0, { min: 0 }),
        court: str("fidelitas"),
        moraleStart: int(0, { min: 0 }),
        morale: int(0, { min: 0 })
      }),
      knights: new fields.ArrayField(new fields.SchemaField({
        uuid: str(""),
        role: str("none"),
        status: str("field"),
        // Tour d'arrivée sur le champ (vide : dès le début)
        arrival: intOrNull({ min: 1 }),
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

      // ----- Bilan imposé par le scénario (ce qui reste vide se calcule) -----
      outcome: new fields.SchemaField({
        result: str(""),
        glory: intOrNull({ min: 0 }),
        commanderDouble: bool(true),
        bonuses: new fields.ArrayField(new fields.SchemaField({
          label: str(""),
          glory: int(0),
          knights: strings()
        })),
        loot: new fields.SchemaField({
          mode: str("rules", { choices: () => PDVF.battle.lootModes }),
          pounds: numOrNull({ min: 0 }),
          commanderPounds: numOrNull({ min: 0 }),
          items: str("")
        }),
        note: str("")
      }),

      // ----- Déroulement -----
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

      // ----- Bilan -----
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

  /** Anciennes batailles : un seul événement par tour (les textes d'un même tour sont réunis). */
  static migrateData(source) {
    if (Array.isArray(source?.events)) {
      const byRound = new Map();
      for (const e of source.events) {
        const r = Number(e?.round) || 1;
        const kept = byRound.get(r);
        if (!kept) byRound.set(r, e);
        else if (e?.text) kept.text = [kept.text, e.text].filter(Boolean).join("\n");
      }
      if (byRound.size !== source.events.length) source.events = [...byRound.values()];
    }
    return super.migrateData(source);
  }

  prepareDerivedData() {
    const C = PDVF.battle;
    this.maxRounds = maxRounds(this.size, this.rounds, C);
    this.effectiveIntensity = this.intensity === null ? null : effectiveIntensity(this.intensity, this.tournament, C);
    this.armyTests = !!C.sizes[this.size]?.armyTests;
    this.offSystem = this.kind === "offsystem";
  }
}
