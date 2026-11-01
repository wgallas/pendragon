/**
 * Côté joueur (et MJ) : les jets que chacun lance lui-même pendant la bataille, puis la demande au MJ.
 * Les mêmes fonctions servent aux boutons de la fiche de bataille et à ceux des cartes de chat.
 */
import { PDVF, SYSTEM_ID } from "../config.mjs";
import { rollAttribute, rollPlain, invokePassion, postPassionCard, signed } from "../dice/tests.mjs";
import { formatValue } from "../rules/resolution.mjs";
import * as R from "../rules/battle.mjs";
import { request, knightActor, findEncounter, onField } from "./engine.mjs";

const L = (k) => game.i18n.localize(k);
const F = (k, d) => game.i18n.format(k, d);
const { DialogV2 } = foundry.applications.api;

/** Le chevalier de la bataille que cet utilisateur joue (choix s'il en a plusieurs). */
export async function pickKnight(battle, { field = true } = {}) {
  const s = battle.system;
  const mine = s.knights.map((k, index) => ({ ...k, index, actor: knightActor(k) }))
    .filter(k => k.actor && (game.user.isGM || k.actor.isOwner) && (!field || k.status === "field"));
  if (!mine.length) { ui.notifications.warn(L("PDVF.Battle.Notify.NoKnightHere")); return null; }
  if (mine.length === 1) return mine[0].index;
  const content = `<div class="form-group"><label>${L("PDVF.Battle.Knight")}</label><select name="index">${mine.map(k => `<option value="${k.index}">${foundry.utils.escapeHTML(k.actor.name)}</option>`).join("")}</select></div>`;
  const r = await DialogV2.wait({
    window: { title: battle.name }, classes: [SYSTEM_ID, "pdvf-dialog"], content, rejectClose: false,
    buttons: [{ action: "ok", label: L("PDVF.Dialog.Ok"), default: true, callback: (e, b) => Number(b.form.elements.index.value) },
      { action: "cancel", label: L("PDVF.Dialog.Cancel") }]
  });
  return typeof r === "number" ? r : null;
}

function outcomeOf(message) {
  return message?.flags?.[SYSTEM_ID]?.outcome ?? message?.getFlag?.(SYSTEM_ID, "outcome") ?? null;
}

/** Malus de Bataille du tour : échec critique du commandant allié au premier tour, chevalier seul. */
function battleModifier(s, k) {
  let mod = 0;
  if (s.state.round === 1 && s.state.firstRoundPenalty) mod += PDVF.battle.firstRoundPenalty;
  if (k?.status === "alone") mod += PDVF.battle.alonePenalty;
  return mod;
}

/** Test de Bataille d'un PJ quand l'Intensité est ratée, puis choix d'une rencontre. */
export async function battleTest(battle, index) {
  const s = battle.system;
  const k = s.knights[index];
  if (s.state.step !== "battle") return ui.notifications.warn(L("PDVF.Battle.Notify.NotNow"));
  if (k.battleRoll) return ui.notifications.info(L("PDVF.Battle.Notify.AlreadyRolled"));
  const actor = knightActor(k);
  const msg = await rollAttribute(actor, "skill.battle", {
    modifier: battleModifier(s, k), subtitle: battle.name,
    verdict: (o) => ({ text: L(`PDVF.Battle.BattleTestResult.${o}`), cls: R.isSuccess(o) ? "victory" : "tie" })
  });
  const outcome = outcomeOf(msg);
  if (!outcome) return;
  let proposal = "";
  if (R.isSuccess(outcome)) proposal = await chooseEncounter(battle, outcome === "critical");
  return request(battle, "battleTest", { index, outcome, proposal: proposal ?? "" });
}

/** Choix d'une rencontre parmi les cartes (une opportunité sur un succès critique). */
async function chooseEncounter(battle, critical) {
  const s = battle.system;
  const opts = s.encounters.filter(e => e.kind === "opponent" || (critical && !e.used))
    .map(e => `<option value="${e.id}">${foundry.utils.escapeHTML(e.name)}${e.kind === "opportunity" ? ` — ${L("PDVF.Battle.Kind.opportunity")}` : ""}</option>`);
  const content = `<p>${L(critical ? "PDVF.Battle.ChooseCritical" : "PDVF.Battle.ChooseEncounter")}</p>
    <div class="form-group"><label>${L("PDVF.Battle.Encounter")}</label><select name="id"><option value="">${L("PDVF.Battle.KeepDefault")}</option>${opts.join("")}</select></div>`;
  const r = await DialogV2.wait({
    window: { title: L("PDVF.Battle.BattleTest") }, classes: [SYSTEM_ID, "pdvf-dialog"], content, rejectClose: false,
    buttons: [{ action: "ok", label: L("PDVF.Dialog.Ok"), default: true, callback: (e, b) => b.form.elements.id.value }]
  });
  return typeof r === "string" && r !== "ok" ? r : "";
}

