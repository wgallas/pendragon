import { PDVF } from "../config.mjs";
import {
  roundPendragon, traitPair, attributeLevel, passiveGloryFromValues, passiveGloryFromAppearance
} from "../rules/resolution.mjs";

const fields = foundry.data.fields;

/** Champ numérique entier. */
function int(initial = 0, { min = undefined, max = undefined, nullable = false } = {}) {
  return new fields.NumberField({ required: true, nullable, integer: true, initial, min, max });
}

/** Valeur + croix d'expérience. */
function scored(initial) {
  return new fields.SchemaField({
    value: int(initial),
    xp: new fields.BooleanField({ initial: false })
  });
}

/**
 * Modèle de données du chevalier (personnage joueur).
 */
export class ChevalierData extends foundry.abstract.TypeDataModel {

  /** Ancienne inspiration unique → liste d'inspirations. */
  static migrateData(source) {
    const old = source.inspiration;
    if (old && typeof old === "object" && !Array.isArray(source.inspirations)) {
      source.inspirations = Number(old.bonus) > 0
        ? [{ source: old.source ?? "", state: Number(old.bonus) >= 10 ? "impassioned" : "inspired", bonus: Number(old.bonus), target: old.target ?? "" }]
        : [];
    }
    delete source.inspiration;
    return super.migrateData(source);
  }

  static defineSchema() {
    const skills = {};
    for (const id of Object.keys(PDVF.skills)) skills[id] = scored(0);

    const traits = {};
    for (const id of PDVF.traits) {
      traits[id] = new fields.SchemaField({
        value: int(id === "valorous" ? 15 : 10),
        xpLeft: new fields.BooleanField({ initial: false }),
        xpRight: new fields.BooleanField({ initial: false })
      });
    }

    const characteristics = {};
    for (const id of PDVF.characteristics) characteristics[id] = new fields.SchemaField({ value: int(10, { min: 0 }) });

    return {
      biography: new fields.SchemaField({
        title: new fields.StringField({ initial: "sire" }),
        born: int(null, { nullable: true }),
        heir: new fields.BooleanField({ initial: false }),
        homeland: new fields.StringField({ initial: "" }),
        lord: new fields.StringField({ initial: "" }),
        knightClass: new fields.StringField({ initial: "squire" }),
        culture: new fields.StringField({ initial: "" }),
        religion: new fields.StringField({ initial: "christian" }),
        distinctiveFeatures: new fields.StringField({ initial: "" })
      }),

      heraldry: new fields.SchemaField({
        img: new fields.FilePathField({ categories: ["IMAGE"], initial: null, nullable: true }),
        blazon: new fields.StringField({ initial: "" }),
        motto: new fields.StringField({ initial: "" })
      }),

      characteristics: new fields.SchemaField(characteristics),

      health: new fields.SchemaField({
        hp: new fields.SchemaField({ value: int(20) }),
        debilitated: new fields.BooleanField({ initial: false }),
        aggravation: int(0, { min: 0 }),
        deterioration: int(0, { min: 0 }),
        melancholy: new fields.BooleanField({ initial: false }),
        madness: new fields.BooleanField({ initial: false })
      }),

      skills: new fields.SchemaField(skills),
      skillSpecialties: new fields.SchemaField({
        religion: new fields.StringField({ initial: "" }),
        literacy: new fields.StringField({ initial: "" })
      }),
      extraSkills: new fields.ArrayField(new fields.SchemaField({
        name: new fields.StringField({ initial: "" }),
        group: new fields.StringField({ initial: "general" }),
        value: int(0),
        xp: new fields.BooleanField({ initial: false })
      })),

      traits: new fields.SchemaField(traits),
      directedTraits: new fields.ArrayField(new fields.SchemaField({
        name: new fields.StringField({ initial: "" }),
        value: int(0)
      })),
      ideal: new fields.StringField({ initial: "" }),

      honor: scored(15),
      passions: new fields.ArrayField(new fields.SchemaField({
        court: new fields.StringField({ initial: "fervor", choices: PDVF.passionCourts }),
        name: new fields.StringField({ initial: "" }),
        value: int(10),
        xp: new fields.BooleanField({ initial: false })
      })),

      // Bonus de passion en cours (Inspiré +5, Enflammé +10), un par compétence ou trait choisi.
      inspirations: new fields.ArrayField(new fields.SchemaField({
        source: new fields.StringField({ initial: "" }),
        state: new fields.StringField({ initial: "inspired", choices: ["inspired", "impassioned"] }),
        bonus: int(5),
        target: new fields.StringField({ initial: "" })
      })),
      // Passions déjà invoquées aujourd'hui (une fois par jour chacune), par nom.
      invokedToday: new fields.ArrayField(new fields.StringField()),
      // Suite : PNJ rattachés (écuyers, serviteurs, soldats), par UUID.
      followers: new fields.ArrayField(new fields.SchemaField({ uuid: new fields.StringField({ initial: "" }) })),
      // Écurie : chevaux rattachés (UUID et rôle), et cheval de guerre principal.
      horses: new fields.ArrayField(new fields.SchemaField({
        uuid: new fields.StringField({ initial: "" }),
        role: new fields.StringField({ initial: "riding" })
      })),
      mainHorse: new fields.StringField({ initial: "" }),
      // Jour (compteur du monde) auquel se rapportent invokedToday et inspirations.
      passionDay: int(0),

      glory: new fields.SchemaField({
        session: int(0),
        prestigeUsed: int(0, { min: 0 }),
        passiveLiving: int(0),
        passiveIdeals: int(0),
        passiveHoldings: int(0),
        passiveOther: int(0)
      }),

      dates: new fields.SchemaField({
        squired: int(null, { nullable: true }),
        knighted: int(null, { nullable: true }),
        landed: int(null, { nullable: true }),
        roundTable: int(null, { nullable: true }),
        ennobled: int(null, { nullable: true }),
        died: int(null, { nullable: true })
      }),

      family: new fields.SchemaField({
        parents: new fields.ArrayField(new fields.SchemaField({
          name: new fields.StringField({ initial: "" }),
          glory: int(0)
        }), { initial: [{ name: "", glory: 0 }, { name: "", glory: 0 }] }),
        characteristic: new fields.StringField({ initial: "" }),
        notes: new fields.StringField({ initial: "" }),
        // Conjoint (nom vide : célibataire) et enfants, pour l'étape Famille de la phase d'hiver.
        spouse: new fields.SchemaField({
          name: new fields.StringField({ initial: "" }),
          born: int(null, { nullable: true }),
          con: int(13, { min: 0 }),
          barren: new fields.BooleanField({ initial: false }),
          alive: new fields.BooleanField({ initial: true })
        }),
        children: new fields.ArrayField(new fields.SchemaField({
          name: new fields.StringField({ initial: "" }),
          sex: new fields.StringField({ initial: "m", choices: ["m", "f"] }),
          born: int(null, { nullable: true }),
          blessing: new fields.StringField({ initial: "" }),
          alive: new fields.BooleanField({ initial: true }),
          died: int(null, { nullable: true }),
          notes: new fields.StringField({ initial: "" })
        }))
      }),

      // Trésor (en deniers : 240 d = 1 £) et niveau de vie de l'année en cours.
      economy: new fields.SchemaField({
        treasury: int(0),
        living: new fields.StringField({ initial: "ordinary" }),
        destituteYears: int(0, { min: 0 })
      }),

      chronicle: new fields.ArrayField(new fields.SchemaField({
        year: int(0),
        event: new fields.StringField({ initial: "" }),
        living: new fields.StringField({ initial: "" }),
        glory: int(0)
      })),

      notes: new fields.StringField({ initial: "" })
    };
  }

