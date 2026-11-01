/**
 * Dégâts, blessures et soins sur un acteur (chevalier ou PNJ) : Chute, armure et bouclier,
 * blessure notée, Blessure majeure ou mortelle, inconscience ; Premiers soins ; semaine de
 * convalescence ; annulation.
 */
import { PDVF, SYSTEM_ID } from "../config.mjs";
import { resolveTest } from "../rules/resolution.mjs";
import { protection } from "../rules/equipment.mjs";
import * as W from "../rules/wounds.mjs";
import { STATUS, hasStatus, setStatus } from "./status.mjs";

const L = (k) => game.i18n.localize(k);
const F = (k, d) => game.i18n.format(k, d);
const CHARS = ["siz", "dex", "str", "con", "app"];

/* -------------------------------------------- */
/*  Valeurs de combat d'un acteur                */
/* -------------------------------------------- */

/** Nom de compétence d'un PNJ (« Équitation », « Premiers soins ») → valeur, ou null. */
function npcSkill(actor, id) {
  const label = L(`PDVF.Skill.${id}`).toLowerCase();
  const row = (actor.system.skills ?? []).find(s => (s.name ?? "").toLowerCase().startsWith(label));
  return row ? Number(row.value) || 0 : null;
}

/** Cheval monté : le cheval principal du chevalier. */
export function mountOf(actor) {
  const uuid = actor?.system?.mainHorse;
  if (!uuid) return null;
  try { return globalThis.fromUuidSync?.(uuid) ?? null; } catch (e) { return null; }
}

/**
 * Valeurs utiles au combat, quel que soit le type d'acteur.
 */
export function combatStats(actor) {
  const s = actor.system;
  const knight = actor.type === "chevalier";
  const d = s.derived ?? {};
  const dex = Number(s.characteristics?.dex?.value) || 0;
  let armor = 0, shield = 0, shieldItem = null, mail = false, plate = false, shieldInfo = null, worn = 0;
  // Armure de vertu du chevalier Courtois (Livre du joueur, p. 127) : s'ajoute à l'armure portée et
  // arrête aussi les dégâts qui ignorent l'armure (chutes…).
  const virtueArmor = knight ? Number(d.virtueArmor) || 0 : 0;
  if (knight) {
    const p = protection(actor.items.contents);
    worn = p.armor;
    armor = p.armor + virtueArmor; shield = p.shield; shieldItem = p.shieldItem; mail = p.mail; plate = p.plate;
    shieldInfo = shieldItem ? { mountedPenalty: shieldItem.system.mountedPenalty, chargeExempt: shieldItem.system.chargeExempt, noMissile: shieldItem.system.noMissile, rangedPenalty: shieldItem.system.rangedPenalty } : null;
  } else {
    armor = Number(s.armor?.value) || 0;
    worn = armor;
    shield = Number(s.armor?.shield) || 0;
    const desc = s.armor?.description ?? "";
    mail = /maill|haubert|haubergeon|broigne/i.test(desc);
    plate = /plates/i.test(desc);
  }
  const horse = knight ? mountOf(actor) : null;
  const npcCharge = !knight ? (s.attacks ?? []).find(a => /charge/i.test(a.skill ?? ""))?.damage ?? "" : "";
  return {
    knight, name: actor.name,
    siz: Number(d.knockdown) || Number(s.characteristics?.siz?.value) || 0,
    majorWound: Number(d.majorWound) || Number(s.characteristics?.con?.value) || 0,
    hpTotal: Number(knight ? d.hpMax : d.hp) || 0,
    hp: Number(s.health?.hp?.value) || 0,
    unconsciousAt: Number(d.unconscious) || 0,
    healRate: Number(d.healRate) || 1,
    dex,
    move: Number(d.move) || 0,
    horsemanship: knight ? Number(s.skills?.horsemanship?.value) || 0 : (npcSkill(actor, "horsemanship") ?? 99),
    firstAid: knight ? Number(s.skills?.firstAid?.value) || 0 : npcSkill(actor, "firstAid"),
    chirurgery: knight ? Number(s.skills?.chirurgery?.value) || 0 : npcSkill(actor, "chirurgery"),
    brawl: knight ? Number(d.brawlDamage) || 0 : (Number(String(d.damage ?? "").match(/^(\d+)/)?.[1]) || 0),
    damageDice: knight ? Number(d.damageDice) || 0 : (Number(String(d.damage ?? "").match(/^(\d+)/)?.[1]) || 0),
    armor, virtueArmor, shield, shieldItem, shieldInfo, mail, plate, unarmored: worn === 0,
    mounted: hasStatus(actor, STATUS.mounted),
    prone: hasStatus(actor, STATUS.prone),
    disarmed: hasStatus(actor, STATUS.disarmed),
    unconscious: hasStatus(actor, STATUS.unconscious),
    horse, horseCharge: knight ? (horse?.system?.charge ?? "") : npcCharge,
    horseMove: horse ? Number(horse.system?.derived?.move) || 0 : 0,
    debilitated: !!s.health?.debilitated
  };
}

