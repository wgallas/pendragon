/**
 * Côté joueur (et MJ) : le coup porté à la proie, lancé par le joueur, puis la demande au MJ.
 */
import { SYSTEM_ID } from "../config.mjs";
import { rollAttribute, rollPlain } from "../dice/tests.mjs";
import { weaponOptions } from "../combat/exchange.mjs";
import { request, actorOf } from "./engine.mjs";

const L = (k) => game.i18n.localize(k);
const F = (k, d) => game.i18n.format(k, d);
const { DialogV2 } = foundry.applications.api;
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));

export async function strike(hunt, index) {
  const s = hunt.system;
  const p = s.participants[Number(index)];
  const actor = actorOf(p);
  if (!actor || !(game.user.isGM || actor.isOwner)) return;
  const first = s.phase === "bay";
  if (first && (s.first.index !== Number(index) || s.first.done)) return ui.notifications.info(L("PDVF.Hunt.Notify.NotYourStrike"));
  if (s.phase === "rush" && (!s.rush.attackers.includes(Number(index)) || s.rush.done.includes(Number(index)))) return ui.notifications.info(L("PDVF.Hunt.Notify.NotYourStrike"));
  const opts = weaponOptions(actor).filter(o => o.formula);
  if (!opts.length) return ui.notifications.warn(L("PDVF.Hunt.Notify.NoWeapon"));
  const choice = await DialogV2.wait({
    window: { title: `${actor.name} — ${L(first ? "PDVF.Hunt.FirstStrike" : "PDVF.Hunt.Rush")}` }, classes: [SYSTEM_ID, "pdvf-dialog"], rejectClose: false,
    content: `<div class="form-group"><label>${L("PDVF.Hunt.Weapon")}</label><select name="ref">${opts.map(o => `<option value="${esc(o.ref)}">${esc(o.name)} — ${esc(L(`PDVF.Skill.${o.skill}`))} ${o.skillValue} · ${esc(o.damageLabel)}</option>`).join("")}</select></div>
      <p class="pdvf-hint">${F("PDVF.Hunt.StrikeHint", { prey: esc(s.prey.name), avoid: s.prey.avoidance })}</p>`,
    buttons: [{ action: "ok", label: L("PDVF.Hunt.Strike.go"), default: true, callback: (e, b) => b.form.elements.ref.value }, { action: "cancel", label: L("PDVF.Dialog.Cancel") }]
  });
  const opt = opts.find(o => o.ref === choice);
  if (!opt) return;
  // Ne pas attendre l'hôte ou l'invité d'honneur : test de Modeste ; s'il l'emporte et que l'on frappe quand même, −1 Honneur.
  if (first && !p.honored && s.participants.some(x => x.honored) && actor.type === "chevalier") {
    const m = actor.getRollable("trait.modest.left");
    const t = await rollPlain({ actor, name: actor.name, label: m.label, value: m.value, title: L("PDVF.Hunt.Impatient"), subtitle: hunt.name });
    if (t.result.success) { await actor.adjustPassion("honor", -1); ui.notifications.info(F("PDVF.Hunt.Notify.Impatient", { name: actor.name })); }
  }
  let result;
  if (actor.type === "chevalier") {
    const msg = await rollAttribute(actor, `skill.${opt.skill}`, { subtitle: `${hunt.name} — ${s.prey.name}` });
    result = msg?.flags?.[SYSTEM_ID]?.result;
  } else {
    const t = await rollPlain({ actor, name: actor.name, label: opt.name, value: opt.skillValue, title: L("PDVF.Hunt.FirstStrike"), subtitle: hunt.name });
    result = { die: t.result.die, adjusted: t.result.adjusted, outcome: t.result.outcome, success: t.result.success, total: t.result.total };
  }
  if (!result) return;
  return request(hunt, "strike", { index: Number(index), result, formula: opt.formula, weapon: opt.name });
}
