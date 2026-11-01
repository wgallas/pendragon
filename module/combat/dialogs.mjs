/**
 * Fenêtres des fiches : recevoir des dégâts, Premiers soins, semaine de convalescence, aggravation.
 */
import { SYSTEM_ID } from "../config.mjs";
import { combatStats, receiveDamage, firstAid, convalescence, aggravate, postCombatCard } from "./damage.mjs";
import { STATUS, setStatus, hasStatus } from "./status.mjs";

const { DialogV2 } = foundry.applications.api;
const L = (k) => game.i18n.localize(k);
const F = (k, d) => game.i18n.format(k, d);

export async function ask(title, content, label, icon = "fa-solid fa-check") {
  const result = await DialogV2.wait({
    window: { title }, classes: [SYSTEM_ID, "pdvf-dialog"], content, rejectClose: false,
    buttons: [
      { action: "ok", label, icon, default: true, callback: (e, b) => new foundry.applications.ux.FormDataExtended(b.form).object },
      { action: "cancel", label: L("PDVF.Dialog.Cancel") }
    ]
  });
  return result && result !== "cancel" ? result : null;
}

/** « Recevoir des dégâts » : montant (ou formule), bouclier, armure, Chute. */
export async function promptDamage(actor) {
  const st = combatStats(actor);
  const r = await ask(F("PDVF.Combat.ReceiveTitle", { name: actor.name }), `
    <div class="form-group"><label>${L("PDVF.Combat.BaseDamage")}</label><input type="text" name="base" value="" placeholder="4D6 ou 17" autofocus></div>
    <div class="form-group"><label>${L("PDVF.Combat.Source")}</label><input type="text" name="source" value=""></div>
    <div class="form-group"><label>${F("PDVF.Combat.UseShield", { value: st.shield })}</label><input type="checkbox" name="shield"></div>
    <div class="form-group"><label>${L("PDVF.Combat.IgnoreArmor")}</label><input type="checkbox" name="ignoreArmor"></div>
    <div class="form-group"><label>${L("PDVF.Combat.HalfDamage")}</label><input type="checkbox" name="half"></div>
    <div class="form-group"><label>${L("PDVF.Combat.CheckKnockdown")}</label><input type="checkbox" name="knockdown" checked></div>
    <p class="pdvf-hint">${F("PDVF.Combat.ReceiveHint", { armor: st.armor, siz: st.siz, con: st.majorWound })}</p>`, L("PDVF.Combat.Apply"), "fa-solid fa-droplet");
  if (!r) return;
  const raw = String(r.base ?? "").trim();
  if (!raw) return;
  const rolls = [];
  let base = Number(raw);
  if (!Number.isFinite(base)) {
    try { const roll = await new Roll(raw.replace(/D/g, "d")).evaluate(); rolls.push(roll); base = roll.total; }
    catch (e) { return ui.notifications.warn(F("PDVF.Notify.BadFormula", { formula: raw })); }
  }
  const out = await receiveDamage(actor, { base, shield: r.shield ? st.shield : 0, shieldIsShield: true, ignoreArmor: !!r.ignoreArmor, half: !!r.half, knockdown: !!r.knockdown, source: r.source || "" });
  return postCombatCard({ actor, title: F("PDVF.Combat.ReceiveTitle", { name: actor.name }), subtitle: r.source || "", sections: [{ lines: out.lines }], rolls: [...rolls, ...out.rolls], undo: [out.undo] });
}

/** Soigneurs possibles : le blessé lui-même (−10), les chevaliers et écuyers du monde, ou une valeur saisie. */
export function healerChoices(patient, skill) {
  const rows = [];
  const value = (a) => combatStats(a)[skill];
  for (const a of game.actors.filter(x => x.type === "chevalier" || (x.type === "pnj" && x.system.category === "squire"))) {
    if (!a.testUserPermission(game.user, "OBSERVER") && !game.user.isGM) continue;
    const v = value(a);
    if (v === null || v === undefined) continue;
    rows.push({ id: a.uuid, label: `${a.name} (${v}${a.uuid === patient.uuid ? `, ${L("PDVF.Combat.OnSelf")} −10` : ""})`, value: v, name: a.name, self: a.uuid === patient.uuid });
  }
  return rows;
}