/* -------------------------------------------- */
/*  Petits outils                                */
/* -------------------------------------------- */

async function roll(formula) {
  const r = new Roll(String(formula).replace(/D/g, "d"));
  await r.evaluate();
  return r;
}

/** Test d'une valeur (d20) : { roll, result }. */
export async function testValue(value, modifier = 0) {
  const r = await roll("1d20");
  return { roll: r, result: resolveTest(value, modifier, r.total) };
}

const outcomeLabel = (o) => L(`PDVF.Outcome.${o}`);

/** Instantané de ce qu'un dégât peut changer, pour l'annulation. */
function snapshot(actor) {
  return {
    actor: actor.uuid,
    health: foundry.utils.deepClone(actor._source.system.health),
    chars: Object.fromEntries(CHARS.filter(c => actor._source.system.characteristics?.[c]).map(c => [c, actor._source.system.characteristics[c].value])),
    statuses: [STATUS.mounted, STATUS.disarmed, STATUS.prone, STATUS.unconscious, STATUS.dead].filter(id => hasStatus(actor, id)),
    npcShield: actor.type === "pnj" ? actor._source.system.armor?.shield ?? 0 : null,
    items: []
  };
}

/** Dégâts d'une chute, diminués de l'armure de vertu (qui arrête même ce que l'armure n'arrête pas). */
function fallDamage(rolled, st, lines, actor) {
  const v = Number(st.virtueArmor) || 0;
  if (!v) return rolled;
  const real = Math.max(0, rolled - v);
  lines.push(F("PDVF.Combat.Line.VirtueArmor", { name: actor.name, rolled, armor: v, real }));
  return real;
}

function newWound(damage, type, source) {
  const day = (() => { try { return Number(game.settings.get(SYSTEM_ID, "currentDay")) || null; } catch (e) { return null; } })();
  return { id: foundry.utils.randomID(), damage, type, source, aided: false, day };
}

/**
 * Un PNJ à 0 point de vie ou moins est mort (les PNJ importants ont une fiche de chevalier
 * et suivent la règle des personnages : mort à minuit sans Premiers soins).
 */
export function diesAtZero(actor) {
  return actor?.type === "pnj";
}

/** Ligne de fin d'un combattant à 0 point de vie ou moins ; vrai s'il meurt sur-le-champ. */
function zeroHp(actor, hp, lines) {
  if (hp > 0) return false;
  if (diesAtZero(actor)) { lines.push(F("PDVF.Combat.Line.Dead", { name: actor.name })); return true; }
  lines.push(F("PDVF.Combat.Line.Dying", { name: actor.name }));
  return false;
}

/** Pose l'état « mort » (et retire « inconscient »). */
async function markDead(actor) {
  await setStatus(actor, STATUS.unconscious, false);
  await setStatus(actor, STATUS.dead, true);
}

/* -------------------------------------------- */
/*  Recevoir des dégâts                          */
/* -------------------------------------------- */