  /** Calculs dérivés : caractéristiques dérivées, Gloire, niveaux. */
  prepareDerivedData() {
    const c = Object.fromEntries(PDVF.characteristics.map(k => [k, Number(this.characteristics[k].value) || 0]));

    const hpMax = c.con + c.siz;
    const damage = roundPendragon((c.str + c.siz) / 6);
    this.derived = {
      knockdown: c.siz,
      majorWound: c.con,
      damageDice: damage,
      damage: `${damage}D6`,
      brawlDamage: damage,
      move: roundPendragon((c.str + c.dex) / 2) + 5,
      hpMax,
      unconscious: roundPendragon(hpMax / 4),
      healRate: roundPendragon(c.con / 5)
    };

    // Maximum de PV pour la barre du jeton (system.health.hp).
    this.health.hp.max = hpMax;

    const hp = this.health.hp.value;
    let status = "unhurt";
    if (hp <= 0) status = "dead";
    else if (hp < this.derived.unconscious) status = "unconscious";
    else if (hp < hpMax) status = "wounded";
    this.derived.status = status;

    // Gloire : somme de la chronique, puis récompenses de prestige.
    let running = 0;
    this.chronicleRows = this.chronicle.map((row, index) => {
      running += Number(row.glory) || 0;
      return { ...row, index, total: running };
    });
    this.gloryTotal = running;
    this.prestigeEarned = Math.floor(running / 1000);

    // Niveaux des traits et passions, Gloire passive automatique.
    const traitValues = [];
    for (const id of PDVF.traits) {
      const pair = traitPair(this.traits[id].value);
      traitValues.push(pair.left, pair.right);
    }
    const passionValues = [this.honor.value, ...this.passions.map(p => p.value)];
    this.passive = {
      traits: passiveGloryFromValues(traitValues),
      passions: passiveGloryFromValues(passionValues),
      appearance: passiveGloryFromAppearance(c.app)
    };
    this.passive.total = this.passive.traits + this.passive.passions + this.passive.appearance
      + this.glory.passiveLiving + this.glory.passiveIdeals + this.glory.passiveHoldings + this.glory.passiveOther;

    // Totaux des cours de passions (l'Honneur reste à part).
    this.courtTotals = {};
    for (const court of PDVF.passionCourts) {
      this.courtTotals[court] = this.passions.filter(p => p.court === court)
        .reduce((s, p) => s + (Number(p.value) || 0), 0);
    }
    this.honorLevel = attributeLevel(this.honor.value);
  }

  /** Âge à partir de l'année de jeu en cours (réglage du monde). */
  get age() {
    const year = game.settings.get("pendragon-vf", "currentYear");
    return this.biography.born ? year - this.biography.born : null;
  }
}
