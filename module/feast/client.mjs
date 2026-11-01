/**
 * Côté joueur (et MJ) : les jets que chacun lance lui-même pendant le festin, puis la demande au MJ.
 * Les cartes d'évènement sont celles des joueurs : la fiche dit combien en tirer, le joueur saisit la carte jouée.
 */
import { PDVF, SYSTEM_ID } from "../config.mjs";
import { rollAttribute, rollPlain } from "../dice/tests.mjs";
import { formatValue } from "../rules/resolution.mjs";
import { request, guestActor, guestState } from "./engine.mjs";

const L = (k) => game.i18n.localize(k);
const F = (k, d) => game.i18n.format(k, d);
const { DialogV2 } = foundry.applications.api;
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const signed = (n) => (n > 0 ? `+${n}` : `${n}`);

function resultOf(message) {
  return message?.flags?.[SYSTEM_ID]?.result ?? message?.getFlag?.(SYSTEM_ID, "result") ?? null;
}

/** Contexte d'un invité joué par cet utilisateur. */
function guestOf(feast, index) {
  const g = feast.system.guests[Number(index)];
  const actor = guestActor(g);
  if (!g || !actor || !(game.user.isGM || actor.isOwner)) return null;
  return { g, actor, st: guestState(feast.system, g, actor) };
}

/** Test simple d'un trait (sans la procédure du trait opposé), avec un modificateur. */
async function traitTest(actor, key, { modifier = 0, title, subtitle = "", notes = [] }) {
  const r = actor.getRollable(key);
  if (!r) return null;
  const insp = actor.inspirationBonus(key);
  const res = await rollPlain({ actor, name: actor.name, label: r.label, value: r.value, modifier: modifier + insp, title, subtitle, notes });
  return res.result;
}

/** Perd un point d'Honneur (échecs critiques, Fier Célèbre, place sous un PJ moins glorieux). */
async function loseHonor(actor, reason) {
  const v = Number(actor.system.honor?.value) || 0;
  await actor.update({ "system.honor.value": Math.max(0, v - 1) });
  ui.notifications.info(F("PDVF.Feast.Notify.HonorLost", { name: actor.name, reason }));
}

/** Test de Gloire : la place à table (sur un échec critique, second test aussitôt). */
export async function seat(feast, index) {
  const x = guestOf(feast, index);
  if (!x || x.g.seat) return;
  const title = `${feast.name} — ${L("PDVF.Feast.Seating")}`;
  const sizeNote = { small: "PDVF.Feast.SeatSmall", royal: "PDVF.Feast.SeatRoyal" }[feast.system.size];
  let outcome = x.g.seatTest.outcome;
  if (!outcome) {
    const msg = await rollAttribute(x.actor, "glory", { title, notes: sizeNote ? [L(sizeNote)] : [] });
    outcome = resultOf(msg)?.outcome;
    if (!outcome) return;
    if (outcome === "fumble") await loseHonor(x.actor, L("PDVF.Feast.FumbleReason"));
    if (x.st.proudFamous) await loseHonor(x.actor, L("PDVF.Feast.ProudReason"));
  }
  let second = "";
  if (outcome === "fumble") {
    const msg = await rollAttribute(x.actor, "glory", { title, subtitle: L("PDVF.Feast.SecondTest"), notes: [L("PDVF.Feast.SecondTestNote")] });
    second = resultOf(msg)?.outcome;
    if (!second) return request(feast, "seat", { index, outcome });
  }
  return request(feast, "seat", { index, outcome, second });
}

/** Test de Modeste quand on est placé sous un PJ de même rang moins glorieux. */
export async function modest(feast, index) {
  const x = guestOf(feast, index);
  if (!x || x.g.modest) return;
  const res = await traitTest(x.actor, "trait.modest.left", { title: feast.name, subtitle: L("PDVF.Feast.SlightedTest") });
  if (!res) return;
  if (!res.success) await loseHonor(x.actor, L("PDVF.Feast.SlightedReason"));
  return request(feast, "modest", { index, outcome: res.outcome });
}

