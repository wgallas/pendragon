/**
 * Règles de la création de personnage (Livre du joueur, chapitre 3).
 * Module pur : aucune dépendance à Foundry, tout est testable.
 *
 * L'état de l'assistant (« brouillon ») est un objet simple, sérialisable,
 * conservé dans un drapeau de l'acteur entre deux ouvertures.
 */
import { PDVF } from "../config.mjs";
import { CREATION } from "./data.mjs";
import { rollDice } from "../family/generator.mjs";
import { roundPendragon, traitPair } from "../rules/resolution.mjs";

export const STEPS = ["origin", "characteristics", "traits", "passions", "family", "skills", "apprentice", "details"];
const CHARS = ["siz", "dex", "str", "con", "app"];

const sum = (obj) => Object.values(obj ?? {}).reduce((s, v) => s + (Number(v) || 0), 0);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/* -------------------------------------------- */
/*  État initial                                 */
/* -------------------------------------------- */

export function defaultState(C = CREATION) {
  const fn = Object.keys(C.functions)[0];
  const culture = Object.keys(C.cultures)[0];
  const cult = C.cultures[culture];
  return {
    version: 1,
    step: 0,
    method: "built",
    origin: {
      fn,
      klass: C.functions[fn].classes[0],
      culture,
      homeland: cult.homelands?.[0] ?? "",
      religion: cult.religions?.[0]?.id ?? "christian",
      sex: "male",
      name: ""
    },
    chars: { built: Object.fromEntries(CHARS.map(c => [c, 12])), rolled: null },
    traits: { famous: "", points: {}, rolled: null },
    passions: { points: {}, extra: [], rolled: null, pool: null },
    family: { mode: "history", proposals: null, chosen: null, selection: null, quickParentGlory: null, manualGlory: 0 },
    familyTrait: { id: null, rolls: null },
    skills: { points: {} },
    apprentice: { years: C.budgets.apprenticeYears, alloc: { skills: C.budgets.apprenticeYears, traits: 0, chars: 0 },
      skills: {}, traits: {}, chars: {} },
    details: { features: [], knighted: true, lordGlory: 0, jump: null, luck: null, ideal: "", blazon: "", motto: "" }
  };
}

/** Objets de référence de l'origine choisie (repli sur la première option valide). */
export function resolveOrigin(state, C = CREATION) {
  const o = state.origin;
  const fn = C.functions[o.fn] ?? Object.values(C.functions)[0];
  const klassId = fn.classes.includes(o.klass) ? o.klass : fn.classes[0];
  const culture = C.cultures[o.culture] ?? Object.values(C.cultures)[0];
  const homelandId = (culture.homelands ?? []).includes(o.homeland) ? o.homeland : culture.homelands?.[0];
  const religionIds = (culture.religions ?? []).map(r => r.id);
  const religionId = religionIds.includes(o.religion) ? o.religion : religionIds[0];
  return {
    fn, klassId, klass: C.classes[klassId], culture,
    homelandId, homeland: C.homelands[homelandId] ?? null,
    religionId, religion: PDVF.religions[religionId] ?? { virtues: [] }
  };
}

/* -------------------------------------------- */
/*  Caractéristiques                             */
/* -------------------------------------------- */

export function rollCharacteristics(state, C = CREATION, rng = Math.random) {
  const { culture } = resolveOrigin(state, C);
  state.chars.rolled = Object.fromEntries(CHARS.map(c => [c, rollDice(culture.characteristics[c], rng)]));
}

/** Valeurs choisies ou tirées, avant modificateur culturel. */
export function baseCharacteristics(state) {
  return state.method === "random" ? (state.chars.rolled ?? null) : state.chars.built;
}

/** Caractéristiques à 14 ans (avec le modificateur culturel). */
export function characteristicsAt14(state, C = CREATION) {
  const base = baseCharacteristics(state);
  if (!base) return null;
  const { culture } = resolveOrigin(state, C);
  return Object.fromEntries(CHARS.map(c => [c, (Number(base[c]) || 0) + (culture.modifiers?.[c] ?? 0)]));
}

