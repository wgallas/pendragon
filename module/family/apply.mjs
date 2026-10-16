import { SYSTEM_ID } from "../config.mjs";

const FLAG = "family";

/** Historique familial retenu pour un acteur (ou null). */
export function getFamilyHistory(actor) {
  return actor.getFlag(SYSTEM_ID, FLAG) ?? null;
}

/**
 * Applique un historique familial à la fiche d'un chevalier.
 * Si un historique avait déjà été appliqué, ses effets sont d'abord retirés,
 * pour qu'on puisse changer d'avis sans cumuler les bonus.
 *
 * @param {Actor} actor
 * @param {object} result      résultat de generateFamily
 * @param {object} selection   { passions: string[], traits: string[] } noms retenus
 */
export async function applyFamilyHistory(actor, result, selection) {
  const source = actor._source.system;
  let passions = foundry.utils.deepClone(source.passions);
  let directedTraits = foundry.utils.deepClone(source.directedTraits);
  let chronicle = foundry.utils.deepClone(source.chronicle);

  // 1. Retirer les effets d'un historique précédent
  const previous = getFamilyHistory(actor)?.applied;
  if (previous) {
    for (const { name, bonus, created } of previous.passions ?? []) {
      const i = passions.findIndex(p => sameName(p.name, name));
      if (i < 0) continue;
      if (created && passions[i].value === bonus) passions.splice(i, 1);
      else passions[i].value = Math.max(0, passions[i].value - bonus);
    }
    const added = new Set((previous.traits ?? []).map(n => n.toLowerCase()));
    directedTraits = directedTraits.filter(t => !added.has(String(t.name).toLowerCase()));
    if (previous.chronicleEvent) {
      chronicle = chronicle.filter(r => !(r.event === previous.chronicleEvent && r.year === previous.chronicleYear));
    }
  }

  // 2. Passions héritées (règle de la 6e : bonus = valeur du parent − 15, +5 au plus)
  const applied = { passions: [], traits: [], chronicleEvent: "", chronicleYear: 0 };
  const wanted = new Set((selection.passions ?? []).map(n => n.toLowerCase()));
  for (const p of result.passions) {
    if (!wanted.has(p.name.toLowerCase()) || p.bonus <= 0) continue;
    const i = passions.findIndex(x => sameName(x.name, p.name));
    if (i >= 0) {
      passions[i].value += p.bonus;
      applied.passions.push({ name: p.name, bonus: p.bonus, created: false });
    } else {
      passions.push({ court: "fervor", name: p.name, value: p.bonus, xp: false });
      applied.passions.push({ name: p.name, bonus: p.bonus, created: true });
    }
  }

  // 3. Traits dirigés hérités, à la même valeur que l'ancêtre
  const wantedTraits = new Set((selection.traits ?? []).map(n => n.toLowerCase()));
  for (const t of result.traits) {
    if (!wantedTraits.has(t.name.toLowerCase())) continue;
    directedTraits = directedTraits.filter(x => !sameName(x.name, t.name));
    directedTraits.push({ name: t.name, value: t.inherited ?? Math.floor(t.value / 2 + 0.5) });
    applied.traits.push(t.name);
  }

  // 4. Gloire héritée : une entrée de chronique à l'année des 14 ans
  const father = result.ancestors[2];
  const event = `Gloire héritée de Sire ${father.name} (le quart de sa Gloire)`;
  const row = { year: result.pc.inheritYear, event, living: "", glory: result.pc.inheritedGlory };
  const at = chronicle.findIndex(r => Number(r.year) > row.year);
  if (at < 0) chronicle.push(row);
  else chronicle.splice(at, 0, row);
  applied.chronicleEvent = event;
  applied.chronicleYear = row.year;

  // 5. Parents
  const parents = [
    { name: `Sire ${father.name}`, glory: father.glory },
    { name: result.family.mother.name, glory: father.wife?.glory ?? 0 }
  ];

  await actor.update({
    "system.passions": passions,
    "system.directedTraits": directedTraits,
    "system.chronicle": chronicle,
    "system.family.parents": parents,
    // Même structure à chaque fois : la fusion des données remplace bien l'ancien historique.
    [`flags.${SYSTEM_ID}.${FLAG}`]: { result, applied, chosenAt: Date.now() }
  });
}

function sameName(a, b) {
  return String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();
}