/**
 * Applique un coup à un acteur.
 * @param {Actor} actor
 * @param {object} hit
 * @param {number} hit.base           dégâts de base (avant armure)
 * @param {number} [hit.shield]       protection de bouclier ou de parade qui s'applique (0 sinon)
 * @param {boolean} [hit.shieldIsShield] la protection vient du bouclier (et non d'une parade)
 * @param {boolean} [hit.shieldBreaker] l'arme enfonce les boucliers (1D6 au plus, brisé sur un 1)
 * @param {boolean} [hit.half]        moitié des dégâts (arme émoussée, plat de la lame)
 * @param {boolean} [hit.ignoreArmor]
 * @param {boolean} [hit.knockdown]   vérifier la Chute (oui par défaut)
 * @param {string} [hit.source]
 * @param {object} [undo]             instantané à compléter (sinon un nouveau)
 * @returns {Promise<{lines:string[], rolls:Roll[], undo:object, real:number, type:string, out:boolean}>}
 */
export async function receiveDamage(actor, hit, undo = null) {
  const st = combatStats(actor);
  undo ??= snapshot(actor);
  const lines = [];
  const rolls = [];
  const health = foundry.utils.deepClone(actor._source.system.health);
  health.wounds ??= [];
  const chars = {};
  const statusOn = new Set();
  const statusOff = new Set();
  const itemUpdates = [];
  let npcShield = null;
  let mounted = st.mounted;
  const base = Math.max(0, Math.round(Number(hit.base) || 0));
  const source = hit.source ?? "";

  // 1. Chute (dégâts de base contre TAI)
  if (hit.knockdown !== false && base > 0) {
    const k = W.knockdownCheck(base, st.siz);
    let down = k === "auto";
    if (k === "test") {
      const t = await testValue(st.dex);
      rolls.push(t.roll);
      down = !t.result.success;
      lines.push(F("PDVF.Combat.Line.KnockdownTest", { name: actor.name, base, siz: st.siz, die: t.result.die, dex: st.dex, outcome: outcomeLabel(t.result.outcome) }));
    } else if (k === "auto") lines.push(F("PDVF.Combat.Line.KnockdownAuto", { name: actor.name, base, siz: st.siz }));
    if (down) {
      statusOn.add(STATUS.prone);
      if (mounted) {
        mounted = false; statusOff.add(STATUS.mounted); statusOn.add(STATUS.disarmed);
        const f = await roll("1d6");
        rolls.push(f);
        const fall = fallDamage(f.total, st, lines, actor);
        if (fall > 0) health.wounds.push(newWound(fall, "fall", L("PDVF.Combat.Unhorsed")));
        health.hp.value -= fall;
        lines.push(F("PDVF.Combat.Line.Unhorsed", { name: actor.name, damage: fall }));
      } else lines.push(F("PDVF.Combat.Line.Down", { name: actor.name }));
    }
  }

  // 2. Bouclier enfoncé par une hache
  let shield = Math.max(0, Number(hit.shield) || 0);
  if (shield && hit.shieldBreaker && hit.shieldIsShield) {
    const d = await roll("1d6");
    rolls.push(d);
    shield = Math.min(shield, d.total);
    lines.push(F("PDVF.Combat.Line.AxeShield", { die: d.total }));
    if (d.total === 1) {
      lines.push(F("PDVF.Combat.Line.ShieldBroken", { name: actor.name }));
      if (st.shieldItem) itemUpdates.push({ item: st.shieldItem, data: { "system.equipped": false } });
      else if (actor.type === "pnj") npcShield = 0;
    }
  }

  // 3. Dégâts réels, blessure
  const armor = hit.ignoreArmor ? st.virtueArmor : st.armor;
  const real = W.realDamage(base, { armor, shield, half: !!hit.half });
  const type = W.woundType(real, { majorWound: st.majorWound, hpTotal: st.hpTotal });
  lines.push(F("PDVF.Combat.Line.Damage", {
    name: actor.name, base, half: hit.half ? L("PDVF.Combat.Half") : "", armor, shield: shield ? F("PDVF.Combat.ShieldPart", { value: shield }) : "", real
  }));
  if (real > 0) {
    health.wounds.push(newWound(real, type, source));
    health.hp.value -= real;
    lines.push(F(`PDVF.Combat.Line.Wound.${type}`, { name: actor.name, damage: real }));
  }

  // 4. Blessure majeure ou mortelle : Table 11.1
  if (type === "major" || type === "mortal") {
    health.debilitated = true;
    const count = type === "mortal" ? 3 : 1;
    for (let i = 0; i < count; i++) {
      const d = await roll("1d6");
      rolls.push(d);
      const c = W.charLoss(d.total);
      if (c) {
        const cur = chars[c] ?? actor._source.system.characteristics?.[c]?.value ?? 0;
        chars[c] = Math.max(0, cur - 1);
        lines.push(F("PDVF.Combat.Line.CharLoss", { die: d.total, char: L(`PDVF.Char.${c}.long`) }));
      } else lines.push(F("PDVF.Combat.Line.NoCharLoss", { die: d.total }));
    }
  }

  // 5. Inconscience, mort imminente, chute de cheval
  const state = W.stateAfter({ hp: health.hp.value, unconsciousAt: st.unconsciousAt, type, wasUnconscious: st.unconscious, wasDebilitated: health.debilitated });
  if (state.unconscious && !st.unconscious) {
    statusOn.add(STATUS.unconscious);
    health.debilitated = true;
    if (type !== "major" && type !== "mortal") lines.push(F("PDVF.Combat.Line.Unconscious", { name: actor.name }));
    if (mounted) {
      mounted = false; statusOff.add(STATUS.mounted); statusOn.add(STATUS.prone);
      const t = await testValue(st.dex);
      rolls.push(t.roll);
      if (t.result.success) lines.push(F("PDVF.Combat.Line.SoftLanding", { name: actor.name }));
      else {
        const f = await roll("1d6");
        rolls.push(f);
        const fall = fallDamage(f.total, st, lines, actor);
        if (fall > 0) health.wounds.push(newWound(fall, "fall", L("PDVF.Combat.Fall")));
        health.hp.value -= fall;
        lines.push(F("PDVF.Combat.Line.HardLanding", { name: actor.name, damage: fall }));
      }
    }
  }
  if (state.debilitated) health.debilitated = true;
  if (zeroHp(actor, health.hp.value, lines)) {
    statusOn.delete(STATUS.unconscious);
    statusOff.add(STATUS.unconscious);
    statusOn.add(STATUS.dead);
  }

  // 6. Écriture
  const update = { "system.health": health };
  for (const [c, v] of Object.entries(chars)) update[`system.characteristics.${c}.value`] = v;
  if (npcShield !== null) update["system.armor.shield"] = npcShield;
  await actor.update(update);
  for (const { item, data } of itemUpdates) {
    undo.items.push({ actor: actor.uuid, _id: item.id, data: { "system.equipped": item.system.equipped } });
    await item.update(data);
  }
  for (const id of statusOff) await setStatus(actor, id, false);
  for (const id of statusOn) await setStatus(actor, id, true);
  return { lines, rolls, undo, real, type, out: state.unconscious || health.hp.value <= 0, dead: statusOn.has(STATUS.dead) };
}

