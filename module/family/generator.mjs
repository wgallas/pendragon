/**
 * Générateur d'historique familial (module pur, sans dépendance à Foundry).
 * Toutes les fonctions acceptent un générateur aléatoire `rng` (0 ≤ x < 1)
 * pour pouvoir être testées de façon reproductible.
 */
import {
  PERIODS, BATTLES, PASSION_TABLES, DEATH_MALE, DEATH_FEMALE, BRIDE_GLORY, LIVING,
  RAID_DEEDS, QUESTS, MALE_NAMES, FEMALE_NAMES
} from "./tables.mjs";

export const PC_BIRTH_YEAR = 487;
export const PC_SQUIRE_YEAR = 501;
const GLORY_INHERIT_MAX = 4000;
const KNIGHTING_GLORY = 1000;
const GLORIOUS_DEATH = 1000;

/* -------------------------------------------- */
/*  Dés                                          */
/* -------------------------------------------- */

/** Lance une expression simple : « 3d6+6 », « 1d3 », « 2d20 », « 15 ». */
export function rollDice(expr, rng = Math.random) {
  const m = String(expr).replace(/\s+/g, "").match(/^(\d*)d(\d+)([+-]\d+)?$/i);
  if (!m) return Number(expr) || 0;
  const n = Number(m[1] || 1);
  const faces = Number(m[2]);
  let total = Number(m[3] || 0);
  for (let i = 0; i < n; i++) {
    // 1d3 : un d6 lu 1–2 → 1, 3–4 → 2, 5–6 → 3 (même loi qu'un vrai d3)
    total += 1 + Math.floor(rng() * faces);
  }
  return total;
}

export const d20 = (rng) => rollDice("1d20", rng);

/** Ligne d'une table correspondant à un résultat (borné à 1–20). */
export function pick(table, roll) {
  const r = Math.max(1, Math.min(20, roll));
  return table.find(row => r >= row.r[0] && r <= row.r[1]) ?? table[table.length - 1];
}

function pickName(list, used, rng) {
  const free = list.filter(n => !used.has(n));
  const pool = free.length ? free : list;
  const name = pool[Math.floor(rng() * pool.length)];
  used.add(name);
  return name;
}

const yearLabel = (y) => (y[0] === y[1] ? String(y[0]) : `${y[0]}–${y[1]}`);

/* -------------------------------------------- */
/*  Génération                                   */
/* -------------------------------------------- */

/**
 * Génère une proposition complète d'historique familial.
 * @param {object} [options]
 * @param {Function} [options.rng]
 * @returns {object}
 */
export function generateFamily({ rng = Math.random } = {}) {
  const used = new Set();
  const people = {
    gg: makePerson("gg", "Arrière-grand-père", pickName(MALE_NAMES, used, rng), 410, 431),
    g: makePerson("g", "Grand-père", pickName(MALE_NAMES, used, rng), 439, 460),
    p: makePerson("p", "Père", pickName(MALE_NAMES, used, rng), 462, 483)
  };
  const state = {
    rng, people, used,
    flags: { dissident: false, side: null },
    once: new Set(),
    passions: new Map(),   // nom → { name, value, by, year }
    traits: new Map(),
    legacy: [],
    pcInherited: null
  };

  // Gloire de départ de l'arrière-grand-père, d'après celle de son propre père.
  const gggGlory = KNIGHTING_GLORY + rollDice("1d20", rng) * 100;
  const gg = people.gg;
  gg.inherited = inheritFrom(gggGlory);
  gg.glory = gg.inherited + KNIGHTING_GLORY + rollDice("2d20", rng);
  gg.active = true;
  gg.events.push({ year: "431", text: "Adoubé par le comte de Salisbury.", glory: null });

  const snapshots = [
    { year: 453, from: "gg", to: "g" },
    { year: 476, from: "g", to: "p" },
    { year: PC_SQUIRE_YEAR, from: "p", to: "pc" }
  ];

  for (const period of PERIODS) {
    // Gloire héritée à 14 ans (ou à la mort du parent si elle survient avant).
    for (const snap of snapshots) {
      if (!snap.done && period.years[1] >= snap.year) {
        snap.done = true;
        const value = inheritFrom(people[snap.from].glory);
        if (snap.to === "pc") state.pcInherited = value;
        else people[snap.to].inherited = value;
      }
    }
    runPeriod(period, state);
  }
  return finalize(state);
}

function makePerson(role, label, name, born, knighted) {
  return {
    role, label, name, born, knighted,
    active: false, alive: true, died: null, cause: "", glorious: false,
    glory: 0, inherited: 0, events: [], wife: null
  };
}