/** Caractéristiques finales (après l'apprentissage). */
export function finalCharacteristics(state, C = CREATION) {
  const at14 = characteristicsAt14(state, C);
  if (!at14) return null;
  const { culture } = resolveOrigin(state, C);
  return Object.fromEntries(CHARS.map(c => [c,
    Math.min(culture.maxima?.[c] ?? 99, at14[c] + (Number(state.apprentice.chars[c]) || 0))]));
}

export function derivedFrom(ch) {
  if (!ch) return null;
  const hp = ch.con + ch.siz;
  const dmg = roundPendragon((ch.str + ch.siz) / 6);
  return {
    knockdown: ch.siz, majorWound: ch.con, damage: `${dmg}D6`, brawl: dmg,
    move: roundPendragon((ch.str + ch.dex) / 2) + 5, hp, unconscious: roundPendragon(hp / 4),
    healRate: roundPendragon(ch.con / 5)
  };
}

/* -------------------------------------------- */
/*  Traits                                       */
/* -------------------------------------------- */

/** Valeurs (côté gauche) avant les points de création. */
export function traitBase(state, C = CREATION) {
  if (state.method === "random") return state.traits.rolled ?? null;
  const { religion } = resolveOrigin(state, C);
  const b = C.budgets;
  const out = Object.fromEntries(PDVF.traits.map(t => [t, 10]));
  for (const v of religion.virtues ?? []) {
    const [id, side] = v.split(".");
    out[id] = side === "left" ? b.traitVirtue : 20 - b.traitVirtue;
  }
  out.valorous = Math.max(out.valorous, b.traitValorous);
  return out;
}

export function rollTraits(state, C = CREATION, rng = Math.random) {
  const { religion } = resolveOrigin(state, C);
  const virtues = new Set(religion.virtues ?? []);
  state.traits.rolled = Object.fromEntries(PDVF.traits.map(t => {
    let v = rollDice(t === "valorous" ? "2d6+8" : "2d6+3", rng);
    if (virtues.has(`${t}.left`)) v += 3;
    if (virtues.has(`${t}.right`)) v -= 3;
    return [t, v];
  }));
}

/** Valeurs à la fin de la création (avant l'apprentissage). */
export function traitsAfterCreation(state, C = CREATION) {
  const base = traitBase(state, C);
  if (!base) return null;
  const out = { ...base };
  if (state.method === "built") {
    if (state.traits.famous) {
      const [id, side] = state.traits.famous.split(".");
      out[id] = side === "left" ? C.budgets.traitFamous : 20 - C.budgets.traitFamous;
    }
    for (const id of PDVF.traits) {
      out[id] += (Number(state.traits.points[`${id}.left`]) || 0) - (Number(state.traits.points[`${id}.right`]) || 0);
    }
  }
  return out;
}

export function finalTraits(state, C = CREATION) {
  const t = traitsAfterCreation(state, C);
  if (!t) return null;
  const out = { ...t };
  for (const id of PDVF.traits) {
    out[id] += (Number(state.apprentice.traits[`trait.${id}.left`]) || 0) - (Number(state.apprentice.traits[`trait.${id}.right`]) || 0);
  }
  return out;
}

/* -------------------------------------------- */
/*  Passions                                     */
/* -------------------------------------------- */

/** Lignes de passions : Honneur, passions de départ, culturelles et ajoutées. */
export function passionRows(state, C = CREATION) {
  const { klass, religion, homeland } = resolveOrigin(state, C);
  const rows = [{ key: "honor", court: "", name: "Honneur", built: C.honor.built, random: C.honor.random, honor: true }];
  C.passions.forEach((p, i) => {
    let { court, name } = p;
    if (p.key === "loyalty") ({ court, name } = klass.loyalty);
    if (p.key === "deity") name = religion.deity ?? "Dévotion (Déité)";
    rows.push({ key: `base.${i}`, court, name, built: p.built, random: p.random });
  });
  (homeland?.passions ?? []).forEach((p, i) => rows.push({ key: `home.${i}`, court: p.court, name: p.name, built: p.built, random: p.random }));
  state.passions.extra.forEach((p, i) => rows.push({ key: `extra.${i}`, court: p.court, name: p.name, built: 0, random: "0", extra: true }));

  const rolled = state.passions.rolled ?? {};
  for (const r of rows) {
    r.base = state.method === "random" ? (r.extra ? 0 : (rolled[r.key] ?? null)) : r.built;
    r.points = Number(state.passions.points[r.key]) || 0;
    r.afterCreation = r.base === null ? null : r.base + r.points;
    r.apprentice = Number(state.apprentice.traits[`passion.${r.key}`]) || 0;
    r.final = r.afterCreation === null ? null : r.afterCreation + r.apprentice;
  }
  return rows;
}

