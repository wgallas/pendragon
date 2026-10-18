/**
 * Vue de l'équipement d'un acteur pour les fiches : armes (profils d'attaque calculés),
 * pièces d'armure et bouclier, protection totale.
 */
import { attackProfiles, protection, formatPrice } from "../rules/equipment.mjs";

const L = (k) => game.i18n.localize(k);
const F = (k, d) => game.i18n.format(k, d);

/**
 * @param {Actor} actor
 * @param {object} stats { damageDice, brawl, horseCharge, skills: {id: valeur} }
 */
export function gearView(actor, stats) {
  const items = actor.items.contents;
  const byEquip = (a, b) => (b.system.equipped - a.system.equipped) || (a.sort - b.sort) || a.name.localeCompare(b.name, "fr");
  const weapons = items.filter(i => i.type === "arme").sort(byEquip).map(i => {
    const s = i.system;
    const tips = [s.advantage, s.disadvantage, s.twoHanded ? L("PDVF.Gear.TwoHanded") : ""].filter(Boolean);
    const profiles = attackProfiles(s, stats).map(p => ({
      ...p,
      skillLabel: L(`PDVF.Skill.${p.skill}`),
      modeLabel: p.mode === "thrown" ? L("PDVF.Gear.ThrownShort") : "",
      rangeLabel: p.range ? L(`PDVF.Gear.Range.${p.range}`) : "",
      missing: !p.formula
    }));
    return {
      id: i.id, name: i.name, img: i.img, equipped: s.equipped, quantity: s.quantity, multiple: s.quantity > 1,
      parry: s.parry, useLabel: L(`PDVF.Gear.Use.${s.use}`), tip: tips.join(" — "), profiles
    };
  });
  const prot = protection(items);
  const pieces = items.filter(i => i.type === "armure" || i.type === "bouclier").sort(byEquip).map(i => ({
    id: i.id, name: i.name, img: i.img, equipped: i.system.equipped, isShield: i.type === "bouclier",
    value: i.type === "armure" && i.system.equipped ? prot.pieceValue(i) : i.system.value,
    detail: i.type === "bouclier" ? L(`PDVF.Gear.Size.${i.system.size}`) : L(`PDVF.Gear.Kind.${i.system.kind}`),
    tip: [i.system.notes, i.system.disadvantage].filter(Boolean).join(" — "),
    price: formatPrice(i.system.price)
  }));
  return {
    weapons, pieces, hasGear: weapons.length + pieces.length > 0,
    armor: prot.armor, shield: prot.shield, shieldName: prot.shieldItem?.name ?? "",
    notes: prot.notes, warnings: prot.warnings,
    summary: F("PDVF.Gear.ProtectionLine", { armor: prot.armor, shield: prot.shield })
  };
}

/** Notes à joindre au test d'une arme (bouclier à cheval, deux mains). */
export function attackNotes(actor, item, mode = "main") {
  const notes = [];
  const prot = protection(actor.items.contents);
  const s = item.system;
  const sh = prot.shieldItem?.system;
  if (mode === "main" && sh?.mountedPenalty && s.use !== "foot" && !(sh.chargeExempt && s.skill === "charge")) {
    notes.push(F("PDVF.Gear.MountedNote", { shield: prot.shieldItem.name, value: sh.mountedPenalty }));
  }
  if (s.twoHanded && prot.shieldItem) notes.push(F("PDVF.Gear.TwoHandedNote", { shield: prot.shieldItem.name }));
  if (s.parry && mode === "main") notes.push(F("PDVF.Gear.ParryNote", { value: s.parry }));
  return notes;
}