/** Céder sa place (test de Modeste). */
export async function yieldSeat(feast, index) {
  const x = guestOf(feast, index);
  if (!x || !x.g.seat || x.g.yielded) return;
  if (x.st.proudFamous) return ui.notifications.warn(L("PDVF.Feast.Notify.ProudNoYield"));
  const res = await traitTest(x.actor, "trait.modest.left", { title: feast.name, subtitle: L("PDVF.Feast.Yield") });
  if (!res) return;
  if (res.success) await x.actor.markExperience("trait.modest.left");
  if (res.outcome === "fumble") await loseHonor(x.actor, L("PDVF.Feast.YieldReason"));
  return request(feast, "yieldSeat", { index, outcome: res.outcome });
}

/** Carte d'évènement jouée : nom, Engouement, carte d'hôte, départ forcé. */
export async function card(feast, index) {
  const x = guestOf(feast, index);
  if (!x) return;
  if (feast.system.round < 1) return ui.notifications.info(L("PDVF.Feast.Notify.NotStarted"));
  if (x.st.acted) return ui.notifications.info(L("PDVF.Feast.Notify.AlreadyActed"));
  const above = x.g.seat === "above";
  const content = `
    <p class="pdvf-hint">${F("PDVF.Feast.CardsHint", { n: x.st.cards, att: x.st.att })}</p>
    <div class="form-group"><label>${L("PDVF.Feast.CardName")}</label><input type="text" name="name" autofocus></div>
    <div class="form-group"><label>${L("PDVF.Feast.CardMod")}</label><input type="number" name="mod" value="0" step="1"></div>
    <div class="form-group"><label>${L("PDVF.Feast.CardsDrawn")}</label><input type="number" name="drawn" value="1" min="1" max="${Math.max(1, x.st.cards)}" step="1"></div>
    <div class="form-group"><label><input type="checkbox" name="host"> ${L("PDVF.Feast.HostCard")}</label></div>
    <div class="form-group"><label><input type="checkbox" name="forced"> ${L("PDVF.Feast.ForcedDeparture")}</label></div>
    ${above ? `<p class="pdvf-hint">${L("PDVF.Feast.AboveHint")}</p>` : ""}`;
  const data = await DialogV2.wait({
    window: { title: `${x.actor.name} — ${L("PDVF.Feast.PlayCard")}` }, classes: [SYSTEM_ID, "pdvf-dialog"], content, rejectClose: false,
    buttons: [{ action: "ok", label: L("PDVF.Feast.PlayCard"), default: true, callback: (e, b) => {
      const f = b.form.elements;
      return { name: f.name.value.trim(), mod: Number(f.mod.value) || 0, drawn: Number(f.drawn.value) || null, host: f.host.checked, forced: f.forced.checked };
    } }, { action: "cancel", label: L("PDVF.Dialog.Cancel") }]
  });
  if (!data || data === "cancel") return;
  return request(feast, "card", { index, ...data });
}

/** Test d'une compétence de cour pendant le festin, avec l'Engouement (pour les tests demandés par une carte). */
export async function courtTest(feast, index) {
  const x = guestOf(feast, index);
  if (!x) return;
  const options = PDVF.feast.engouementSkills.filter(id => id in x.actor.system.skills)
    .map(id => `<option value="skill.${id}">${esc(L(`PDVF.Skill.${id}`))} ${formatValue(x.actor.system.skills[id].value)}</option>`);
  options.unshift(`<option value="char.app">${esc(L("PDVF.Char.app.long"))} ${x.st.app}</option>`);
  const key = await DialogV2.wait({
    window: { title: `${x.actor.name} — ${L("PDVF.Feast.CourtTest")}` }, classes: [SYSTEM_ID, "pdvf-dialog"], rejectClose: false,
    content: `<div class="form-group"><label>${L("PDVF.Feast.Attribute")}</label><select name="key">${options.join("")}</select></div>
      <p class="pdvf-hint">${F("PDVF.Feast.EngouementApplied", { mod: signed(x.st.engouement) })}</p>`,
    buttons: [{ action: "ok", label: L("PDVF.Dialog.Ok"), default: true, callback: (e, b) => b.form.elements.key.value },
      { action: "cancel", label: L("PDVF.Dialog.Cancel") }]
  });
  if (!key || key === "cancel") return;
  return rollAttribute(x.actor, key, { modifier: x.st.engouement, subtitle: feast.name, notes: [F("PDVF.Feast.EngouementNote", { mod: signed(x.st.engouement) })] });
}