export function rollPassions(state, C = CREATION, rng = Math.random) {
  const rows = passionRows(state, C);
  state.passions.rolled = Object.fromEntries(rows.filter(r => !r.extra).map(r => [r.key, rollDice(r.random, rng)]));
  state.passions.pool = rollDice(C.budgets.passionPointsRandom, rng);
}

export function passionPool(state, C = CREATION) {
  return state.method === "random" ? (state.passions.pool ?? 0) : C.budgets.passionPointsBuilt;
}

/* -------------------------------------------- */
/*  Particularité familiale                      */
/* -------------------------------------------- */

export function rollFamilyTrait(state, C = CREATION, rng = Math.random) {
  const first = rollDice("1d20", rng);
  const rolls = { first, extra: [] };
  if (first === 20) rolls.extra = [rollDice("1d20", rng), rollDice("1d20", rng)];
  state.familyTrait.rolls = rolls;
}

/** Particularité retenue : libellé, compétences favorisées, beauté transcendante. */
export function familyTraitResult(state, C = CREATION) {
  const byR = (r) => C.familyTraits.find(t => t.r === r);
  let rolls;
  if (state.method === "random") rolls = state.familyTrait.rolls;
  else rolls = state.familyTrait.id ? { first: Number(state.familyTrait.id), extra: [] } : null;
  if (!rolls) return null;
  const first = byR(rolls.first);
  if (!first?.gifted) return { label: first.label, skills: [first.skill], gifted: false, beauty: 0 };
  const extras = rolls.extra.map(byR);
  const twenties = extras.filter(t => t?.gifted).length;
  const kept = extras.filter(t => t && !t.gifted);
  return {
    label: `Doué (${[...kept.map(t => t.label), ...(twenties ? ["Beauté transcendante"] : [])].join(", ")})`,
    skills: kept.map(t => t.skill),
    gifted: true,
    beauty: twenties === 2 ? 10 : twenties === 1 ? 5 : 0
  };
}

/* -------------------------------------------- */
/*  Compétences                                  */
/* -------------------------------------------- */

function formulaValue(formula, ch) {
  if (typeof formula === "number") return formula;
  const m = String(formula).match(/^(siz|dex|str|con|app)([/-])(\d+)$/);
  if (!m) return Number(formula) || 0;
  const v = ch[m[1]];
  return m[2] === "/" ? roundPendragon(v / Number(m[3])) : v - Number(m[3]);
}

export function skillRows(state, C = CREATION) {
  const ch = characteristicsAt14(state, C);
  if (!ch) return [];
  const { fn, culture } = resolveOrigin(state, C);
  const cultureMods = culture.skillModifiers?.[fn.skillModifiers] ?? {};
  const family = familyTraitResult(state, C);
  const familySkills = new Set(family?.skills ?? []);
  return Object.keys(PDVF.skills).map(id => {
    const formula = C.startingSkills[id] ?? 0;
    const start = formulaValue(formula, ch);
    const culture = cultureMods[id] ?? 0;
    const familyBonus = familySkills.has(id) ? C.familyTraitBonus : 0;
    const points = Number(state.skills.points[id]) || 0;
    const apprentice = Number(state.apprentice.skills[id]) || 0;
    const attLinked = String(formula).startsWith("app");
    return {
      id, group: PDVF.skills[id].group, formula, start, culture, family: familyBonus, points, apprentice,
      attLinked, knight: C.knighthood.weapons.includes(id) || C.knighthood.others.includes(id),
      afterCreation: start + culture + familyBonus + points,
      final: start + culture + familyBonus + points + apprentice
    };
  });
}

/* -------------------------------------------- */
/*  Plafonds des boutons +                       */
/* -------------------------------------------- */

