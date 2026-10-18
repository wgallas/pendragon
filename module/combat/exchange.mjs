/**
 * Échange de combat (Livre du joueur, chap. 7) : un combattant engage un adversaire ciblé,
 * l'adversaire répond par une carte du chat, le MJ résout (Table 7.1), lance les dégâts et
 * les inscrit sur les fiches. Les cartes de résolution portent un bouton « Annuler ».
 */
import { PDVF, SYSTEM_ID } from "../config.mjs";
import * as C from "../rules/combat.mjs";
import * as W from "../rules/wounds.mjs";
import { attackProfiles } from "../rules/equipment.mjs";
import { combatStats, receiveDamage, loseWeapon, undoChanges, postCombatCard, testValue } from "./damage.mjs";
import { STATUS, setStatus } from "./status.mjs";
import { invokePassion, postPassionCard } from "../dice/tests.mjs";

const { DialogV2 } = foundry.applications.api;
const L = (k) => game.i18n.localize(k);
const F = (k, d) => game.i18n.format(k, d);
const SOCKET = `system.${SYSTEM_ID}`;
const signed = (n) => (n > 0 ? `+${n}` : `${n}`);
const esc = (s) => foundry.utils.escapeHTML ? foundry.utils.escapeHTML(String(s ?? "")) : String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* -------------------------------------------- */
/*  Armes d'un combattant                        */
/* -------------------------------------------- */

/** Identifiant de compétence d'après un libellé de PNJ (« Haches et masses » → hafted). */
export function skillIdFromLabel(label) {
  const l = String(label ?? "").trim().toLowerCase();
  if (!l) return "";
  for (const id of Object.keys(PDVF.skills)) {
    if (L(`PDVF.Skill.${id}`).toLowerCase() === l) return id;
  }
  for (const id of Object.keys(PDVF.skills)) {
    const name = L(`PDVF.Skill.${id}`).toLowerCase();
    if (l.startsWith(name) || name.startsWith(l)) return id;
  }
  return "";
}

function knightStats(actor) {
  const s = actor.system;
  const st = combatStats(actor);
  return {
    damageDice: s.derived.damageDice, brawl: s.derived.brawlDamage, horseCharge: st.horseCharge,
    skills: Object.fromEntries(Object.entries(s.skills).map(([k, v]) => [k, v.value]))
  };
}

/**
 * Armes possibles d'un combattant, sous forme de descripteurs pour l'échange.
 */
export function weaponOptions(actor) {
  const out = [];
  const st = combatStats(actor);
  if (actor.type === "chevalier") {
    const stats = knightStats(actor);
    const weapons = actor.items.filter(i => i.type === "arme").sort((a, b) => (b.system.equipped - a.system.equipped) || (a.sort - b.sort));
    for (const item of weapons) {
      const s = item.system;
      for (const p of attackProfiles(s, stats)) {
        const thrown = p.mode === "thrown";
        const skill = p.skill;
        out.push({
          ref: `item:${item.id}:${p.mode}`, item: item.id, name: thrown ? `${item.name} (${L("PDVF.Gear.ThrownShort")})` : item.name,
          skill, skillValue: p.skillValue ?? 0, formula: p.formula, damageLabel: p.label,
          sword: skill === "sword" && !s.swordTie, swordTie: !!s.swordTie, long: !!s.long && !thrown, twoHanded: !!s.twoHanded,
          parry: thrown ? 0 : Number(s.parry) || 0, lance: !thrown && (skill === "charge" || (skill === "spear" && !!s.long)),
          hafted: ["hafted", "greatWeapon", "spear", "charge"].includes(skill), unarmed: false,
          shieldBreaker: !!s.shieldBreaker, blunt: !!s.blunt,
          ranged: thrown || s.group === "missile", equipped: s.equipped,
          alts: thrown ? [] : (s.alts ?? []).map((a, i) => ({ index: i, label: a.label, dice: Number(a.dice) || 0, when: a.when ?? "" }))
        });
      }
    }
    out.push(unarmedOption(actor, st, actor.system.skills.brawling.value));
  } else {
    (actor.system.attacks ?? []).forEach((a, i) => {
      const id = skillIdFromLabel(a.skill) || skillIdFromLabel(a.name);
      const name = a.name || a.skill || L("PDVF.Npc.UnnamedAttack");
      const lance = id === "charge" || /lance/i.test(name);
      out.push({
        ref: `attack:${i}`, name, skill: id || "sword", skillValue: Number(a.value) || 0, formula: a.damage || "", damageLabel: a.damage || "—",
        sword: id === "sword", swordTie: ["hafted", "greatWeapon", "spear"].includes(id), long: lance || /grande hache|hallebarde|guisarme|vouge/i.test(name) || id === "greatWeapon",
        twoHanded: id === "greatWeapon", parry: 0, lance, hafted: ["hafted", "greatWeapon", "spear", "charge"].includes(id), unarmed: false,
        shieldBreaker: /hache/i.test(name), blunt: false, ranged: ["bow", "crossbow", "thrown"].includes(id), equipped: true,
        alts: /masse/i.test(name) ? [{ index: 0, label: "contre une armure de mailles", dice: 1, when: "mail" }] : []
      });
    });
    const brawlRow = (actor.system.attacks ?? []).find(a => skillIdFromLabel(a.skill) === "brawling");
    out.push(unarmedOption(actor, st, Number(brawlRow?.value) || Number(actor.system.defaultSkill) || 10));
  }
  return out;
}