/** Premiers soins sur une blessure. */
export async function promptFirstAid(patient, woundId) {
  const rows = healerChoices(patient, "firstAid");
  const content = `
    <div class="form-group"><label>${L("PDVF.Combat.Healer")}</label><select name="healer">
      ${rows.map(h => `<option value="${h.id}" ${h.self ? "" : "selected"}>${h.label}</option>`).join("")}
      <option value="manual">${L("PDVF.Combat.OtherHealer")}</option></select></div>
    <div class="form-group"><label>${L("PDVF.Combat.OtherValue")}</label><input type="number" name="value" value="10" min="0" step="1"></div>
    <p class="pdvf-hint">${L("PDVF.Combat.FirstAidHint")}</p>`;
  const r = await ask(F("PDVF.Combat.FirstAidTitle", { name: patient.name }), content, L("PDVF.Combat.FirstAid"), "fa-solid fa-kit-medical");
  if (!r) return;
  const h = rows.find(x => x.id === r.healer);
  const healer = h ? { name: h.name, value: h.value, self: h.self } : { name: L("PDVF.Combat.OtherHealer"), value: Number(r.value) || 0, self: false };
  const out = await firstAid(patient, woundId, healer);
  if (!out) return;
  return postCombatCard({ actor: patient, title: F("PDVF.Combat.FirstAidTitle", { name: patient.name }), sections: [{ lines: out.lines }], rolls: out.rolls, undo: [out.undo] });
}

/** Semaine de convalescence (le dimanche). */
export async function promptWeek(actor) {
  const rows = healerChoices(actor, "chirurgery").filter(h => !h.self);
  const st = combatStats(actor);
  const content = `
    <p class="pdvf-hint">${L(st.debilitated ? "PDVF.Combat.WeekDebilitated" : "PDVF.Combat.WeekHealthy")}</p>
    <div class="form-group"><label>${L("PDVF.Combat.Surgeon")}</label><select name="surgeon">
      <option value="">${L("PDVF.Combat.NoSurgeon")}</option>
      ${rows.map(h => `<option value="${h.id}">${h.label}</option>`).join("")}
      <option value="manual">${L("PDVF.Combat.OtherHealer")}</option></select></div>
    <div class="form-group"><label>${L("PDVF.Combat.OtherValue")}</label><input type="number" name="value" value="10" min="0" step="1"></div>
    <div class="form-group"><label>${L("PDVF.Combat.Unsanitary")}</label><input type="checkbox" name="unsanitary"></div>
    <div class="form-group"><label>${L("PDVF.Combat.Rested")}</label><input type="checkbox" name="rested" checked></div>
    <div class="form-group"><label>${L("PDVF.Combat.WeekAggravation")}</label><input type="number" name="aggravation" value="0" min="0" step="1"></div>`;
  const r = await ask(F("PDVF.Combat.WeekTitle", { name: actor.name }), content, L("PDVF.Combat.WeekApply"), "fa-solid fa-bed");
  if (!r) return;
  const h = rows.find(x => x.id === r.surgeon);
  const surgeon = r.surgeon === "manual" ? { name: L("PDVF.Combat.OtherHealer"), value: Number(r.value) || 0 } : h ? { name: h.name, value: h.value } : null;
  const out = await convalescence(actor, { surgeon, unsanitary: !!r.unsanitary, rested: !!r.rested, aggravation: Number(r.aggravation) || 0 });
  return postCombatCard({ actor, title: F("PDVF.Combat.WeekTitle", { name: actor.name }), sections: [{ lines: out.lines }], rolls: out.rolls, undo: [out.undo] });
}

/** Un point d'aggravation. */
export async function quickAggravation(actor) {
  const out = await aggravate(actor, 1);
  return postCombatCard({ actor, title: F("PDVF.Combat.AggravationTitle", { name: actor.name }), sections: [{ lines: out.lines }], undo: [out.undo] });
}

/** Bascule à cheval / à pied. */
export async function toggleMounted(actor) {
  const on = !hasStatus(actor, STATUS.mounted);
  await setStatus(actor, STATUS.mounted, on);
  if (on) await setStatus(actor, STATUS.prone, false);
}

/** Récupère son arme (fin de l'état « désarmé »). */
export async function rearm(actor) {
  await setStatus(actor, STATUS.disarmed, false);
}

/** Se relève (fin de l'état « au sol »). */
export async function standUp(actor) {
  await setStatus(actor, STATUS.prone, false);
}

/** Vue des blessures pour les fiches. */
export function woundsView(actor) {
  const st = combatStats(actor);
  const wounds = (actor.system.health?.wounds ?? []).map((w, i) => ({
    ...w, index: i, typeLabel: L(`PDVF.Combat.WoundType.${w.type}`), serious: w.type === "major" || w.type === "mortal"
  }));
  return {
    wounds, total: wounds.reduce((s, w) => s + (Number(w.damage) || 0), 0),
    mounted: st.mounted, prone: st.prone, disarmed: st.disarmed, unconscious: st.unconscious,
    debilitated: st.debilitated, armor: st.armor, shield: st.shield,
    horseName: st.horse?.name ?? "", horseCharge: st.horseCharge, dying: st.hp <= 0,
    cold: Number(actor.system.health?.cold) || 0, poisonCon: Number(actor.system.health?.poisonCon) || 0,
    coldLine: F("PDVF.Hazard.ColdNote", { cold: Number(actor.system.health?.cold) || 0 }),
    poisonLine: F("PDVF.Hazard.PoisonNote", { con: Number(actor.system.health?.poisonCon) || 0, rate: st.healRate })
  };
}