/**
 * Nombre maximal de points que chaque compteur de l'assistant peut recevoir,
 * compte tenu du budget restant et des plafonds des règles (15 pour une compétence
 * ou un trait à la création, ATT pour les compétences liées à l'ATT, 19 et 20 pour
 * l'apprentissage, maximum culturel des caractéristiques).
 * @returns {Record<string, number>} clé = chemin du compteur
 */
export function pointCaps(state, C = CREATION) {
  const b = C.budgets;
  const caps = {};
  const cap = (points, ...limits) => Math.max(0, Math.min(...limits.map(l => points + l).filter(Number.isFinite)));
  const { culture } = resolveOrigin(state, C);

  // Caractéristiques (méthode construite)
  const charLeft = b.characteristics - sum(state.chars.built);
  for (const c of CHARS) {
    const v = Number(state.chars.built[c]) || 0;
    caps[`chars.built.${c}`] = Math.min(b.characteristicMax, v + Math.max(0, charLeft));
  }

  // Traits (méthode construite) : 15 au plus, rien sur le trait à 16 ni sur son opposé
  const after = traitsAfterCreation(state, C);
  const traitLeft = b.traitPoints - sum(state.traits.points);
  const famousId = state.traits.famous?.split(".")[0];
  for (const id of PDVF.traits) {
    for (const side of ["left", "right"]) {
      const key = `${id}.${side}`;
      const pts = Number(state.traits.points[key]) || 0;
      if (!after || id === famousId) { caps[`traits.points.${key}`] = 0; continue; }
      const value = traitPair(after[id])[side];
      caps[`traits.points.${key}`] = cap(pts, traitLeft, b.traitMax - value);
    }
  }

  // Passions
  const passionLeft = passionPool(state, C) - sum(state.passions.points);
  const rows = passionRows(state, C);
  for (const r of rows) {
    caps[`passions.points.${r.key}`] = cap(r.points, passionLeft, r.afterCreation === null ? Infinity : b.passionMax - r.afterCreation);
  }

  // Compétences : 15 au plus ; ATT au plus (hors bonus) pour celles qui en dépendent
  const att = characteristicsAt14(state, C)?.app ?? 0;
  const skills = skillRows(state, C);
  const skillLeft = b.skillPoints - sum(state.skills.points);
  const a = state.apprentice;
  const appSkillLeft = (Number(a.alloc.skills) || 0) * b.apprenticeSkillPoints - sum(a.skills);
  for (const s of skills) {
    const attRoom = s.attLinked ? att - (s.start + s.points + s.apprentice) : Infinity;
    caps[`skills.points.${s.id}`] = s.start === 0 ? 0 : cap(s.points, skillLeft, b.skillMax - s.final, attRoom);
    caps[`apprentice.skills.${s.id}`] = s.start === 0 ? 0 : cap(s.apprentice, appSkillLeft, b.skillMax - s.final, attRoom);
  }

  // Années d'apprentissage
  const years = Number(a.years) || 0;
  for (const k of ["skills", "traits", "chars"]) {
    caps[`apprentice.alloc.${k}`] = cap(Number(a.alloc[k]) || 0, years - sum(a.alloc));
  }

  // Traits et passions pendant l'apprentissage : 19 et 20
  const finalT = finalTraits(state, C);
  const appTraitLeft = (Number(a.alloc.traits) || 0) - sum(a.traits);
  for (const id of PDVF.traits) {
    for (const side of ["left", "right"]) {
      const key = `trait.${id}.${side}`;
      const pts = Number(a.traits[key]) || 0;
      const value = finalT ? traitPair(finalT[id])[side] : 0;
      caps[`apprentice.traits.${key}`] = cap(pts, appTraitLeft, b.apprenticeTraitMax - value);
    }
  }
  for (const r of rows) {
    caps[`apprentice.traits.passion.${r.key}`] = cap(r.apprentice, appTraitLeft, r.final === null ? Infinity : b.apprenticePassionMax - r.final);
  }

  // Caractéristiques pendant l'apprentissage : maximum culturel
  const at14 = characteristicsAt14(state, C);
  const appCharLeft = (Number(a.alloc.chars) || 0) - sum(a.chars);
  for (const c of CHARS) {
    const pts = Number(a.chars[c]) || 0;
    const room = at14 && culture.maxima?.[c] !== undefined ? culture.maxima[c] - (at14[c] + pts) : Infinity;
    caps[`apprentice.chars.${c}`] = cap(pts, appCharLeft, room);
  }

  return caps;
}