function inheritFrom(glory) {
  return Math.min(GLORY_INHERIT_MAX, Math.round((Number(glory) || 0) / 4));
}

function runPeriod(period, state) {
  const { people, rng } = state;
  const label = yearLabel(period.years);

  // Évènements qui précèdent les jets de l'année
  switch (period.special) {
    case "dissent":
      state.flags.dissident = d20(rng) >= 11;
      if (people.gg.alive && state.flags.dissident) {
        addEvent(people.gg, label, "La famille se plaint des faveurs accordées aux Saxons : elle passe pour dissidente.");
      }
      break;
    case "loyalty":
      if (state.flags.dissident) state.flags.side = d20(rng) <= 15 ? "rebel" : "loyalist";
      else state.flags.side = d20(rng) <= 10 ? "loyalist" : null;
      break;
    case "knightG": {
      const g = people.g;
      g.active = true;
      g.glory = g.inherited + KNIGHTING_GLORY;
      addEvent(g, label, "Adoubé.", KNIGHTING_GLORY);
      break;
    }
    case "knightP": {
      const p = people.p;
      p.active = true;
      p.glory = p.inherited + KNIGHTING_GLORY;
      addEvent(p, label, "Adoubé.", KNIGHTING_GLORY);
      marry(p, label, state, "mère du personnage");
      break;
    }
    case "marriageG":
      marry(people.g, "461", state, "grand-mère paternelle");
      addEvent(people.g, "462", "Naissance de son fils aîné, le père du personnage.");
      break;
    case "birthPC":
      addEvent(people.p, label, "Naissance de son aîné : le personnage.");
      break;
    case "squirePC":
      if (people.p.alive) addEvent(people.p, label, "Son fils aîné devient écuyer.");
      break;
  }

  // Jets de l'année pour chaque ancêtre en service
  for (const role of ["gg", "g", "p"]) {
    const person = people[role];
    if (!person.active || !person.alive) continue;
    let table = period[role];
    if (typeof table === "function") table = table(state);
    if (!table) continue;
    const modFn = period[`${role}Mod`];
    const mod = typeof modFn === "function" ? modFn(state) : 0;
    const entry = pick(table, d20(rng) + mod);
    applyEntry(person, entry, label, state);
  }

  // Évènements qui suivent les jets
  switch (period.special) {
    case "longKnives": {
      const gg = people.gg;
      if (gg.alive) die(gg, label, "assassiné lors de la nuit des Longs Couteaux", false, state);
      gainPassion(state, { name: "Haine (Saxons)", dice: "3d6+6" }, label, "Nuit des Longs Couteaux");
      break;
    }
    case "final484":
      if (people.g.alive) fight(people.g, "mtDamenG", label, state);
      break;
    case "poison495": {
      const p = people.p;
      if (p.alive && p._foughtThisPeriod && d20(rng) === 1) {
        die(p, label, "empoisonné au banquet de la victoire, avec Uther et le comte Roderick", false, state);
      }
      break;
    }
    case "final507": {
      const p = people.p;
      if (p.alive) {
        if (d20(rng) === 20) {
          die(p, label, "Tombe glorieusement en défendant Salisbury", true, state, GLORIOUS_DEATH);
        } else {
          die(p, label, pick(DEATH_MALE, d20(rng)).text, false, state);
        }
      }
      break;
    }
  }
  for (const person of Object.values(people)) delete person._foughtThisPeriod;
}

function marry(person, year, state, role) {
  const glory = pick(BRIDE_GLORY, d20(state.rng)).glory;
  person.wife = { name: pickName(FEMALE_NAMES, state.used, state.rng), glory, role };
  addEvent(person, year, `Épouse ${person.wife.name}, veuve dotée d'un manoir.`, glory);
}

function addEvent(person, year, text, glory = null) {
  if (glory) person.glory += glory;
  person.events.push({ year: String(year), text, glory: glory || null });
}

/**
 * Mort d'un ancêtre. `text` est la phrase affichée dans sa chronique ;
 * le domaine passe aussitôt à son fils.
 */
function die(person, year, text, glorious, state, glory = 0) {
  const sentence = upperFirst(text.replace(/\.$/, ""));
  person.alive = false;
  person.died = Number(String(year).split("–").pop());
  person.cause = lowerFirst(sentence);
  person.glorious = glorious;
  if (glory) person.glory += glory;
  person.events.push({ year: String(year), text: `${sentence}.`, glory: glory || null, death: true });

  const heir = { gg: "g", g: "p" }[person.role];
  if (heir) {
    const son = state.people[heir];
    addEvent(son, year, son.active
      ? "Hérite du domaine familial à la mort de son père."
      : "Hérite enfant du domaine familial, placé sous la tutelle du comte.");
  }
}