function unarmedOption(actor, st, value) {
  return {
    ref: "unarmed", name: L("PDVF.Combat.Unarmed"), skill: "brawling", skillValue: Number(value) || 0, formula: String(st.brawl || 1), damageLabel: String(st.brawl || 1),
    sword: false, swordTie: false, long: false, twoHanded: false, parry: 0, lance: false, hafted: false, unarmed: true,
    shieldBreaker: false, blunt: false, ranged: false, equipped: true, alts: []
  };
}

function findOption(actor, ref) {
  const opts = weaponOptions(actor);
  return opts.find(o => o.ref === ref) ?? opts[0];
}

/**
 * Compétence testée par une action (clé d'Attribut du chevalier), pour les inspirations des passions.
 * Les actions qui testent le Mouvement (Esquiver, Se désengager) n'en ont pas.
 */
export function skillKeyFor(actor, decl, opt) {
  if (actor?.type !== "chevalier" || !opt) return null;
  const a = C.ACTIONS[decl.action] ?? C.ACTIONS.attack;
  if (a.skill === "move" || a.skill === "none") return null;
  if (decl.action === "charge") return opt.lance ? "skill.charge" : `skill.${opt.skill}`;
  if (a.skill === "brawling") return "skill.brawling";
  return `skill.${opt.skill}`;
}

/* -------------------------------------------- */
/*  Acteurs et jetons                            */
/* -------------------------------------------- */

function actorTokenRef(actor, token = null) {
  const tok = token ?? actor.getActiveTokens?.(true, true)?.[0] ?? null;
  return { actor: actor.uuid, token: tok?.uuid ?? null, name: tok?.name ?? actor.name, img: actor.img };
}

async function resolveActor(ref) {
  if (ref?.token) {
    const t = await fromUuid(ref.token);
    if (t?.actor) return t.actor;
  }
  return ref?.actor ? fromUuid(ref.actor) : null;
}

function resolveActorSync(ref) {
  try {
    if (ref?.token) { const t = fromUuidSync(ref.token); if (t?.actor) return t.actor; }
    return ref?.actor ? fromUuidSync(ref.actor) : null;
  } catch (e) { return null; }
}

/* -------------------------------------------- */
/*  Déclaration                                  */
/* -------------------------------------------- */

/**
 * Boîte de déclaration : action, arme et options.
 * @returns {Promise<object|null>}
 */