/* -------------------------------------------- */
/*  Apprentissage et âge                         */
/* -------------------------------------------- */

export function ageOf(state) {
  return 14 + (Number(state.apprentice.years) || 0);
}

export function knighthoodCheck(state, C = CREATION) {
  const k = C.knighthood;
  const skills = Object.fromEntries(skillRows(state, C).map(s => [s.id, s.final]));
  const weapons = k.weapons.map(id => ({ id, value: skills[id] ?? 0, ok: (skills[id] ?? 0) >= k.minValue }));
  const others = k.others.map(id => ({ id, value: skills[id] ?? 0, ok: (skills[id] ?? 0) >= k.minValue }));
  const age = ageOf(state);
  const othersOk = others.filter(o => o.ok).length >= k.othersNeeded;
  return {
    age, ageOk: age >= k.minAge, weapons, others, othersOk,
    eligible: age >= k.minAge && weapons.every(w => w.ok) && othersOk
  };
}

/* -------------------------------------------- */
/*  Validation par étape                         */
/* -------------------------------------------- */

/**
 * @returns {{errors: string[], warnings: string[]}}
 */
export function validateStep(step, state, C = CREATION) {
  const errors = [];
  const warnings = [];
  const b = C.budgets;

  switch (step) {
    case "origin":
      if (!state.origin.name?.trim()) errors.push("Donnez un nom au personnage.");
      break;

    case "characteristics": {
      if (state.method === "random") {
        if (!state.chars.rolled) errors.push("Lancez les dés pour les caractéristiques.");
        break;
      }
      const spent = sum(state.chars.built);
      if (spent !== b.characteristics) errors.push(`Répartissez exactement ${b.characteristics} points (actuellement ${spent}).`);
      for (const c of CHARS) {
        const v = state.chars.built[c];
        if (v < b.characteristicMin || v > b.characteristicMax) errors.push(`Chaque caractéristique doit valoir de ${b.characteristicMin} à ${b.characteristicMax}.`);
      }
      break;
    }

    case "traits": {
      if (state.method === "random") {
        if (!state.traits.rolled) errors.push("Lancez les dés pour les traits.");
        break;
      }
      if (!state.traits.famous) errors.push("Choisissez le trait porté à 16.");
      const spent = sum(state.traits.points);
      if (spent > b.traitPoints) errors.push(`Vous ne disposez que de ${b.traitPoints} points.`);
      else if (spent < b.traitPoints) warnings.push(`Il reste ${b.traitPoints - spent} point(s) de trait à répartir.`);
      const t = traitsAfterCreation(state, C);
      for (const id of PDVF.traits) {
        const pair = traitPair(t[id]);
        for (const side of ["left", "right"]) {
          if (`${id}.${side}` === state.traits.famous) continue;
          if (pair[side] > b.traitMax && (state.traits.points[`${id}.${side}`] ?? 0) > 0) {
            errors.push("Les points répartis ne peuvent pas porter un trait au-delà de 15.");
          }
        }
      }
      if (state.traits.famous) {
        const [id, side] = state.traits.famous.split(".");
        if (traitPair(t[id])[side] !== b.traitFamous) errors.push("Le trait porté à 16 ne doit pas être modifié par les points.");
      }
      break;
    }

    case "passions": {
      if (state.method === "random" && !state.passions.rolled) { errors.push("Lancez les dés pour les passions."); break; }
      const pool = passionPool(state, C);
      const spent = sum(state.passions.points);
      if (spent > pool) errors.push(`Vous ne disposez que de ${pool} points.`);
      else if (spent < pool) warnings.push(`Il reste ${pool - spent} point(s) de passion à répartir.`);
      for (const r of passionRows(state, C)) {
        if (r.points > 0 && r.afterCreation > b.passionMax) errors.push(`${r.name} : les points ne peuvent pas porter une passion au-delà de ${b.passionMax}.`);
        if (r.extra && !r.name?.trim()) errors.push("Donnez un nom à chaque passion ajoutée.");
      }
      for (const court of PDVF.passionCourts) {
        const total = passionRows(state, C).filter(r => r.court === court).reduce((s, r) => s + (r.afterCreation ?? 0), 0);
        if (total > PDVF.passionCourtMax) warnings.push(`La cour ${court.charAt(0).toUpperCase() + court.slice(1)} dépasse ${PDVF.passionCourtMax} (${total}).`);
      }
      break;
    }

    case "family": {
      const f = state.family;
      if (f.mode === "history" && f.chosen === null) errors.push("Choisissez l'une des trois familles.");
      if (f.mode === "quick" && f.quickParentGlory === null) errors.push("Lancez les dés pour la Gloire du parent.");
      break;
    }

    case "skills": {
      if (!familyTraitResult(state, C)) errors.push(state.method === "random" ? "Lancez le dé pour la particularité familiale." : "Choisissez une particularité familiale.");
      const spent = sum(state.skills.points);
      if (spent > b.skillPoints) errors.push(`Vous ne disposez que de ${b.skillPoints} points.`);
      else if (spent < b.skillPoints) warnings.push(`Il reste ${b.skillPoints - spent} point(s) de compétence à répartir.`);
      skillErrors(state, C, "points", errors);
      break;
    }

    case "apprentice": {
      const a = state.apprentice;
      const years = Number(a.years) || 0;
      const allocated = sum(a.alloc);
      if (allocated !== years) errors.push(`Attribuez chacune des ${years} années (actuellement ${allocated}).`);
      const skillPool = (Number(a.alloc.skills) || 0) * b.apprenticeSkillPoints;
      if (sum(a.skills) > skillPool) errors.push(`Trop de points de compétence (${sum(a.skills)} pour ${skillPool}).`);
      if (sum(a.traits) > (Number(a.alloc.traits) || 0)) errors.push("Trop de points de traits et passions.");
      if (sum(a.chars) > (Number(a.alloc.chars) || 0)) errors.push("Trop de points de caractéristiques.");
      if (sum(a.skills) < skillPool) warnings.push(`Il reste ${skillPool - sum(a.skills)} point(s) de compétence d'écuyer.`);
      skillErrors(state, C, "apprentice", errors);
      const t = finalTraits(state, C);
      for (const id of PDVF.traits) {
        const pair = traitPair(t[id]);
        for (const side of ["left", "right"]) {
          if ((a.traits[`trait.${id}.${side}`] ?? 0) > 0 && pair[side] > b.apprenticeTraitMax) errors.push(`Un trait ne peut pas dépasser ${b.apprenticeTraitMax} par l'apprentissage.`);
        }
      }
      for (const r of passionRows(state, C)) {
        if (r.apprentice > 0 && r.final > b.apprenticePassionMax) errors.push(`${r.name} ne peut pas dépasser ${b.apprenticePassionMax}.`);
      }
      const { culture } = resolveOrigin(state, C);
      const at14 = characteristicsAt14(state, C);
      for (const c of CHARS) {
        if (at14 && at14[c] + (Number(a.chars[c]) || 0) > (culture.maxima?.[c] ?? 99)) errors.push("Une caractéristique dépasse le maximum de sa culture.");
      }
      if (!knighthoodCheck(state, C).eligible) warnings.push("Le personnage ne remplit pas encore les conditions de l'adoubement.");
      break;
    }

    case "details": {
      const need = featureNeeds(state, C);
      const filled = (state.details.features ?? []).filter(f => f?.trim()).length;
      if (need && filled < need.positive + need.negative) warnings.push("Tous les signes distinctifs ne sont pas renseignés.");
      break;
    }
  }
  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}

