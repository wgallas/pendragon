/**
 * Mise en forme d'un historique familial pour l'affichage (fenêtre de choix et fiche).
 * Module pur : les libellés sont en français, comme les tables.
 */

const ROMAN = ["I", "II", "III", "IV", "V"];

function plural(n, one, many) {
  return `${n} ${n > 1 ? many : one}`;
}

function relativeLabel(rel, male, female) {
  const who = rel.sex === "m" ? male : female;
  const e = rel.sex === "m" ? "" : "e";
  if (!rel.alive) return `${who} : mort${e} (${rel.cause})`;
  return `${who} : vivant${e}${rel.married ? `, marié${e}` : ""}`;
}

function sideLabel(flags) {
  const parts = [];
  if (flags.dissident) parts.push("Famille dissidente sous Vortigern");
  if (flags.side === "rebel") parts.push("rebelle aux côtés de Vortimer en 457");
  else if (flags.side === "loyalist") parts.push("loyaliste en 457");
  return parts.join(", ");
}

/**
 * @param {object} result  résultat de generateFamily
 * @param {number} [index] numéro de la proposition (0, 1, 2)
 */
export function familyView(result, index = 0) {
  const ancestors = result.ancestors.map(a => ({
    ...a,
    title: `Sire ${a.name}`,
    span: `${a.born}–${a.died}`,
    gloryLabel: a.glory.toLocaleString("fr-FR"),
    causeLabel: a.cause,
    wifeLabel: a.wife ? `Épouse : ${a.wife.name} (${a.wife.role})` : ""
  }));
  const fam = result.family;
  const mother = fam.mother;
  const motherLabel = mother.alive
    ? `Mère : ${mother.name}, vivante${mother.married ? ", remariée" : ", veuve"}`
    : `Mère : ${mother.name}, morte (${mother.cause})`;

  return {
    index,
    roman: ROMAN[index] ?? String(index + 1),
    ancestors,
    father: ancestors[2],
    inheritedGlory: result.pc.inheritedGlory,
    inheritedGloryLabel: result.pc.inheritedGlory.toLocaleString("fr-FR"),
    inheritYear: result.pc.inheritYear,
    suggestedName: result.pc.suggestedName,
    sideLabel: sideLabel(result.flags),
    passions: result.passions.map((p, j) => ({
      ...p, j,
      usable: p.bonus > 0,
      bonusLabel: p.bonus > 0 ? `+${p.bonus}` : String(p.bonus)
    })),
    traits: result.traits.map((t, j) => ({ ...t, j })),
    legacy: result.legacy,
    motherLabel,
    siblings: fam.siblings.map(r => relativeLabel(r, "Frère cadet", "Sœur cadette")),
    paternal: fam.paternal.map(r => relativeLabel(r, "Oncle", "Tante")),
    maternal: fam.maternal.map(r => relativeLabel(r, "Oncle", "Tante")),
    siblingsSummary: plural(fam.siblings.length, "frère ou sœur", "frères et sœurs"),
    paternalSummary: plural(fam.paternal.length, "oncle ou tante", "oncles et tantes"),
    maternalSummary: plural(fam.maternal.length, "oncle ou tante", "oncles et tantes")
  };
}