async function declare(actor, { defending = false, preset = null, opponentName = "", attackerAction = "", modifier = 0, invoke = "" } = {}) {
  const st = combatStats(actor);
  const options = weaponOptions(actor);
  const presetOpt = preset ? options.find(o => o.ref === preset) : null;
  const ranged = options.some(o => o.ranged);
  const actions = C.actionsFor({ mounted: st.mounted, defending, ranged });
  const defAction = defending ? "attack"
    : (presetOpt?.ranged ? "ranged" : st.mounted && options.some(o => o.lance && o.equipped) ? "charge" : "attack");
  const actionOpts = actions.map(id => `<option value="${id}" ${id === defAction ? "selected" : ""}>${L(`PDVF.Combat.Action.${id}`)}</option>`).join("");
  const firstRef = presetOpt?.ref ?? (defAction === "charge" ? options.find(o => o.lance && o.equipped)?.ref : options.find(o => o.equipped && !o.ranged)?.ref) ?? options[0]?.ref;
  const weaponOpts = options.map(o => `<option value="${o.ref}" ${o.ref === firstRef ? "selected" : ""}>${esc(o.name)} — ${L(`PDVF.Skill.${o.skill}`)} ${o.skillValue}${o.damageLabel ? ` · ${esc(o.damageLabel)}` : ""}</option>`).join("");
  const altSet = new Map();
  for (const o of options) for (const a of o.alts) if (!a.when) altSet.set(a.label, a.label);
  const altOpts = [`<option value="">${L("PDVF.Combat.NoVariant")}</option>`, ...[...altSet.keys()].map(l => `<option value="${esc(l)}">${esc(l)}</option>`)].join("");
  const warn = [];
  if (st.unconscious) warn.push(L("PDVF.Combat.Warn.Unconscious"));
  if (st.disarmed) warn.push(L("PDVF.Combat.Warn.Disarmed"));
  if (st.prone) warn.push(L("PDVF.Combat.Warn.Prone"));
  const content = `
    ${opponentName ? `<p class="pdvf-hint">${F(defending ? "PDVF.Combat.RespondTo" : "PDVF.Combat.EngageVs", { name: esc(opponentName) })}${st.mounted ? ` · ${L("PDVF.Status.mounted")}` : ` · ${L("PDVF.Combat.OnFoot")}`}</p>` : ""}
    ${warn.map(w => `<p class="pdvf-warn">${w}</p>`).join("")}
    <div class="form-group"><label>${L("PDVF.Combat.ActionLabel")}</label><select name="action">${actionOpts}</select></div>
    <div class="form-group"><label>${L("PDVF.Combat.Weapon")}</label><select name="ref">${weaponOpts}</select></div>
    <div class="form-group"><label>${L("PDVF.Combat.Variant")}</label><select name="alt">${altOpts}</select></div>
    <div class="form-group"><label>${L("PDVF.Combat.Opponents")}</label><input type="number" name="opponents" value="1" min="1" max="3" step="1"></div>
    <div class="form-group"><label>${L("PDVF.Combat.Modifier")}</label><input type="number" name="modifier" value="${Number(modifier) || 0}" step="1"></div>
    ${passionFields(actor, invoke)}
    <div class="form-group"><label>${L("PDVF.Combat.Pull")}</label><select name="pull">
      <option value="">—</option><option value="half">${L("PDVF.Combat.PullHalf")}</option>
      <option value="1">−1D6</option><option value="2">−2D6</option><option value="3">−3D6</option><option value="4">−4D6</option></select></div>
    <div class="form-group"><label>${L("PDVF.Combat.LongRange")}</label><input type="checkbox" name="longRange"></div>
    ${defending ? "" : `<div class="form-group"><label>${L("PDVF.Combat.TargetAware")}</label><input type="checkbox" name="aware" checked></div>`}
    <p class="pdvf-hint">${L("PDVF.Combat.DeclareHint")}</p>`;
  const result = await DialogV2.wait({
    window: { title: defending ? L("PDVF.Combat.RespondTitle") : L("PDVF.Combat.EngageTitle") },
    classes: [SYSTEM_ID, "pdvf-dialog", "pdvf-exchange-dialog"],
    content,
    rejectClose: false,
    buttons: [
      { action: "ok", label: defending ? L("PDVF.Combat.Respond") : L("PDVF.Combat.Engage"), icon: "fa-solid fa-swords", default: true,
        callback: (event, button) => new foundry.applications.ux.FormDataExtended(button.form).object },
      { action: "cancel", label: L("PDVF.Dialog.Cancel") }
    ]
  });
  if (!result || result === "cancel") return null;
  const opt = options.find(o => o.ref === result.ref);
  let action = result.action;
  if (opt?.ranged && !defending && action !== "ranged") action = "ranged";
  if (opt?.unarmed && action === "attack") action = "brawl";
  return {
    action, ref: result.ref, alt: result.alt || "", opponents: Number(result.opponents) || 1, modifier: Number(result.modifier) || 0,
    pull: result.pull || "", longRange: !!result.longRange, aware: result.aware !== false,
    invoke: result.invoke || "", applyInspiration: !!result.applyInspiration
  };
}

/**
 * Champs de passion de la déclaration (chevaliers) : passion à invoquer pour cet échange,
 * inspirations en cours et inspirations qui n'ont pas encore de compétence.
 */
function passionFields(actor, invoke = "") {
  if (actor.type !== "chevalier" || typeof actor.listInvokable !== "function") return "";
  const invokable = actor.listInvokable();
  const opts = [`<option value="">${L("PDVF.Combat.NoPassion")}</option>`,
    ...invokable.map(p => `<option value="${p.key}" ${p.invoked ? "disabled" : ""} ${p.key === invoke && !p.invoked ? "selected" : ""}>${esc(p.label)} ${p.value}${p.invoked ? ` — ${L("PDVF.Invoke.UsedToday")}` : ""}</option>`)];
  const active = actor.activeInspirations();
  const label = (k) => actor.getRollable(k)?.label ?? k;
  const current = active.filter(i => i.target).map(i => `${esc(i.source)} ${signed(i.bonus)} → ${esc(label(i.target))}`);
  const loose = active.filter(i => !i.target);
  return `
    <div class="form-group"><label>${L("PDVF.Combat.InvokePassion")}</label><select name="invoke">${opts.join("")}</select></div>
    ${loose.length ? `<div class="form-group"><label>${F("PDVF.Combat.ApplyLoose", { list: loose.map(i => `${esc(i.source)} ${signed(i.bonus)}`).join(", ") })}</label><input type="checkbox" name="applyInspiration" checked></div>` : ""}
    ${current.length ? `<p class="pdvf-hint">${L("PDVF.Combat.CurrentInspirations")} ${current.join(" ; ")}</p>` : ""}`;
}