/** Limites des points de compétence (création ou apprentissage). */
function skillErrors(state, C, which, errors) {
  const b = C.budgets;
  const att = characteristicsAt14(state, C)?.app ?? 0;
  for (const s of skillRows(state, C)) {
    const added = which === "points" ? s.points : s.apprentice;
    if (added <= 0) continue;
    if (s.start === 0) errors.push("Une compétence dont la valeur de départ est 0 ne peut pas être augmentée.");
    const total = which === "points" ? s.afterCreation : s.final;
    if (total > b.skillMax) errors.push(`Une compétence ne peut pas dépasser ${b.skillMax}.`);
    if (s.attLinked && s.start + s.points + s.apprentice > att) errors.push("Une compétence liée à l'ATT ne peut pas dépasser l'ATT (hors bonus).");
  }
}

/* -------------------------------------------- */
/*  Détails, idéaux, Gloire                      */
/* -------------------------------------------- */

export function featureNeeds(state, C = CREATION) {
  const ch = finalCharacteristics(state, C);
  if (!ch) return null;
  return C.features.find(f => ch.app <= f.max) ?? C.features[C.features.length - 1];
}

export function eligibleIdeals(state, C = CREATION) {
  const traits = finalTraits(state, C);
  if (!traits) return [];
  const sideValue = (key) => { const [id, side] = key.split("."); return traitPair(traits[id])[side]; };
  const passions = passionRows(state, C);
  const passionValue = (name) => passions.find(p => p.name === name)?.final ?? 0;
  const { religion } = resolveOrigin(state, C);
  const skills = Object.fromEntries(skillRows(state, C).map(s => [s.id, s.final]));
  return C.ideals.filter(ideal => {
    if (ideal.traits && ideal.traits.reduce((s, k) => s + sideValue(k), 0) < ideal.total) return false;
    if (ideal.religionVirtues && !(religion.virtues ?? []).every(v => sideValue(v) >= ideal.religionVirtues)) return false;
    if (ideal.deityMin && passionValue(religion.deity) < ideal.deityMin) return false;
    for (const p of ideal.passions ?? []) {
      const v = p.prefix ? Math.max(0, ...passions.filter(x => x.name.startsWith(p.prefix)).map(x => x.final ?? 0)) : passionValue(p.name);
      if (v < p.min) return false;
    }
    for (const s of ideal.skills ?? []) if ((skills[s.id] ?? 0) < s.min) return false;
    return true;
  });
}