/** Test de Bataille du commandant du conroi (charge, tirs, pertes). */
export async function commanderTest(battle, purpose) {
  const s = battle.system;
  const step = { chargeTest: "charge", rangedTest: "resolve" }[purpose];
  if (step && s.state.step !== step) return ui.notifications.warn(L("PDVF.Battle.Notify.NotNow"));
  const title = L(`PDVF.Battle.${purpose === "chargeTest" ? "ChargeTest" : purpose === "rangedTest" ? "RangedTest" : "LossesTest"}`);
  const verdict = (o) => {
    const text = purpose === "chargeTest" ? L(`PDVF.Battle.Charge.${R.chargeOpportunity(o, s.state.engagedLast)}`)
      : purpose === "rangedTest" ? F("PDVF.Battle.RangedResult", { n: R.rangedRounds(o) })
        : F("PDVF.Battle.LossesResult", R.conroiLosses(o, s.conroi.npcKnights, PDVF.battle));
    return { text, cls: R.isSuccess(o) ? "victory" : "defeat" };
  };
  const cmd = s.knights.find(k => k.uuid === s.conroi.commander);
  const actor = s.conroi.commander ? fromUuidSync(s.conroi.commander) : null;
  const modifier = purpose === "lossesTest" ? 0 : battleModifier(s, cmd);
  let outcome;
  if (actor) {
    if (!game.user.isGM && !actor.isOwner) return ui.notifications.warn(L("PDVF.Battle.Notify.CommanderOnly"));
    outcome = outcomeOf(await rollAttribute(actor, "skill.battle", { modifier, title, subtitle: battle.name, verdict }));
  } else {
    if (!game.user.isGM) return ui.notifications.warn(L("PDVF.Battle.Notify.CommanderOnly"));
    if (s.conroi.commanderBattle === null) return ui.notifications.warn(L("PDVF.Battle.Notify.CommanderSkill"));
    outcome = (await rollPlain({ name: s.conroi.commanderName || L("PDVF.Battle.Commander"), label: L("PDVF.Skill.battle"),
      value: s.conroi.commanderBattle, modifier, title, subtitle: battle.name, alias: battle.name, verdict })).outcome;
  }
  if (outcome) return request(battle, purpose, { outcome });
}

/** Posture d'un chevalier. */
export async function setPosture(battle, index, posture) {
  const s = battle.system;
  if (s.state.step !== "posture") return ui.notifications.warn(L("PDVF.Battle.Notify.NotNow"));
  if (posture === "cowardly") {
    const ok = await DialogV2.confirm({ window: { title: L("PDVF.Battle.Posture.cowardly") }, content: `<p>${L("PDVF.Battle.CowardConfirm")}</p>`, classes: [SYSTEM_ID, "pdvf-dialog"] });
    if (!ok) return;
  }
  return request(battle, "posture", { index, posture });
}

/** Compétences et traits qu'une passion peut inspirer pendant la bataille. */
const BATTLE_TARGETS = ["skill.battle", "skill.charge", "skill.sword", "skill.spear", "skill.horsemanship", "skill.greatWeapon",
  "skill.hafted", "skill.brawling", "skill.bow", "skill.crossbow", "skill.thrown", "trait.valorous.left", "trait.energetic.left"];