/** Autre activité de cour : test avec l'Engouement ; succès : expérience ; critique : Gloire = ATT totale. */
export async function activity(feast, index) {
  const x = guestOf(feast, index);
  if (!x) return;
  if (feast.system.round < 1) return ui.notifications.info(L("PDVF.Feast.Notify.NotStarted"));
  if (x.st.acted) return ui.notifications.info(L("PDVF.Feast.Notify.AlreadyActed"));
  const acts = PDVF.feast.activities;
  const valueOf = (key) => x.actor.getRollable(key)?.value ?? 0;
  const id = await DialogV2.wait({
    window: { title: `${x.actor.name} — ${L("PDVF.Feast.OtherActivity")}` }, classes: [SYSTEM_ID, "pdvf-dialog"], rejectClose: false,
    content: `<div class="form-group"><label>${L("PDVF.Feast.OtherActivity")}</label><select name="activity">${Object.entries(acts).map(([a, key]) =>
      `<option value="${a}">${esc(L(`PDVF.Feast.Activity.${a}`))} — ${esc(x.actor.getRollable(key)?.label ?? "")} ${formatValue(valueOf(key))}</option>`).join("")}</select></div>
      <p class="pdvf-hint">${F("PDVF.Feast.ActivityHint", { mod: signed(x.st.engouement), att: x.st.att })}</p>`,
    buttons: [{ action: "ok", label: L("PDVF.Dialog.Ok"), default: true, callback: (e, b) => b.form.elements.activity.value },
      { action: "cancel", label: L("PDVF.Dialog.Cancel") }]
  });
  if (!id || id === "cancel" || !(id in acts)) return;
  const key = acts[id];
  const title = `${feast.name} — ${L(`PDVF.Feast.Activity.${id}`)}`;
  let result;
  if (key.startsWith("trait.")) result = await traitTest(x.actor, key, { modifier: x.st.engouement, title });
  else result = resultOf(await rollAttribute(x.actor, key, { modifier: x.st.engouement, title, notes: [F("PDVF.Feast.EngouementNote", { mod: signed(x.st.engouement) })] }));
  if (!result) return;
  // Le test critique d'une compétence coche déjà l'expérience ; le succès, ici.
  if (result.outcome === "success" || (result.outcome === "critical" && key.startsWith("trait."))) await x.actor.markExperience(key);
  const glory = result.outcome === "critical" ? x.st.att : 0;
  return request(feast, "activity", { index, activity: id, outcome: result.outcome, glory });
}

/** Quitter le festin après le premier tour (test de Courtoisie). */
export async function leave(feast, index) {
  const x = guestOf(feast, index);
  if (!x || !x.st.present) return;
  if (feast.system.round < 1) return ui.notifications.info(L("PDVF.Feast.Notify.FirstRound"));
  if (!x.st.acted) return ui.notifications.info(L("PDVF.Feast.Notify.ActFirst"));
  const msg = await rollAttribute(x.actor, "skill.courtesy", { title: `${feast.name} — ${L("PDVF.Feast.Leave")}` });
  const result = resultOf(msg);
  if (!result) return;
  if (result.outcome === "success") await x.actor.markExperience("skill.courtesy");
  let loss = 0;
  if (result.outcome === "failure") {
    const r = new Roll(PDVF.feast.leaveLoss.replace(/D/g, "d"));
    await r.evaluate();
    await r.toMessage({ speaker: ChatMessage.getSpeaker({ actor: x.actor }), flavor: L("PDVF.Feast.LeaveLoss") });
    loss = r.total;
  }
  if (result.outcome === "fumble") await loseHonor(x.actor, L("PDVF.Feast.LeaveReason"));
  return request(feast, "leave", { index, outcome: result.outcome, loss });
}
