/**
 * Vue des idéaux et de la Table Ronde pour la fiche du chevalier (onglet Traits & passions).
 */
import { PDVF } from "../config.mjs";
import { roundTableCandidacy } from "../rules/ideals.mjs";

const L = (k) => game.i18n.localize(k);
const F = (k, d) => game.i18n.format(k, d);
const traitName = (key) => { const [id, side] = key.split("."); return L(`PDVF.Trait.${id}.${side}`); };

/** Une condition, en texte court : « Chevalerie 12 / 15 ». */
function checkView(c) {
  switch (c.kind) {
    case "traits": {
      const names = c.parts.map(p => `${traitName(p.key)} ${p.value}${p.directed ? ` (${p.base} + ${p.directed})` : ""}`).join(", ");
      return { ok: c.ok, label: L("PDVF.Ideal.Check.traits"), value: `${c.value} / ${c.min}`, tip: names };
    }
    case "virtue":
      return { ok: c.ok, label: traitName(c.key), value: `${c.value} / ${c.min}` };
    case "religion":
      return { ok: false, label: L("PDVF.Ideal.Check.religion"), value: "—" };
    case "passion":
      return { ok: c.ok, label: c.name || c.label, value: c.name ? `${c.value} / ${c.min}` : F("PDVF.Ideal.Check.missing", { min: c.min }) };
    case "skill":
      return { ok: c.ok, label: L(`PDVF.Skill.${c.id}`), value: `${c.value} / ${c.min}` };
  }
  return { ok: c.ok, label: "", value: "" };
}

/** Bénéfices d'un idéal pour ce chevalier, en lignes courtes. */
function benefitLines(s, sys) {
  const lines = [];
  const e = s.effects ?? {};
  if (e.armor) lines.push(F("PDVF.Ideal.Benefit.armor", { value: e.armor }));
  if (e.hp) lines.push(F("PDVF.Ideal.Benefit.hp", { value: e.hp }));
  if (e.healRate) lines.push(F("PDVF.Ideal.Benefit.healRate", { value: e.healRate }));
  if (e.move) lines.push(F("PDVF.Ideal.Benefit.move", { value: e.move }));
  if (e.damageDice) lines.push(F("PDVF.Ideal.Benefit.damageDice", { value: e.damageDice }));
  if (s.glory) lines.push(F("PDVF.Ideal.Benefit.glory", { value: s.glory }));
  if (s.def.invoke) lines.push(L(`PDVF.Ideal.${s.id}.invoke`));
  if (s.def.protection) lines.push(L(`PDVF.Ideal.${s.id}.protection`));
  const extra = game.i18n.has?.(`PDVF.Ideal.${s.id}.extra`) ? L(`PDVF.Ideal.${s.id}.extra`) : "";
  if (extra) lines.push(extra);
  if (s.id === "wicked" && sys.idealGM?.wickedBenefits) lines.push(sys.idealGM.wickedBenefits);
  return lines;
}

/**
 * @param {Actor} actor
 * @param {object} opts
 * @param {boolean} opts.editMode
 */
export function idealsView(actor, { editMode = false } = {}) {
  const sys = actor.system;
  const isGM = game.user.isGM;
  const pursued = sys.ideal;
  const list = (sys.idealsStatus ?? [])
    .filter(s => s.enabled || (s.def.gmOnly && isGM && editMode))
    .map(s => {
      const checks = s.checks.map(checkView);
      const missing = checks.filter(c => !c.ok).length;
      const state = s.met ? "met" : s.revoked && s.reached ? "revoked" : "pending";
      return {
        id: s.id, name: L(`PDVF.Ideal.${s.id}.name`), state, met: s.met, revoked: s.revoked,
        stateLabel: s.met ? L("PDVF.Ideal.State.met") : s.revoked ? L("PDVF.Ideal.State.revoked") : F("PDVF.Ideal.State.pending", { count: missing }),
        enabled: s.enabled, gmOnly: !!s.def.gmOnly,
        pursued: pursued === s.id, open: s.met || pursued === s.id || s.revoked,
        checks, benefits: benefitLines(s, sys),
        canProtect: s.met && !!s.def.protection,
        canRevoke: isGM && (s.reached || s.revoked)
      };
    })
    .sort((a, b) => (b.pursued - a.pursued) || (b.met - a.met));

  // Table Ronde
  const rt = PDVF.roundTable;
  const year = sys.dates?.roundTable;
  const member = !!year;
  const cand = roundTableCandidacy(sys, rt, { glory: sys.gloryTotal ?? 0, courteous: (sys.idealEffects?.met ?? []).includes("courteous") });
  const roundTable = {
    member, year,
    memberLine: member ? F("PDVF.RoundTable.Member", { year }) : "",
    benefits: member ? F("PDVF.RoundTable.Yearly", { pounds: rt.giftPounds, living: L(`PDVF.Living.${rt.living}`) }) : "",
    glory: (sys.gloryTotal ?? 0).toLocaleString("fr-FR"), gloryHint: rt.gloryHint.toLocaleString("fr-FR"),
    renowned: cand.renowned, courteous: cand.courteous, noticed: cand.noticed,
    checks: cand.checks.map(c => ({ ok: c.ok, label: c.name || c.label, value: c.name ? `${c.value} / ${c.min}` : F("PDVF.Ideal.Check.missing", { min: c.min }) })),
    canAdmit: isGM && !member,
    admitTip: F("PDVF.RoundTable.AdmitTip", { honor: rt.honor, glory: rt.glory })
  };

  return {
    list, roundTable, isGM, editMode,
    wicked: { enabled: !!sys.idealGM?.wicked, benefits: sys.idealGM?.wickedBenefits ?? "" },
    pursuedChoices: [{ value: "", label: L("PDVF.Ideal.NonePursued"), selected: !pursued },
      ...Object.keys(PDVF.ideals).filter(id => !PDVF.ideals[id].gmOnly || sys.idealGM?.wicked)
        .map(id => ({ value: id, label: L(`PDVF.Ideal.${id}.name`), selected: pursued === id }))]
  };
}