/**
 * Passion invoquée pour l'échange (sur le poste du joueur, qui possède le chevalier) : test de passion,
 * carte de chat, inspiration portée sur la compétence de l'action. Les inspirations encore sans
 * compétence peuvent être portées sur elle. Renvoie le bonus d'inspiration qui s'applique.
 */
async function preparePassions(actor, decl) {
  if (actor.type !== "chevalier") return 0;
  const opt = findOption(actor, decl.ref);
  const key = skillKeyFor(actor, decl, opt);
  if (decl.invoke && key) {
    const inv = await invokePassion(actor, decl.invoke, { target: key });
    if (inv) await postPassionCard(actor, inv, inv.effect.bonus ? [] : [L("PDVF.Combat.PassionFailedAct")]);
  }
  if (decl.applyInspiration && key) {
    const rows = actor.activeInspirations().map(({ index, ...x }) => x);
    let changed = false;
    for (const r of rows) if (!r.target && !rows.some(o => o.target === key && o.bonus >= r.bonus)) { r.target = key; changed = true; }
    if (changed) await actor.update({ "system.inspirations": rows });
  }
  return key ? actor.inspirationBonus(key) : 0;
}

/* -------------------------------------------- */
/*  Engager                                      */
/* -------------------------------------------- */

/**
 * Engage le jeton ciblé.
 * @param {Actor} actor
 * @param {object} [opts] { weapon: référence d'arme proposée, token }
 */
export async function engage(actor, { weapon = null, token = null, modifier = 0, invoke = "" } = {}) {
  const target = [...(game.user.targets ?? [])][0];
  if (!target?.actor) return ui.notifications.warn(L("PDVF.Combat.Notify.NoTarget"));
  if (target.actor === actor || target.actor.uuid === actor.uuid) return ui.notifications.warn(L("PDVF.Combat.Notify.SelfTarget"));
  const decl = await declare(actor, { preset: weapon, opponentName: target.name, modifier, invoke });
  if (!decl) return null;
  decl.inspiration = await preparePassions(actor, decl);
  const a = actorTokenRef(actor, token);
  const b = { actor: target.actor.uuid, token: target.document.uuid, name: target.name, img: target.actor.img };
  const state = { a: { ...a, decl }, b: { ...b, decl: null }, state: "declared" };
  // Tir : pas de réponse, le MJ résout aussitôt (le bouclier de la cible gêne le tireur si elle se sait visée)
  if (decl.action === "ranged") {
    const msg = await postDeclaration(actor, state);
    await requestResolve(msg, { action: "none", ref: "", opponents: 1, modifier: 0, pull: "", longRange: false, aware: decl.aware });
    return msg;
  }
  return postDeclaration(actor, state);
}

async function postDeclaration(actor, ex) {
  const attacker = await resolveActor(ex.a);
  const opt = attacker ? findOption(attacker, ex.a.decl.ref) : null;
  const lines = [F("PDVF.Combat.Line.Declared", {
    name: ex.a.name, action: L(`PDVF.Combat.Action.${ex.a.decl.action}`), weapon: opt?.name ?? "", target: ex.b.name
  })];
  const buttons = ex.a.decl.action === "ranged" ? [] : [
    { action: "respond", label: L("PDVF.Combat.Respond"), icon: "fa-solid fa-shield-halved" },
    { action: "unopposed", label: L("PDVF.Combat.Unopposed"), icon: "fa-solid fa-person-falling" },
    { action: "cancel", label: L("PDVF.Dialog.Cancel"), icon: "fa-solid fa-xmark" }
  ];
  return postCombatCard({
    actor, title: F("PDVF.Combat.ExchangeTitle", { a: ex.a.name, b: ex.b.name }), subtitle: L("PDVF.Combat.Waiting"),
    sections: [{ lines }], buttons, flags: { exchange: ex }
  });
}

/** Réponse du défenseur (depuis la carte). */
export async function respond(message, { unopposed = false } = {}) {
  const ex = message.getFlag(SYSTEM_ID, "exchange");
  if (!ex || ex.state !== "declared") return;
  const defender = await resolveActor(ex.b);
  if (!defender) return;
  let decl;
  if (unopposed) decl = { action: "none", ref: "", opponents: 1, modifier: 0, pull: "", longRange: false };
  else {
    decl = await declare(defender, { defending: true, opponentName: ex.a.name, attackerAction: ex.a.decl.action });
    if (!decl) return;
    decl.inspiration = await preparePassions(defender, decl);
  }
  return requestResolve(message, decl);
}

/* -------------------------------------------- */
/*  Socket : tout se résout chez le MJ           */
/* -------------------------------------------- */