export function inheritedGlory(state) {
  const f = state.family;
  if (f.mode === "history" && f.chosen !== null) return f.proposals?.[f.chosen]?.pc?.inheritedGlory ?? 0;
  if (f.mode === "quick" && f.quickParentGlory !== null) return Math.min(4000, Math.round(f.quickParentGlory / 4));
  if (f.mode === "manual") return Math.min(4000, Math.round((Number(f.manualGlory) || 0) / 4));
  return 0;
}

export function knightingGlory(state, C = CREATION) {
  const { klass } = resolveOrigin(state, C);
  const k = C.knighthood;
  const lord = Math.min(k.lordShareMax, Math.round((Number(state.details.lordGlory) || 0) / k.lordShare));
  return { base: k.glory, lord, klass: klass.knightingGlory ?? 0, total: k.glory + lord + (klass.knightingGlory ?? 0) };
}

/** Saut en selle : test de DEX ; succès +25, critique +50. */
export function rollJump(state, C = CREATION, rng = Math.random) {
  const dex = finalCharacteristics(state, C)?.dex ?? 0;
  const die = rollDice("1d20", rng);
  let outcome = "failure";
  if (dex >= 20 ? die === 20 : die === dex) outcome = "critical";
  else if (die < dex) outcome = "success";
  else if (die === 20) outcome = "fumble";
  state.details.jump = { die, dex, outcome, glory: outcome === "critical" ? 50 : outcome === "success" ? 25 : 0 };
}

export function rollLuck(state, C = CREATION, rng = Math.random) {
  state.details.luck = rollDice("1d20", rng);
}

export function rollReligion(state, C = CREATION, rng = Math.random) {
  const { culture } = resolveOrigin(state, C);
  const r = rollDice("1d6", rng);
  const row = (culture.religions ?? []).find(x => r >= x.r[0] && r <= x.r[1]);
  if (row) state.origin.religion = row.id;
  return r;
}

export function randomName(state, C = CREATION, rng = Math.random) {
  const list = C.names[state.origin.sex === "female" ? "female" : "male"];
  state.origin.name = list[Math.floor(rng() * list.length)];
}

