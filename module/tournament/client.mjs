/**
 * Côté joueur (et MJ) : les jets que chacun lance lui-même pendant le tournoi, puis la demande au MJ.
 * Les mêmes fonctions servent aux boutons de la fiche du tournoi et à ceux des cartes de chat.
 */
import { PDVF, SYSTEM_ID } from "../config.mjs";
import * as T from "../rules/tournament.mjs";
import { rollAttribute, rollPlain } from "../dice/tests.mjs";
import { formatValue } from "../rules/resolution.mjs";
import { loseHitPoints, postCombatCard } from "../combat/damage.mjs";
import { request, knightActor } from "./engine.mjs";

const L = (k) => game.i18n.localize(k);
const F = (k, d) => game.i18n.format(k, d);
const { DialogV2 } = foundry.applications.api;
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));

/** Les chevaliers du tournoi que cet utilisateur joue. */
function myKnights(tournament) {
  return tournament.system.knights.map((k, index) => ({ ...k, index, actor: knightActor(k) }))
    .filter(k => k.actor && (game.user.isGM || k.actor.isOwner));
}

async function choose(title, label, options) {
  const content = `<div class="form-group"><label>${label}</label><select name="value">${options.map(o => `<option value="${esc(o.value)}" ${o.selected ? "selected" : ""}>${esc(o.label)}</option>`).join("")}</select></div>`;
  const r = await DialogV2.wait({
    window: { title }, classes: [SYSTEM_ID, "pdvf-dialog"], content, rejectClose: false,
    buttons: [{ action: "ok", label: L("PDVF.Dialog.Ok"), default: true, callback: (e, b) => b.form.elements.value.value },
      { action: "cancel", label: L("PDVF.Dialog.Cancel") }]
  });
  return r && r !== "cancel" ? r : null;
}

/** Résultat complet du test lu sur la carte de chat. */
function resultOf(message) {
  return message?.flags?.[SYSTEM_ID]?.result ?? message?.getFlag?.(SYSTEM_ID, "result") ?? null;
}

/** Compétence d'arme proposée pour la mêlée : la meilleure, au choix du joueur. */
const MELEE_SKILLS = ["sword", "hafted", "greatWeapon", "spear", "brawling"];

/**
 * Épreuve en procédure abrégée (Table 3.16) : test opposé au NDT pour la Gloire, puis un second pour les
 * dégâts (indépendants de l'armure, soignés seulement par la guérison naturelle).
 */
export async function abridged(tournament, index, event) {
  const s = tournament.system;
  const k = s.knights[index];
  const actor = knightActor(k);
  if (!actor) return;
  if (k.abridged[event]?.row) return ui.notifications.info(L("PDVF.Tournament.Notify.AlreadyDone"));
  if (s.ndt === null) return ui.notifications.warn(L("PDVF.Tournament.Notify.NoNdt"));
  let skill = "charge";
  if (event === "melee") {
    const best = MELEE_SKILLS.reduce((a, b) => ((actor.system.skills[b]?.value ?? 0) > (actor.system.skills[a]?.value ?? 0) ? b : a));
    skill = await choose(L("PDVF.Tournament.Event.melee"), L("PDVF.Tournament.WeaponSkill"),
      MELEE_SKILLS.map(id => ({ value: id, label: `${L(`PDVF.Skill.${id}`)} ${formatValue(actor.system.skills[id]?.value ?? 0)}`, selected: id === best })));
    if (!skill) return;
  }
  const cfg = PDVF.tournament;
  const size = s.sizeData;
  const title = `${tournament.name} — ${L(`PDVF.Tournament.Event.${event}`)}`;
  const versus = async (label) => {
    const msg = await rollAttribute(actor, `skill.${skill}`, { title, subtitle: label });
    const pc = resultOf(msg);
    if (!pc) return null;
    const ndt = await rollPlain({ name: L("PDVF.Tournament.Ndt"), label: L("PDVF.Tournament.Ndt"), value: s.ndt, title, subtitle: label, alias: L("PDVF.Tournament.Ndt") });
    return T.abridgedRow(pc, ndt.result);
  };
  const row = await versus(L("PDVF.Tournament.GloryTest"));
  if (!row) return;
  const glory = T.abridgedGlory(row, size, cfg.abridged);
  const damageRow = await versus(L("PDVF.Tournament.DamageTest"));
  if (!damageRow) return;
  const formula = cfg.abridged[damageRow]?.damage ?? "";
  let damage = 0;
  const lines = [F("PDVF.Tournament.Line.AbridgedGlory", { row: L(`PDVF.Tournament.Row.${row}`), glory }),
    F("PDVF.Tournament.Line.AbridgedDamageRow", { row: L(`PDVF.Tournament.Row.${damageRow}`), formula: formula || "—" })];
  const rolls = [];
  const undo = [];
  if (formula) {
    const r = new Roll(formula.replace(/D/g, "d"));
    await r.evaluate();
    rolls.push(r);
    damage = r.total;
    const out = await loseHitPoints(actor, damage);
    lines.push(...out.lines, L("PDVF.Tournament.Line.NaturalOnly"));
    undo.push(out.undo);
  }
  await postCombatCard({ actor, title, subtitle: actor.name, sections: [{ lines }], rolls, undo });
  return request(tournament, "abridged", { index, event, row, skill, glory, damageRow, damage });
}

