/**
 * Équipement (Livre du joueur, chap. 8 et 9) : dégâts des armes, protection d'armure.
 * Module pur : aucune dépendance à Foundry.
 */

/**
 * Formule de dégâts d'un profil d'arme.
 * @param {object} dmg       { base: "character"|"brawl"|"horse"|"none", dice, flat, max }
 * @param {object} actor     { damageDice, brawl, horseCharge } du porteur
 * @param {object} [opts]
 * @param {number} [opts.quality]  bonus fixe de qualité (« belle épée » : +1)
 * @param {number} [opts.extraDice] dés supplémentaires (contre mailles, à deux mains…)
 * @returns {{formula: string|null, label: string}}  formula null quand elle dépend d'une valeur inconnue
 */
export function damageFormula(dmg, actor = {}, { quality = 0, extraDice = 0 } = {}) {
  const base = dmg?.base ?? "character";
  const dice = (Number(dmg?.dice) || 0) + (Number(extraDice) || 0);
  const flat = (Number(dmg?.flat) || 0) + (Number(quality) || 0);
  const max = Number(dmg?.max) || 0;
  const plus = (n) => (n > 0 ? `+${n}` : n < 0 ? `${n}` : "");
  switch (base) {
    case "character": {
      const own = Number(actor.damageDice) || 0;
      if (!own) return { formula: null, label: describeDamage(dmg, { quality, extraDice }) };
      let n = own + dice;
      if (max > 0) n = Math.min(n, max);
      n = Math.max(1, n);
      return { formula: `${n}D6${plus(flat)}`, label: `${n}D6${plus(flat)}` };
    }
    case "brawl": {
      const b = (Number(actor.brawl) || 0) + flat;
      const f = dice > 0 ? `${dice}D6${plus(b)}` : String(Math.max(0, b));
      return { formula: f, label: f };
    }
    case "horse": {
      const h = String(actor.horseCharge ?? "").trim();
      if (!h) return { formula: null, label: describeDamage(dmg, { quality, extraDice }) };
      const f = `${h}${dice ? `+${dice}D6` : ""}${plus(flat)}`;
      return { formula: f, label: f };
    }
    default: {
      const f = dice > 0 ? `${dice}D6${plus(flat)}` : String(flat);
      return { formula: f, label: f };
    }
  }
}

/** Écriture générique des dégâts (« Personnage +2D6 », « Rixe + 1D6 », « 1D6+10 », « max. 4D6 »). */
export function describeDamage(dmg, { quality = 0, extraDice = 0 } = {}) {
  const base = dmg?.base ?? "character";
  const dice = (Number(dmg?.dice) || 0) + (Number(extraDice) || 0);
  const flat = (Number(dmg?.flat) || 0) + (Number(quality) || 0);
  const max = Number(dmg?.max) || 0;
  const d = dice > 0 ? ` +${dice}D6` : dice < 0 ? ` −${-dice}D6` : "";
  const f = flat > 0 ? ` +${flat}` : flat < 0 ? ` −${-flat}` : "";
  const m = max > 0 ? ` (max. ${max}D6)` : "";
  switch (base) {
    case "character": return `Personnage${d}${f}${m}`;
    case "brawl": return `Rixe${d}${f}`;
    case "horse": return `Charge du cheval${d}${f}`;
    default: return `${dice > 0 ? `${dice}D6` : ""}${flat ? (dice > 0 ? `+${flat}` : String(flat)) : ""}` || "—";
  }
}

/**
 * Profils d'attaque d'une arme : le profil principal, ses variantes (contre mailles, à deux mains)
 * et, s'il y a lieu, le profil de lancer.
 * @param {object} w   système d'un objet « arme »
 * @param {object} actor { damageDice, brawl, horseCharge, skills: {id: valeur} }
 */