/**
 * Arme lâchée ou brisée après un échange : état « désarmé » ; une arme brisée perd une unité
 * (ou n'est plus portée s'il n'en reste qu'une).
 */
export async function loseWeapon(actor, item, { broken = false } = {}, undo) {
  if (broken && item && actor.type === "chevalier") {
    undo?.items.push({ actor: actor.uuid, _id: item.id, data: { "system.quantity": item.system.quantity, "system.equipped": item.system.equipped } });
    if (item.system.quantity > 1) await item.update({ "system.quantity": item.system.quantity - 1 });
    else await item.update({ "system.equipped": false });
  }
  await setStatus(actor, STATUS.disarmed, true);
}

/** Annule ce qu'un dégât ou un échange a changé. */
export async function undoChanges(records = []) {
  for (const rec of [...records].reverse()) {
    const actor = rec.actor ? await fromUuid(rec.actor) : null;
    if (!actor) continue;
    const update = { "system.health": rec.health };
    for (const [c, v] of Object.entries(rec.chars ?? {})) update[`system.characteristics.${c}.value`] = v;
    if (rec.npcShield !== null && rec.npcShield !== undefined) update["system.armor.shield"] = rec.npcShield;
    await actor.update(update, { diff: false });
    for (const row of rec.items ?? []) await actor.items.get(row._id)?.update(row.data);
    for (const id of [STATUS.mounted, STATUS.disarmed, STATUS.prone, STATUS.unconscious, STATUS.dead]) {
      await setStatus(actor, id, (rec.statuses ?? []).includes(id));
    }
  }
}