/** Charge d'une passe de joute (plafonnée par l'Équitation). */
export async function charge(tournament, index = null) {
  const s = tournament.system;
  const open = s.joust.matches.filter(m => m.state === "open");
  const mine = [];
  for (const m of open) {
    for (const side of [m.a, m.b]) {
      if (side.kind !== "pc" || side.roll.outcome) continue;
      if (index !== null && side.index !== Number(index)) continue;
      const actor = knightActor(s.knights[side.index]);
      if (actor && (game.user.isGM || actor.isOwner)) mine.push({ m, side, actor });
    }
  }
  if (!mine.length) return ui.notifications.info(L("PDVF.Tournament.Notify.NoChargeToRoll"));
  let pick = mine[0];
  if (mine.length > 1) {
    const id = await choose(tournament.name, L("PDVF.Tournament.Knight"), mine.map((x, i) => ({ value: String(i), label: `${x.actor.name} — ${x.m.a.name} / ${x.m.b.name}` })));
    if (id === null) return;
    pick = mine[Number(id)];
  }
  const { m, side, actor } = pick;
  const cap = Math.min(0, (Number(actor.system.skills.horsemanship?.value) || 0) - (Number(actor.system.skills.charge?.value) || 0));
  const opponent = m.a === side ? m.b : m.a;
  const msg = await rollAttribute(actor, "skill.charge", {
    modifier: cap, title: F("PDVF.Tournament.MatchTitle", { a: m.a.name, b: m.b.name }),
    subtitle: `${tournament.name} — ${F("PDVF.Tournament.PassN", { pass: m.pass + 1 })}`,
    notes: [F("PDVF.Tournament.ChargeNote", { name: opponent.name }), ...(cap ? [F("PDVF.Tournament.CapNote", { cap })] : [])]
  });
  const result = resultOf(msg);
  if (!result) return;
  return request(tournament, "charge", { index: side.index, match: m.id, result });
}

/** Test de compétence de cour (Gloire : l'ATT, doublée sur un critique ou devant le roi). */
export async function court(tournament, index) {
  const s = tournament.system;
  const k = s.knights[index];
  const actor = knightActor(k);
  if (!actor) return;
  if (k.court.allowed === null) {
    const r = new Roll(String(s.sizeData.courtTests).replace(/D/g, "d"));
    await r.evaluate();
    await r.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: L("PDVF.Tournament.CourtCount") });
    await request(tournament, "courtAllowed", { index, allowed: r.total });
    return;
  }
  if (k.court.tests.length >= k.court.allowed) return ui.notifications.info(L("PDVF.Tournament.Notify.NoCourtLeft"));
  const skill = await choose(L("PDVF.Tournament.CourtTest"), L("PDVF.Tournament.CourtSkill"),
    PDVF.tournament.courtSkills.map(id => ({ value: id, label: `${L(`PDVF.Skill.${id}`)} ${formatValue(actor.system.skills[id]?.value ?? 0)}` })));
  if (!skill) return;
  const msg = await rollAttribute(actor, `skill.${skill}`, { modifier: k.court.penalty || 0, subtitle: tournament.name,
    notes: k.court.penalty ? [L("PDVF.Tournament.DroppedLanceNote")] : [] });
  const result = resultOf(msg);
  if (!result) return;
  const glory = T.courtGlory(actor.system.characteristics.app.value, result.outcome, { royal: s.royal });
  return request(tournament, "court", { index, skill, outcome: result.outcome, glory });
}

/** Festin, messe, tentation : le joueur choisit, le trait correspondant est coché. */
export async function sideEvent(tournament, index, event, choice) {
  const k = tournament.system.knights[index];
  const actor = knightActor(k);
  const key = PDVF.tournament.sideEvents[event]?.[choice];
  if (!actor || !key || k.side[event]) return;
  await actor.markExperience(`trait.${key}`);
  const [id, side] = key.split(".");
  ui.notifications.info(F("PDVF.Tournament.Notify.TraitChecked", { name: actor.name, trait: L(`PDVF.Trait.${id}.${side}`) }));
  return request(tournament, "side", { index, event, choice });
}

/** Bouton « Charge » des cartes de chat du tournoi. */
export function onRenderChatMessage(message, html) {
  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root) return;
  for (const btn of root.querySelectorAll("button[data-pdvf-tournament]")) {
    btn.addEventListener("click", async (ev) => {
      ev.preventDefault();
      const t = await fromUuid(btn.dataset.tournament);
      if (!t) return;
      if (btn.dataset.pdvfTournament === "charge") return charge(t);
    });
  }
}

export { myKnights };