function requestResolve(message, decl) {
  if (game.user.isGM) return performResolve(message, decl, game.user);
  if (!game.users.activeGM) return ui.notifications.warn(L("PDVF.Combat.Notify.NoGM"));
  game.socket.emit(SOCKET, { type: "combat", op: "resolve", message: message.id, decl, user: game.user.id });
}

export function requestUndo(message) {
  if (game.user.isGM) return performUndo(message, game.user);
  if (!game.users.activeGM) return ui.notifications.warn(L("PDVF.Combat.Notify.NoGM"));
  game.socket.emit(SOCKET, { type: "combat", op: "undo", message: message.id, user: game.user.id });
}

export function requestCancel(message) {
  if (game.user.isGM || message.isAuthor) return performCancel(message);
  if (!game.users.activeGM) return ui.notifications.warn(L("PDVF.Combat.Notify.NoGM"));
  game.socket.emit(SOCKET, { type: "combat", op: "cancel", message: message.id, user: game.user.id });
}

let queue = Promise.resolve();
export function onCombatSocket(data) {
  if (data?.type !== "combat" || !game.users.activeGM?.isSelf) return;
  const message = game.messages.get(data.message);
  const user = game.users.get(data.user);
  if (!message || !user) return;
  queue = queue.then(async () => {
    if (data.op === "resolve") await performResolve(message, data.decl, user);
    else if (data.op === "undo") await performUndo(message, user);
    else if (data.op === "cancel") await performCancel(message, user);
  }).catch(err => console.error(`${SYSTEM_ID} | Combat`, err));
}

function owns(user, ref) {
  const actor = resolveActorSync(ref);
  return user.isGM || !!actor?.testUserPermission?.(user, "OWNER");
}

async function performCancel(message, user = game.user) {
  const ex = message.getFlag(SYSTEM_ID, "exchange");
  if (!ex || ex.state !== "declared") return;
  if (!user.isGM && !owns(user, ex.a)) return;
  ex.state = "cancelled";
  await message.update({ content: message.content.replace(/<div class="pdvf-card-buttons">[\s\S]*?<\/div>/, `<p class="pdvf-hint">${L("PDVF.Combat.Cancelled")}</p>`), [`flags.${SYSTEM_ID}.exchange`]: ex });
}

async function performUndo(message, user) {
  const flags = message.flags?.[SYSTEM_ID] ?? {};
  if (flags.undone || !flags.undo?.length) return;
  const allowed = user.isGM || flags.undo.every(r => { try { return fromUuidSync(r.actor)?.testUserPermission?.(user, "OWNER"); } catch (e) { return false; } });
  if (!allowed) return;
  await undoChanges(flags.undo);
  if (flags.battleKill) {
    const battle = await fromUuid(flags.battleKill.battle);
    if (battle) await game.pendragon.battle.engine.perform(battle, "removeKill", { index: flags.battleKill.index }, game.user.id);
  }
  await message.update({
    content: message.content.replace(/<div class="pdvf-card-buttons pdvf-undo">[\s\S]*?<\/div>/, `<p class="pdvf-hint">${F("PDVF.Combat.Undone", { name: user.name })}</p>`),
    [`flags.${SYSTEM_ID}.undone`]: true
  });
}

/* -------------------------------------------- */
/*  Résolution                                   */
/* -------------------------------------------- */

/** Côté d'un échange : valeurs testées et modificateurs. */
function sideFor(actor, decl) {
  const st = combatStats(actor);
  const opt = decl.action === "none" ? null : findOption(actor, decl.ref);
  const knight = actor.type === "chevalier";
  const chargeValue = knight ? actor.system.skills.charge.value : (opt?.skill === "charge" ? opt.skillValue : (weaponOptions(actor).find(o => o.skill === "charge")?.skillValue ?? 0));
  const brawling = knight ? actor.system.skills.brawling.value : (weaponOptions(actor).find(o => o.unarmed)?.skillValue ?? 10);
  const move = st.mounted && decl.action === "disengage" && st.horseMove ? st.horseMove : st.move;
  const key = skillKeyFor(actor, decl, opt);
  return {
    actor, st, decl, opt, key,
    base: C.baseValue({ action: decl.action, weaponSkill: opt?.skillValue ?? 0, charge: chargeValue, horsemanship: st.horsemanship, move, brawling, mounted: st.mounted, lance: !!opt?.lance }),
    // Bonus d'inspiration : celui que voit le MJ, ou celui que le joueur vient d'obtenir (la mise à jour peut arriver après)
    inspiration: Math.max(knight && key && typeof actor.inspirationBonus === "function" ? actor.inspirationBonus(key) : 0, Number(decl.inspiration) || 0)
  };
}