/* -------------------------------------------- */
/*  Premiers soins, convalescence, aggravation   */
/* -------------------------------------------- */

/**
 * Premiers soins sur une blessure (p. 199).
 * @param {Actor} patient
 * @param {string} woundId
 * @param {{name:string, value:number, self:boolean}} healer
 */
export async function firstAid(patient, woundId, healer) {
  const health = foundry.utils.deepClone(patient._source.system.health);
  const wound = (health.wounds ?? []).find(w => w.id === woundId);
  if (!wound || wound.aided) return null;
  const st = combatStats(patient);
  const mod = healer.self ? -10 : 0;
  const t = await testValue(healer.value, mod);
  const rolls = [t.roll];
  const res = W.firstAidResult(t.result.outcome, st.healRate);
  const lines = [F("PDVF.Combat.Line.FirstAidTest", { healer: healer.name, value: healer.value, mod: mod ? ` (${mod})` : "", die: t.result.die, outcome: outcomeLabel(t.result.outcome) })];
  wound.aided = true;
  const statusOff = [];
  if (res.heal) {
    const before = health.hp.value;
    health.hp.value = Math.min(st.hpTotal, before + res.heal);
    lines.push(F("PDVF.Combat.Line.Healed", { name: patient.name, heal: health.hp.value - before }));
    if (health.hp.value >= st.unconsciousAt && hasStatus(patient, STATUS.unconscious)) statusOff.push(STATUS.unconscious);
  }
  if (res.lossDice) {
    const r = await roll(res.lossDice);
    rolls.push(r);
    health.hp.value -= r.total;
    health.debilitated = true;
    lines.push(F("PDVF.Combat.Line.FirstAidFumble", { name: patient.name, loss: r.total }));
  }
  const dead = zeroHp(patient, health.hp.value, lines);
  const undo = snapshot(patient);
  await patient.update({ "system.health": health });
  for (const id of statusOff) await setStatus(patient, id, false);
  if (dead) await markDead(patient);
  return { lines, rolls, undo };
}

/**
 * Semaine de convalescence (le dimanche).
 * @param {Actor} actor
 * @param {object} p  { surgeon: {name, value}|null, unsanitary:boolean, rested:boolean, aggravation:number }
 */