/** Passion invoquée pour le tour de bataille (une seule par bataille). */
export async function invoke(battle, index) {
  const s = battle.system;
  const k = s.knights[index];
  if (k.invoked) return ui.notifications.info(F("PDVF.Battle.Notify.AlreadyInvoked", { source: k.invoked }));
  const actor = knightActor(k);
  const passions = actor.listInvokable();
  const targets = BATTLE_TARGETS.map(key => actor.getRollable(key)).filter(Boolean);
  const content = `<div class="form-group"><label>${L("PDVF.Invoke.Passion")}</label><select name="key">${passions.map(p =>
    `<option value="${p.key}" ${p.disabled ? "disabled" : ""}>${foundry.utils.escapeHTML(p.label)} ${formatValue(p.value)}${p.note ? ` — ${foundry.utils.escapeHTML(p.note)}` : ""}</option>`).join("")}</select></div>
    <div class="form-group"><label>${L("PDVF.Battle.InspiredFor")}</label><select name="target">${targets.map(t =>
    `<option value="${t.key}">${foundry.utils.escapeHTML(t.label)} ${formatValue(t.value)}</option>`).join("")}</select></div>
    <p class="hint">${L("PDVF.Battle.InvokeHint")}</p>`;
  const r = await DialogV2.wait({
    window: { title: L("PDVF.Battle.Invoke") }, classes: [SYSTEM_ID, "pdvf-dialog"], content, rejectClose: false,
    buttons: [{ action: "ok", label: L("PDVF.Dialog.Roll"), default: true, callback: (e, b) => ({ key: b.form.elements.key.value, target: b.form.elements.target.value }) },
      { action: "cancel", label: L("PDVF.Dialog.Cancel") }]
  });
  if (!r?.key) return;
  const inv = await invokePassion(actor, r.key, { target: r.target });
  if (!inv) return;
  await postPassionCard(actor, inv, [F("PDVF.Battle.InvokeLasts", { round: s.state.round })]);
  return request(battle, "invoked", { index, source: inv.rollable.label, target: inv.effect.bonus ? r.target : "" });
}

/** Test d'Écuyer de fin de tour (facultatif). */
export async function squireTest(battle, index) {
  const s = battle.system;
  const k = s.knights[index];
  if (s.state.step !== "squire") return ui.notifications.warn(L("PDVF.Battle.Notify.NotNow"));
  if (k.squire) return ui.notifications.info(L("PDVF.Battle.Notify.AlreadyRolled"));
  if (k.squireLost) return ui.notifications.warn(L("PDVF.Battle.Notify.SquireLost"));
  const actor = knightActor(k);
  const squire = (actor.system.followers ?? []).map(f => { try { return fromUuidSync(f.uuid); } catch (e) { return null; } })
    .find(a => a?.type === "pnj" && a.system.category === "squire");
  const verdict = (o) => ({ text: L(`PDVF.Battle.SquireResult.${o}`), cls: R.isSuccess(o) ? "victory" : "defeat" });
  let outcome;
  if (squire) outcome = outcomeOf(await rollAttribute(squire, "squire.skill", { subtitle: F("PDVF.Battle.SquireOf", { name: actor.name }), verdict }));
  else outcome = (await rollPlain({ actor, name: L("PDVF.Battle.Squire"), label: L("PDVF.Npc.SquireSkill"), value: PDVF.squireSkillBase,
    title: L("PDVF.Battle.SquireTest"), subtitle: F("PDVF.Battle.SquireOf", { name: actor.name }), notes: [L("PDVF.Battle.NoSquire")], verdict })).outcome;
  if (outcome) return request(battle, "squireTest", { index, outcome });
}

/** Tour de combat supplémentaire : tests d'Énergique et de Valeureux. */
export async function extraRound(battle, index) {
  const actor = knightActor(battle.system.knights[index]);
  const results = [];
  for (const key of ["trait.energetic.left", "trait.valorous.left"]) {
    const r = actor.getRollable(key);
    results.push((await rollPlain({ actor, name: actor.name, label: r.label, value: r.value, title: L("PDVF.Battle.ExtraRound") })).outcome);
  }
  const ok = results.every(R.isSuccess);
  ui.notifications.info(L(ok ? "PDVF.Battle.ExtraRoundYes" : "PDVF.Battle.ExtraRoundNo"));
}

/** Tir : touche le cheval (1–4) ou le cavalier (5–6). */
export async function missileHit(battle) {
  const roll = await new Roll("1d6").evaluate();
  return roll.toMessage({ speaker: { alias: battle.name }, flavor: L(roll.total <= 4 ? "PDVF.Battle.HitHorse" : "PDVF.Battle.HitRider") });
}

/* -------------------------------------------- */
/*  Boutons des cartes de chat                   */
/* -------------------------------------------- */

export function onRenderChatMessage(message, html) {
  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root) return;
  for (const button of root.querySelectorAll("[data-pdvf-battle]")) {
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      const battle = await fromUuid(button.dataset.battle);
      if (!battle) return ui.notifications.warn(L("PDVF.Battle.Notify.Missing"));
      const action = button.dataset.pdvfBattle;
      if (action === "open") return battle.sheet.render(true);
      if (action === "chargeTest") return commanderTest(battle, "chargeTest");
      const index = await pickKnight(battle, { field: action !== "squireTest" });
      if (index === null) return;
      if (action === "battleTest") return battleTest(battle, index);
      if (action === "posture") return setPosture(battle, index, button.dataset.value);
      if (action === "squireTest") return squireTest(battle, index);
    });
  }
}

export { onField, findEncounter, signed };