/* -------------------------------------------- */
/*  Résultat final                               */
/* -------------------------------------------- */

/**
 * Données à écrire sur l'acteur.
 * @param {object} state
 * @param {number} year  année de jeu en cours
 */
export function buildCharacter(state, year, C = CREATION, { skillLabel = (id) => id } = {}) {
  const o = resolveOrigin(state, C);
  const ch = finalCharacteristics(state, C);
  const traits = finalTraits(state, C);
  const passions = passionRows(state, C);
  const skills = skillRows(state, C);
  const age = ageOf(state);
  const born = year - age;
  const knight = knighthoodCheck(state, C);
  const knighted = !!(state.details.knighted && knight.eligible);
  const family = familyTraitResult(state, C);
  const feat = featureNeeds(state, C);
  const titles = o.fn.title ?? { male: "sire", female: "dame" };

  const chronicle = [];
  if (state.family.mode !== "history") {
    const g = inheritedGlory(state);
    if (g) chronicle.push({ year: born + 14, event: "Gloire héritée (le quart de celle du parent)", living: "", glory: g });
  }
  if (knighted) {
    const kg = knightingGlory(state, C);
    chronicle.push({ year, event: `Adoubement (${kg.base}${kg.lord ? ` + ${kg.lord} du seigneur` : ""}${kg.klass ? ` + ${kg.klass} de maisonnée` : ""})`, living: "Ordinaire", glory: kg.total });
    if (state.details.jump?.glory) chronicle.push({ year, event: state.details.jump.outcome === "critical" ? "Saut en selle, avec une aisance remarquée" : "Saut en selle réussi", living: "", glory: state.details.jump.glory });
  }

  const notes = [];
  notes.push(`Équipement : ${knighted ? C.equipment.knight : C.equipment.squire}`);
  if (knighted && o.klass.horses) notes.push(`Chevaux : ${C.equipment.horses}`);
  const luck = state.details.luck ? C.luck.find(l => l.r === state.details.luck) : null;
  if (luck) notes.push(`Chance du débutant : ${luck.item} (${luck.value}) — ${luck.effect}.`);
  if (family?.beauty) notes.push(`Beauté transcendante : +${family.beauty} aux passions d'Adoration qu'elle inspire (non héréditaire).`);
  if (state.details.jump?.outcome === "fumble") notes.push("Le saut en selle a tourné à la farce : la cour en parlera pendant un an.");

  const homeland = o.homeland;
  return {
    name: state.origin.name.trim(),
    system: {
      biography: {
        title: state.origin.sex === "female" ? titles.female : titles.male,
        born, heir: true,
        homeland: homeland?.label ?? "",
        lord: homeland?.lord ?? "",
        knightClass: knighted ? o.klassId : "squire",
        culture: o.culture.adjective ?? o.culture.label,
        religion: o.religionId,
        distinctiveFeatures: (state.details.features ?? []).filter(f => f?.trim()).join(", ")
      },
      heraldry: { blazon: state.details.blazon ?? "", motto: state.details.motto ?? "" },
      characteristics: Object.fromEntries(Object.entries(ch).map(([k, v]) => [k, { value: v }])),
      health: { hp: { value: ch.con + ch.siz } },
      skills: Object.fromEntries(skills.map(s => [s.id, { value: s.final, xp: false }])),
      traits: Object.fromEntries(PDVF.traits.map(t => [t, { value: traits[t], xpLeft: false, xpRight: false }])),
      honor: { value: passions.find(p => p.honor).final, xp: false },
      passions: passions.filter(p => !p.honor).map(p => ({ court: p.court, name: p.name.trim(), value: p.final, xp: false })),
      ideal: state.details.ideal ?? "",
      dates: { squired: born + 14, knighted: knighted ? year : null },
      family: { characteristic: family ? `${family.label}${family.skills.length ? ` (+${C.familyTraitBonus} en ${family.skills.map(skillLabel).join(" et ")})` : ""}` : "" },
      chronicle,
      notes: notes.join("\n\n")
    },
    meta: { knighted, age, born, featureCategory: feat?.label ?? "" }
  };
}