/** Applique une ligne d'une table annuelle. */
function applyEntry(person, entry, year, state) {
  if (entry.misc) return die(person, year, pick(DEATH_MALE, d20(state.rng)).text, false, state);
  if (entry.deed) return doDeed(person, entry.deed, year, state);

  if (entry.glorious) {
    die(person, year, entry.text ?? "Mort glorieusement au combat", true, state, (entry.glory || 0) + GLORIOUS_DEATH);
  } else if (entry.end) {
    die(person, year, entry.text ?? "Mort au combat", false, state, entry.glory || 0);
  } else if (entry.text) {
    addEvent(person, year, entry.text, entry.glory);
  }
  if (entry.passion) gainPassion(state, entry.passion, year, "", entry.passionMod);

  if (person.alive && entry.battle) {
    const key = typeof entry.battle === "function" ? entry.battle(state) : entry.battle;
    fight(person, key, year, state, entry.force);
    if (person.alive && entry.then) fight(person, entry.then, year, state);
    if (person.alive && entry.after) addEvent(person, year, entry.after);
  }
}

/** Participation à une bataille. */
function fight(person, key, year, state, forcedRoll = null) {
  const battle = BATTLES[key];
  const rng = state.rng;
  person._foughtThisPeriod = true;
  const glory = Math.round(battle.size * rollDice(battle.rounds, rng) * battle.mult);
  let result = pick(battle.results, forcedRoll ?? d20(rng));
  // Un haut fait unique déjà obtenu se ramène à un simple « a survécu ».
  if (result.once && state.once.has(result.once)) result = { r: result.r };
  if (result.once) state.once.add(result.once);

  const where = at(battle.name);
  addEvent(person, year, `Se bat ${where}.`, glory);
  if (result.legacy) state.legacy.push(`${person.label} : ${result.legacy}`);

  if (result.glorious) {
    die(person, year, `Mort glorieusement ${where}`, true, state, GLORIOUS_DEATH);
  } else if (result.end) {
    die(person, year, result.text ? `${result.text.replace(/\.$/, "")} (${battle.name})` : `Tué ${where}`, false, state);
  } else if (result.text) {
    addEvent(person, year, result.text, result.glory);
  } else if (result.glory) {
    addEvent(person, year, "", result.glory);
  }

  const passion = result.passion ?? (result.noPassion ? null : battle.passion);
  if (passion) gainPassion(state, passion, year, battle.name, result.passionMod);
}

/** Haut fait tiré des tables de la 6e (raid saxon, quête), une seule fois chacun. */
function doDeed(person, kind, year, state) {
  if (state.once.has(kind)) {
    return addEvent(person, year, kind === "raid" ? "Repousse des pillards saxons." : "Défend ses terres.", 50);
  }
  state.once.add(kind);
  const row = pick(kind === "raid" ? RAID_DEEDS : QUESTS, rollDice("1d6", state.rng));
  addEvent(person, year, row.text, row.glory);
  if (row.legacy === "favor") {
    state.legacy.push(`${person.label} : la famille de la demoiselle doit une Faveur F${rollDice("2d3", state.rng)}.`);
  } else if (row.legacy) {
    state.legacy.push(`${person.label} : ${row.legacy}`);
  }
}

/** Passion, trait dirigé ou drapeau gagné par la famille (on garde la plus haute valeur). */
function gainPassion(state, source, year, context, mod = 0) {
  let gain = source;
  if (typeof source === "string") {
    const row = pick(PASSION_TABLES[source], d20(state.rng) + (mod || 0));
    if (row.flag === "loyalist") { state.flags.side = "loyalist"; return; }
    gain = row.passion ?? row.trait;
    if (!gain) return;
    if (row.trait) return keepMax(state.traits, gain.name, rollDice(gain.dice, state.rng), year);
  }
  if (!gain?.name) return;
  return keepMax(state.passions, gain.name, rollDice(gain.dice, state.rng), year);
}

function keepMax(map, name, value, year) {
  const prev = map.get(name);
  if (!prev || value > prev.value) map.set(name, { name, value, year: String(year) });
}

