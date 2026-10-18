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
 * Règles de cumul (Livre du joueur, chap. 9) : les protections des pièces portées s'additionnent,
 * mais certaines pièces ne vont pas ensemble.
 * - une seule armure de corps et un seul heaume comptent (la meilleure) ;
 * - l'auqueton se porte sous les mailles (ou seul) ; le gambison, comme toute armure de corps
 *   qui ne se porte pas sur un auqueton, ne se cumule avec aucun matelassage ;
 * - la cotte de plates, par-dessus une armure de corps, n'ajoute que sa valeur « layered » (+1) ;
 * - un seul bouclier compte.
 * @returns {Map<object, string>} pièce portée → raison pour laquelle elle ne compte pas
 */
function ignoredPieces(worn) {
  const ignored = new Map();
  const best = (list) => [...list].sort((a, b) => (Number(b.system.value) || 0) - (Number(a.system.value) || 0))[0] ?? null;
  const bodies = worn.filter(i => i.system.kind === "body");
  const body = best(bodies);
  for (const b of bodies) if (b !== body) ignored.set(b, `une seule armure de corps compte (${body.name})`);
  const helms = worn.filter(i => i.system.kind === "helm");
  const helm = best(helms);
  for (const h of helms) if (h !== helm) ignored.set(h, `un seul heaume compte (${helm.name})`);
  const paddings = worn.filter(i => i.system.kind === "padding");
  const padding = best(paddings);
  for (const p of paddings) {
    if (body && !body.system.padding) ignored.set(p, `${body.name} ne se porte pas sur un matelassage`);
    else if (p !== padding) ignored.set(p, `un seul matelassage compte (${padding.name})`);
  }
  const overlays = worn.filter(i => i.system.kind === "overlay");
  const overlay = best(overlays);
  for (const o of overlays) if (o !== overlay) ignored.set(o, `une seule pièce par-dessus l'armure compte (${overlay.name})`);
  return ignored;
}

/**
 * Pièces à ranger quand on porte `item` : celles qu'il remplace ou avec lesquelles il ne se cumule pas.
 * @param {object} item   objet qu'on s'apprête à porter
 * @param {object[]} items objets du porteur
 * @returns {object[]}
 */
export function conflictsWith(item, items = []) {
  const worn = items.filter(i => i !== item && i.id !== item.id && i.system?.equipped && i.type === item.type);
  if (item.type === "bouclier") return worn;
  if (item.type !== "armure") return [];
  const k = item.system.kind;
  if (k === "helm" || k === "overlay") return worn.filter(i => i.system.kind === k);
  if (k === "body") {
    return worn.filter(i => i.system.kind === "body" || (!item.system.padding && i.system.kind === "padding"));
  }
  if (k === "padding") {
    return worn.filter(i => i.system.kind === "padding" || (i.system.kind === "body" && !i.system.padding));
  }
  return [];
}

/**
 * Protection d'armure d'un porteur : somme des pièces portées qui se cumulent (voir ignoredPieces),
 * bouclier à part (il ne compte que sur un succès partiel).
 * @param {object[]} items  objets du porteur ({type, name, system})
 */
export function protection(items = []) {
  const worn = items.filter(i => i.type === "armure" && i.system?.equipped);
  const shields = items.filter(i => i.type === "bouclier" && i.system?.equipped);
  const ignored = ignoredPieces(worn);
  const counted = worn.filter(i => !ignored.has(i));
  const hasBody = counted.some(i => i.system.kind === "body");
  const pieceValue = (i) => {
    if (ignored.has(i) || !i.system?.equipped) return 0;
    return i.system.kind === "overlay" && hasBody ? Number(i.system.layered) || 0 : Number(i.system.value) || 0;
  };
  const armor = counted.reduce((s, i) => s + pieceValue(i), 0);
  const shieldItem = [...shields].sort((a, b) => (Number(b.system.value) || 0) - (Number(a.system.value) || 0))[0] ?? null;
  const warnings = [...ignored].map(([i, why]) => `${i.name} ne compte pas : ${why}.`);
  for (const sh of shields) if (sh !== shieldItem) warnings.push(`${sh.name} ne compte pas : un seul bouclier à la fois.`);
  const notes = [];
  const body = counted.find(i => i.system.kind === "body");
  if (body?.system.padding && !counted.some(i => i.system.kind === "padding")) warnings.push(`${body.name} se porte sur un auqueton.`);
  const overlay = counted.find(i => i.system.kind === "overlay");
  if (overlay && body && body.system.material !== "mail") warnings.push(`${overlay.name} se porte par-dessus un haubert.`);
  const closed = counted.some(i => i.system.kind === "helm" && i.system.closed);
  const vigilance = closed ? -5 : 0;
  if (closed) notes.push("Heaume fermé : −5 aux tests de Vigilance (vue, ouïe) ; le visage n'est pas reconnaissable.");
  const moveFoot = counted.reduce((s, i) => s + (Number(i.system.moveFoot) || 0), 0);
  if (moveFoot) notes.push(`Mouvement à pied ${moveFoot}.`);
  // Le type d'armure (vulnérabilités) se lit sur l'armure de corps, pas sur le heaume.
  const mail = body?.system.material === "mail" && !overlay;
  const plate = counted.some(i => i.system.kind !== "helm" && i.system.material === "plate");
  if (overlay && body) notes.push(`${overlay.name} : +${Number(overlay.system.layered) || 0} sur ${body.name} ; plus de bonus des armes contre les mailles.`);
  if (shieldItem?.system?.mountedPenalty) {
    notes.push(`${shieldItem.name} : ${shieldItem.system.mountedPenalty} aux compétences d'arme à cheval${shieldItem.system.chargeExempt ? ", sauf la Charge à la lance" : ""}.`);
  }
  return { armor, pieceValue, ignored, shield: Number(shieldItem?.system?.value) || 0, pieces: counted, shieldItem, notes, warnings, vigilance, moveFoot, mail, plate };
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