function modifiersFor(self, other) {
  return C.exchangeModifiers(
    { action: self.decl.action, mounted: self.st.mounted, prone: self.st.prone, weapon: self.opt, opponents: self.decl.opponents, longRange: self.decl.longRange,
      shield: self.st.shieldInfo, manual: self.decl.modifier, inspiration: self.inspiration },
    { action: other.decl.action, mounted: other.st.mounted, prone: other.st.prone, weapon: other.opt }
  );
}

/** Formule des dégâts que `att` inflige à `def`. */
function damageFormula(att, def, bonusDice) {
  const o = att.opt;
  const notes = [];
  let f;
  let half = !!o?.blunt;
  if (att.decl.action === "charge") {
    if (o.lance) f = att.st.horseCharge || o.formula;
    else f = C.chargeWeaponFormula(o.formula, att.st.horseCharge, bonusDice >= 4);
    if (!f) notes.push(L("PDVF.Combat.Warn.NoHorseCharge"));
  } else if (att.decl.action === "setSpear" && def.decl.action === "charge") {
    f = def.st.horseCharge || def.opt?.formula || o.formula;
    notes.push(L("PDVF.Combat.Line.SetSpear"));
  } else if (att.decl.action === "brawl" && o.unarmed) {
    f = String(att.st.brawl || 1);
  } else f = o?.formula;
  if (!f) return { formula: null, half, notes };
  // Variantes : d'office contre mailles, plates ou sans armure ; à la main sinon
  for (const a of o?.alts ?? []) {
    const auto = (a.when === "mail" && def.st.mail) || (a.when === "plate" && def.st.plate) || (a.when === "unarmored" && def.st.unarmored);
    if (auto || (!a.when && a.label === att.decl.alt)) { f = C.addDice(f, a.dice); notes.push(F("PDVF.Combat.Line.Variant", { label: a.label, dice: a.dice })); }
  }
  if (att.decl.action === "pull" && att.decl.pull) {
    if (att.decl.pull === "half") { half = true; notes.push(L("PDVF.Combat.Line.PullHalf")); }
    else { f = C.addDice(f, -Number(att.decl.pull)); notes.push(F("PDVF.Combat.Line.PullDice", { dice: att.decl.pull })); }
  }
  if (bonusDice) f = C.addDice(f, bonusDice);
  return { formula: f, half, notes };
}

/** Bouclier ou parade du défenseur sur un succès partiel : la meilleure des deux protections. */
function shieldOrParry(def) {
  const shield = def.opt?.twoHanded ? 0 : def.st.shield;
  const parry = Number(def.opt?.parry) || 0;
  if (!shield && !parry) return { value: 0, isShield: false };
  return shield >= parry ? { value: shield, isShield: true } : { value: parry, isShield: false };
}

/** Pénalité de tir due au bouclier d'une cible qui se sait visée (p. 152). */
function rangedShieldPenalty(def) {
  if (!def.st.shield) return 0;
  if (def.st.shieldInfo) return def.st.shieldInfo.noMissile ? 0 : Number(def.st.shieldInfo.rangedPenalty) || 0;
  return def.st.shield >= 6 ? -10 : 0;
}