/** « à la bataille de… », « au siège de… », « lors des raids… », « pendant la campagne… » */
function at(name) {
  if (name.startsWith("siège")) return `au ${name}`;
  if (name.startsWith("raids")) return `lors des ${name}`;
  if (name.startsWith("campagne")) return `pendant la ${name}`;
  return `à la ${name}`;
}

function upperFirst(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function lowerFirst(s) {
  return s ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}

/* -------------------------------------------- */
/*  Famille vivante                              */
/* -------------------------------------------- */

function relative(sex, rng, { mod = 0, canMarry = true } = {}) {
  const row = pick(LIVING, d20(rng) + mod);
  const out = { sex, alive: row.alive, married: canMarry ? row.married : false };
  if (!row.alive) out.cause = pick(sex === "m" ? DEATH_MALE : DEATH_FEMALE, d20(rng)).text;
  return out;
}

function siblings(count, rng, opts) {
  return Array.from({ length: count }, () => relative(rollDice("1d6", rng) % 2 === 0 ? "m" : "f", rng, opts));
}

function livingFamily(state) {
  const rng = state.rng;
  const p = state.people.p;
  const mother = { name: p.wife?.name ?? "", ...relative("f", rng, { mod: -3 }) };
  // Une mère morte avait forcément été mariée.
  if (!mother.alive) mother.married = true;

  // Frères et sœurs du personnage : plus jeunes que lui, âgés d'au moins 15 ans en 508,
  // et nés avant la mort du père.
  const lastBirth = Math.min(p.died ?? 507, 493);
  const maxSiblings = Math.max(0, Math.floor((lastBirth - PC_BIRTH_YEAR) / 1.5));
  const nbSiblings = Math.min(rollDice("1d6", rng), maxSiblings);

  return {
    mother,
    paternal: siblings(rollDice("1d6", rng), rng),
    maternal: siblings(rollDice("1d6", rng), rng),
    siblings: siblings(nbSiblings, rng, { canMarry: false })
  };
}

/* -------------------------------------------- */
/*  Résultat                                     */
/* -------------------------------------------- */

/** Trait dirigé hérité selon la 6e : la moitié de la valeur du parent (arrondi du livre). */
export function inheritedDirectedTrait(value) {
  return Math.floor((Number(value) || 0) / 2 + 0.5);
}

/** Bonus de passion héritée selon la 6e : valeur du parent − 15, +5 au plus. */
export function inheritedPassionBonus(value) {
  return Math.min(5, Math.round(value) - 15);
}

function finalize(state) {
  const { people } = state;
  const family = livingFamily(state);
  const ancestors = ["gg", "g", "p"].map(role => {
    const a = people[role];
    return {
      role: a.role, label: a.label, name: a.name, born: a.born, knighted: a.knighted,
      died: a.died, cause: a.cause, glorious: a.glorious,
      glory: a.glory, inherited: a.inherited,
      wife: a.wife,
      events: a.events.filter(e => e.text || e.glory).reduce(mergeGloryOnly, [])
        .map((e, i) => ({ ...e, _i: i }))
        .sort((x, y) => (parseInt(x.year, 10) - parseInt(y.year, 10)) || (x._i - y._i))
        .map(({ _i, ...e }) => e)
    };
  });
  const passions = [...state.passions.values()].map(p => ({
    ...p, bonus: inheritedPassionBonus(p.value)
  })).sort((a, b) => b.value - a.value);
  // Trait dirigé hérité : la moitié de la valeur du parent (Livre du joueur, « Traits dirigés »).
  const traits = [...state.traits.values()].map(t => ({ ...t, inherited: inheritedDirectedTrait(t.value) }));

  return {
    version: 1,
    ancestors,
    father: ancestors[2],
    flags: { ...state.flags },
    passions,
    traits,
    legacy: state.legacy,
    family,
    pc: {
      born: PC_BIRTH_YEAR,
      inheritYear: PC_SQUIRE_YEAR,
      inheritedGlory: state.pcInherited ?? inheritFrom(people.p.glory),
      suggestedName: people.g.name
    }
  };
}

/** Fusionne les gains de Gloire sans texte avec l'évènement qui précède. */
function mergeGloryOnly(list, e) {
  if (!e.text && list.length && list[list.length - 1].year === e.year) {
    const last = list[list.length - 1];
    last.glory = (last.glory || 0) + (e.glory || 0);
    return list;
  }
  if (!e.text) return list.concat({ ...e, text: "Gloire gagnée." });
  return list.concat({ ...e });
}

/** Trois propositions distinctes. */
export function generateProposals(count = 3, rng = Math.random) {
  return Array.from({ length: count }, () => generateFamily({ rng }));
}