export function attackProfiles(w, actor = {}) {
  const quality = Number(w.quality) || 0;
  const skills = actor.skills ?? {};
  const profiles = [];
  const main = damageFormula(w.damage, actor, { quality });
  profiles.push({
    mode: "main", skill: w.skill, skillValue: skills[w.skill] ?? null,
    formula: main.formula, label: main.label, range: w.range ?? "",
    alts: (w.alts ?? []).filter(a => a?.label).map(a => {
      const r = damageFormula(w.damage, actor, { quality, extraDice: a.dice });
      return { label: a.label, formula: r.formula, damage: r.label };
    })
  });
  if (w.thrown?.enabled) {
    const t = damageFormula(w.thrown.damage, actor, { quality });
    profiles.push({
      mode: "thrown", skill: w.thrown.skill || "thrown", skillValue: skills[w.thrown.skill || "thrown"] ?? null,
      formula: t.formula, label: t.label, range: w.thrown.range ?? "", alts: []
    });
  }
  return profiles;
}

/**
 * Protection d'armure d'un porteur : somme des pièces portées (Table 9.1 : les valeurs se cumulent),
 * bouclier à part (il ne compte que sur un succès partiel).
 * @param {object[]} items  objets du porteur ({type, name, system})
 * @returns {{armor:number, shield:number, pieces:object[], shieldItem:object|null, notes:string[], warnings:string[], vigilance:number, moveFoot:number, mail:boolean, plate:boolean}}
 */
export function protection(items = []) {
  const worn = items.filter(i => i.type === "armure" && i.system?.equipped);
  const shields = items.filter(i => i.type === "bouclier" && i.system?.equipped);
  const hasBody = worn.some(i => i.system.kind === "body");
  const pieceValue = (i) => (i.system.kind === "overlay" && hasBody ? Number(i.system.layered) || 0 : Number(i.system.value) || 0);
  const armor = worn.reduce((s, i) => s + pieceValue(i), 0);
  const shieldItem = shields.sort((a, b) => (Number(b.system.value) || 0) - (Number(a.system.value) || 0))[0] ?? null;
  const warnings = [];
  const notes = [];
  const helms = worn.filter(i => i.system.kind === "helm");
  const bodies = worn.filter(i => i.system.kind === "body");
  if (helms.length > 1) warnings.push("Plusieurs heaumes sont portés : un seul compte normalement.");
  if (bodies.length > 1) warnings.push("Plusieurs armures de corps sont portées.");
  const needsPadding = worn.some(i => i.system.padding);
  const hasPadding = worn.some(i => i.system.kind === "padding");
  if (needsPadding && !hasPadding) warnings.push("Une armure de mailles se porte sur un auqueton.");
  if (shields.length > 1) warnings.push("Un seul bouclier compte à la fois.");
  const closed = helms.some(i => i.system.closed);
  const vigilance = closed ? -5 : 0;
  if (closed) notes.push("Heaume fermé : −5 aux tests de Vigilance (vue, ouïe) ; le visage n'est pas reconnaissable.");
  const moveFoot = worn.reduce((s, i) => s + (Number(i.system.moveFoot) || 0), 0);
  if (moveFoot) notes.push(`Mouvement à pied ${moveFoot}.`);
  const plateOver = worn.some(i => i.system.kind === "overlay");
  // Le type d'armure (vulnérabilités) se lit sur l'armure de corps, pas sur le heaume.
  const mail = worn.some(i => i.system.kind === "body" && i.system.material === "mail") && !plateOver;
  const plate = worn.some(i => i.system.kind !== "helm" && i.system.material === "plate");
  if (plateOver) notes.push("La cotte de plates annule le bonus des armes contre les mailles.");
  if (shieldItem?.system?.mountedPenalty) {
    notes.push(`${shieldItem.name} : ${shieldItem.system.mountedPenalty} aux compétences d'arme à cheval${shieldItem.system.chargeExempt ? ", sauf la Charge à la lance" : ""}.`);
  }
  return { armor, pieceValue, shield: Number(shieldItem?.system?.value) || 0, pieces: worn, shieldItem, notes, warnings, vigilance, moveFoot, mail, plate };
}

/** Prix en deniers → « 2 £ », « 390 d. », « 1 £ 30 d. » (240 d. = 1 £). */
export function formatPrice(d) {
  if (d === null || d === undefined || d === "") return "";
  const n = Number(d) || 0;
  const l = Math.floor(n / 240);
  const r = n % 240;
  if (l && r === 120 && l < 3) return `${l}½ £`;
  if (l && r) return `${l} £ ${r} d.`;
  if (l) return `${l} £`;
  return `${r} d.`;
}