async function performResolve(message, bDecl, user) {
  const ex = message.getFlag(SYSTEM_ID, "exchange");
  if (!ex || ex.state !== "declared") return;
  if (!user.isGM && !owns(user, ex.b) && !(bDecl.action === "none" && ex.a.decl.action === "ranged" && owns(user, ex.a))) return;
  ex.state = "resolving";
  await message.update({ [`flags.${SYSTEM_ID}.exchange`]: ex });
  const aActor = await resolveActor(ex.a);
  const bActor = await resolveActor(ex.b);
  if (!aActor || !bActor) return;

  const [aAct, bAct] = C.cancelActions(ex.a.decl.action, bDecl.action);
  const A = sideFor(aActor, { ...ex.a.decl, action: aAct });
  const B = sideFor(bActor, { ...bDecl, action: bAct });
  const mA = modifiersFor(A, B);
  const mB = bAct === "none" ? { total: 0, parts: [], warnings: [] } : modifiersFor(B, A);
  if (aAct === "ranged") {
    // Le tir ne profite pas de la hauteur ; le bouclier de la cible gêne le tireur
    mA.parts = mA.parts.filter(p => !/hauteur/i.test(p.label));
    if (ex.a.decl.aware !== false) { const pen = rangedShieldPenalty(B); if (pen) mA.parts.push({ label: L("PDVF.Combat.TargetShield"), value: pen }); }
    mA.total = mA.parts.reduce((s, p) => s + p.value, 0);
  }

  const rolls = [];
  const tA = await testValue(A.base, mA.total);
  rolls.push(tA.roll);
  let tB = null;
  if (bAct !== "none") { tB = await testValue(B.base, mB.total); rolls.push(tB.roll); }
  const res = C.resolveExchange(
    { action: aAct, result: tA.result, weapon: A.opt },
    { action: bAct, result: tB?.result ?? null, weapon: B.opt }
  );

  const sections = [];
  const testLine = (side, t, m, name) => F("PDVF.Combat.Line.Test", {
    name, action: L(`PDVF.Combat.Action.${side.decl.action}`), weapon: side.opt?.name ?? "",
    base: side.base, mods: m.parts.map(p => `${signed(p.value)} ${p.label}`).join(", ") || "—", total: side.base + m.total,
    die: t.result.die, outcome: L(`PDVF.Outcome.${t.result.outcome}`)
  });
  const tests = [testLine(A, tA, mA, ex.a.name)];
  if (tB) tests.push(testLine(B, tB, mB, ex.b.name));
  else tests.push(F(aAct === "ranged" ? "PDVF.Combat.Line.RangedTarget" : "PDVF.Combat.Line.UnopposedTarget", { name: ex.b.name }));
  for (const w of [...mA.warnings, ...mB.warnings]) tests.push(w);
  sections.push({ title: L("PDVF.Combat.Section.Tests"), lines: tests });

  const verdict = res.cmp.winner === "a" ? F("PDVF.Combat.Verdict.Wins", { name: ex.a.name })
    : res.cmp.winner === "b" ? F("PDVF.Combat.Verdict.Wins", { name: ex.b.name })
    : res.cmp.kind === "tie" ? L("PDVF.Combat.Verdict.Tie") : L("PDVF.Combat.Verdict.BothFail");

  // Dégâts et conséquences
  const undo = [];
  const effects = [];
  const pairs = [[A, B, res.b, ex.b, ex.a], [B, A, res.a, ex.a, ex.b]];
  let battleKill = null;
  for (const [att, def, outcome, defRef, attRef] of pairs) {
    if (!outcome.hit || !att.opt) continue;
    const dmg = damageFormula(att, def, outcome.bonusDice);
    effects.push(...dmg.notes);
    if (!dmg.formula) continue;
    const r = await new Roll(String(dmg.formula).replace(/D/g, "d")).evaluate();
    rolls.push(r);
    effects.push(F("PDVF.Combat.Line.DamageRoll", { name: attRef.name, formula: dmg.formula, total: r.total, bonus: outcome.bonusDice ? ` (${signed(outcome.bonusDice)}D6)` : "" }));
    const sp = outcome.shieldOk ? shieldOrParry(def) : { value: 0, isShield: false };
    if (outcome.shieldOk && sp.value) effects.push(F(sp.isShield ? "PDVF.Combat.Line.ShieldApplies" : "PDVF.Combat.Line.ParryApplies", { name: defRef.name, value: sp.value }));
    const out = await receiveDamage(def.actor, {
      base: r.total, shield: sp.value, shieldIsShield: sp.isShield, shieldBreaker: !!att.opt.shieldBreaker,
      half: dmg.half, source: `${attRef.name} — ${att.opt.name}`
    });
    rolls.push(...out.rolls);
    effects.push(...out.lines);
    undo.push(out.undo);
    if (out.out) battleKill ??= await battleLink(defRef, att.actor, def.actor);
  }

  // Armes, chutes, états
  for (const [side, outcome, ref] of [[A, res.a, ex.a], [B, res.b, ex.b]]) {
    effects.push(...outcome.notes);
    const extraUndo = { actor: side.actor.uuid, health: foundry.utils.deepClone(side.actor._source.system.health), chars: {}, statuses: [...[STATUS.mounted, STATUS.disarmed, STATUS.prone, STATUS.unconscious, STATUS.dead].filter(id => side.actor.statuses?.has?.(id))], npcShield: side.actor.type === "pnj" ? side.actor._source.system.armor?.shield ?? 0 : null, items: [] };
    undo.push(extraUndo);
    if ((outcome.drops || outcome.breaks) && side.opt && !side.opt.unarmed) {
      await loseWeapon(side.actor, side.opt.item ? side.actor.items.get(side.opt.item) : null, { broken: outcome.breaks }, extraUndo);
      effects.push(F(outcome.breaks ? "PDVF.Combat.Line.Breaks" : "PDVF.Combat.Line.Drops", { name: ref.name, weapon: side.opt.name }));
    }
    if (outcome.prone && !side.actor.statuses?.has?.(STATUS.prone)) { await setStatus(side.actor, STATUS.prone, true); effects.push(F("PDVF.Combat.Line.Down", { name: ref.name })); }
    if (outcome.lanceFumble) {
      const t = await testValue(side.st.horsemanship);
      rolls.push(t.roll);
      const lf = W.lanceFumble(t.result.outcome);
      effects.push(F("PDVF.Combat.Line.LanceFumble", { name: ref.name, die: t.result.die, outcome: L(`PDVF.Outcome.${t.result.outcome}`) }));
      if (lf.dice) {
        const r = await new Roll(lf.dice).evaluate();
        rolls.push(r);
        const out = await receiveDamage(side.actor, { base: r.total, ignoreArmor: true, knockdown: false, source: L("PDVF.Combat.LanceSplinters") });
        rolls.push(...out.rolls); effects.push(...out.lines); undo.push(out.undo);
      }
      if (lf.unhorsed) { await setStatus(side.actor, STATUS.mounted, false); await setStatus(side.actor, STATUS.prone, true); effects.push(F("PDVF.Combat.Line.Unhorsed", { name: ref.name, damage: "—" })); }
    }
    if (side.decl.action === "disengage" && outcome.prone && side.st.mounted) {
      const r = await new Roll("1d6").evaluate();
      rolls.push(r);
      await setStatus(side.actor, STATUS.mounted, false);
      const out = await receiveDamage(side.actor, { base: r.total, ignoreArmor: true, knockdown: false, source: L("PDVF.Combat.Fall") });
      rolls.push(...out.rolls); effects.push(...out.lines); undo.push(out.undo);
    }
    // Expérience : un critique coche la compétence utilisée
    const t = side === A ? tA : tB;
    if (t?.result.outcome === "critical" && side.key && side.actor.type === "chevalier" && typeof side.actor.markExperience === "function") {
      await side.actor.markExperience(side.key);
      effects.push(F("PDVF.Card.XpMarked", { name: ref.name, label: side.actor.getRollable(side.key)?.label ?? "" }));
    }
  }
  if (!effects.length) effects.push(L("PDVF.Combat.Line.NoEffect"));
  sections.push({ title: verdict, lines: effects });
  if (battleKill) sections.push({ title: L("PDVF.Combat.Section.Battle"), lines: [battleKill.line] });

  ex.state = "resolved";
  ex.b.decl = bDecl;
  await message.update({
    content: message.content.replace(/<div class="pdvf-card-buttons">[\s\S]*?<\/div>/, `<p class="pdvf-hint">${L("PDVF.Combat.ResolvedBelow")}</p>`),
    [`flags.${SYSTEM_ID}.exchange`]: ex
  });
  await postCombatCard({
    actor: aActor, title: F("PDVF.Combat.ExchangeTitle", { a: ex.a.name, b: ex.b.name }), subtitle: verdict,
    sections, rolls, undo, flags: { exchangeOf: message.id, battleKill: battleKill ? { battle: battleKill.battle, index: battleKill.index } : null }
  });
}