export async function convalescence(actor, { surgeon = null, unsanitary = false, rested = true, aggravation = 0 } = {}) {
  const st = combatStats(actor);
  const health = foundry.utils.deepClone(actor._source.system.health);
  const undo = snapshot(actor);
  const lines = [];
  const rolls = [];
  let surgery = null;
  if (health.debilitated && surgeon) {
    const t = await testValue(surgeon.value, unsanitary ? -5 : 0);
    rolls.push(t.roll);
    surgery = t.result.outcome;
    lines.push(F("PDVF.Combat.Line.Surgery", { healer: surgeon.name, value: surgeon.value, mod: unsanitary ? " (−5)" : "", die: t.result.die, outcome: outcomeLabel(surgery) }));
  }
  const plan = W.weekPlan({ debilitated: health.debilitated, surgery, rested });
  const hp0 = health.hp.value;
  if (plan.deteriorate) {
    const r = await roll("1d6");
    rolls.push(r);
    health.hp.value -= r.total;
    health.deterioration = (Number(health.deterioration) || 0) + r.total;
    lines.push(F("PDVF.Combat.Line.Deterioration", { name: actor.name, loss: r.total }));
  }
  if (plan.surgeryLossDice) {
    const r = await roll(plan.surgeryLossDice);
    rolls.push(r);
    health.hp.value -= r.total;
    lines.push(F("PDVF.Combat.Line.SurgeryFumble", { name: actor.name, loss: r.total }));
  }
  if (aggravation > 0) {
    health.hp.value -= aggravation;
    health.aggravation = (Number(health.aggravation) || 0) + aggravation;
    lines.push(F("PDVF.Combat.Line.Aggravation", { name: actor.name, loss: aggravation }));
  }
  if (plan.surgeryHeal) { health.hp.value += st.healRate; lines.push(F("PDVF.Combat.Line.SurgeryHeal", { heal: st.healRate })); }
  if (plan.naturalHeal) { health.hp.value += st.healRate; lines.push(F("PDVF.Combat.Line.NaturalHeal", { heal: st.healRate })); }
  else lines.push(L("PDVF.Combat.Line.NoRest"));
  health.hp.value = Math.min(st.hpTotal, health.hp.value);
  // Les Premiers soins ne valent que pour les blessures du jour : on n'y revient plus.
  for (const w of health.wounds ?? []) w.aided = true;
  const surgeryOk = surgery === "critical" || surgery === "success";
  if (health.debilitated && W.endsDebilitation({ hp: health.hp.value, hpTotal: st.hpTotal, surgeryOk })) {
    health.debilitated = false;
    lines.push(F("PDVF.Combat.Line.Recovered", { name: actor.name }));
  }
  if (health.hp.value >= st.hpTotal) {
    health.wounds = [];
    health.aggravation = 0;
    health.deterioration = 0;
    if (!health.debilitated) lines.push(F("PDVF.Combat.Line.FullHealth", { name: actor.name }));
  }
  lines.push(F("PDVF.Combat.Line.HpChange", { from: hp0, to: health.hp.value, max: st.hpTotal }));
  await actor.update({ "system.health": health });
  if (health.hp.value >= st.unconsciousAt && hasStatus(actor, STATUS.unconscious) && !health.debilitated) await setStatus(actor, STATUS.unconscious, false);
  if (zeroHp(actor, health.hp.value, lines)) await markDead(actor);
  return { lines, rolls, undo };
}

/** Aggravation : points de vie perdus sans nouvelle blessure (p. 192). */
export async function aggravate(actor, points = 1) {
  const health = foundry.utils.deepClone(actor._source.system.health);
  const undo = snapshot(actor);
  health.hp.value -= points;
  health.aggravation = (Number(health.aggravation) || 0) + points;
  await actor.update({ "system.health": health });
  const lines = [F("PDVF.Combat.Line.Aggravation", { name: actor.name, loss: points })];
  if (zeroHp(actor, health.hp.value, lines)) await markDead(actor);
  return { lines, rolls: [], undo };
}

/* -------------------------------------------- */
/*  Carte de chat                                */
/* -------------------------------------------- */

const CARD = `systems/${SYSTEM_ID}/templates/chat/combat-card.hbs`;

/**
 * Publie une carte de combat (dégâts, soins, échange).
 * @param {object} p { actor, title, subtitle, sections:[{title, lines}], rolls, undo:[records], buttons }
 */
export async function postCombatCard({ actor = null, title, subtitle = "", sections = [], rolls = [], undo = [], buttons = [], flags = {} }) {
  const content = await foundry.applications.handlebars.renderTemplate(CARD, { title, subtitle, sections: sections.filter(s => s.lines?.length || s.text), buttons, canUndo: undo.length > 0 });
  return ChatMessage.implementation.create({
    speaker: actor ? ChatMessage.getSpeaker({ actor }) : { alias: L("PDVF.Combat.Title") },
    content, rolls,
    flags: { [SYSTEM_ID]: { kind: "combat", undo, undone: false, ...flags } }
  });
}