/* -------------------------------------------- */
/*  Lien avec les batailles                      */
/* -------------------------------------------- */

/**
 * Un ennemi de bataille mis hors de combat est inscrit parmi les victimes du chevalier
 * (rencontre en cours de la bataille d'où vient le jeton).
 */
async function battleLink(defRef, winner, loser) {
  if (winner?.type !== "chevalier" || !defRef.token) return null;
  const token = await fromUuid(defRef.token);
  const battleUuid = token?.getFlag?.(SYSTEM_ID, "battle");
  if (!battleUuid || token.getFlag(SYSTEM_ID, "killCounted")) return null;
  const battle = await fromUuid(battleUuid);
  if (!battle) return null;
  const index = battle.system.knights.findIndex(k => k.uuid === winner.uuid);
  if (index < 0 || battle.system.state.step !== "resolve") return null;
  await game.pendragon.battle.engine.perform(battle, "addKill", { index }, game.user.id);
  await token.setFlag(SYSTEM_ID, "killCounted", true);
  return { battle: battle.uuid, index, line: F("PDVF.Combat.Line.BattleKill", { name: winner.name, enemy: loser.name, battle: battle.name }) };
}

/* -------------------------------------------- */
/*  Boutons des cartes                           */
/* -------------------------------------------- */

/** Branche les boutons des cartes de combat (hook renderChatMessageHTML). */
export function onRenderCombatCard(message, html) {
  const flags = message.flags?.[SYSTEM_ID];
  if (flags?.kind !== "combat") return;
  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root) return;
  const ex = flags.exchange;
  for (const btn of root.querySelectorAll("[data-pdvf-combat]")) {
    const action = btn.dataset.pdvfCombat;
    let visible = true;
    if (action === "respond" || action === "unopposed") visible = !!ex && ex.state === "declared" && owns(game.user, ex.b);
    if (action === "cancel") visible = !!ex && ex.state === "declared" && (game.user.isGM || owns(game.user, ex.a));
    if (action === "undo") visible = !flags.undone && (game.user.isGM || (flags.undo ?? []).every(r => { try { return fromUuidSync(r.actor)?.isOwner; } catch (e) { return false; } }));
    if (!visible) { btn.remove(); continue; }
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      if (action === "respond") respond(message);
      else if (action === "unopposed") respond(message, { unopposed: true });
      else if (action === "cancel") requestCancel(message);
      else if (action === "undo") requestUndo(message);
    });
  }
}
