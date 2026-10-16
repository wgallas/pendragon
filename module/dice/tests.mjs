import { SYSTEM_ID } from "../config.mjs";
import {
  OUTCOME, resolveTest, compareOpposed, resolveFixed, traitProcedure, attributeLevel,
  passionEffect, crisisEffect, afflictionDuration, formatValue, passionBonuses
} from "../rules/resolution.mjs";
import { PDVF } from "../config.mjs";

const CARD_TEMPLATE = `systems/${SYSTEM_ID}/templates/chat/test-card.hbs`;
const DIALOG_TEMPLATE = `systems/${SYSTEM_ID}/templates/dialog/test-options.hbs`;

const L = (k) => game.i18n.localize(k);
const F = (k, d) => game.i18n.format(k, d);

/** « +5 », « −5 », « 0 » avec un vrai signe moins. */
export function signed(n) {
  const v = Number(n || 0);
  if (v > 0) return `+${v}`;
  if (v < 0) return `−${Math.abs(v)}`;
  return "0";
}

/** « Inspiré par Hommage (Seigneur) : +5 ». */
function inspirationNote(actor, key) {
  const i = actor.inspirationFor(key);
  return F("PDVF.Card.InspirationApplied", { source: i?.source ?? "", bonus: signed(actor.inspirationBonus(key)) });
}

/** Lance 1d20 et renvoie le Roll évalué. */
async function d20() {
  const roll = new Roll("1d20");
  await roll.evaluate();
  return roll;
}

const OUTCOME_CLASS = {
  [OUTCOME.CRITICAL]: "critical", [OUTCOME.SUCCESS]: "success",
  [OUTCOME.FAILURE]: "failure", [OUTCOME.FUMBLE]: "fumble"
};

/** Prépare l'affichage d'un participant pour la carte de chat. */
function participantView(actor, rollable, modifier, result) {
  const mod = Number(modifier || 0);
  const parts = [`${rollable.label} ${formatValue(rollable.value)}`];
  if (mod) parts.push(`${mod > 0 ? "+" : "−"} ${Math.abs(mod)}`);
  let totalLabel = parts.join(" ");
  if (mod) totalLabel += ` = ${formatValue(result.total)}`;
  return {
    name: actor.name,
    img: actor.system.heraldry?.img || actor.img,
    totalLabel,
    die: result.die,
    critBonus: result.critBonus ? `+${result.critBonus}` : "",
    outcome: result.outcome,
    outcomeLabel: L(`PDVF.Outcome.${result.outcome}`),
    cls: OUTCOME_CLASS[result.outcome]
  };
}

/** Publie une carte de test dans le chat. */
async function postCard(actor, view, rolls, flags = {}) {
  const content = await foundry.applications.handlebars.renderTemplate(CARD_TEMPLATE, view);
  const data = {
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    rolls,
    sound: CONFIG.sounds.dice,
    flags: { [SYSTEM_ID]: flags }
  };
  try {
    // v14 : applyMode prend de lui-même le mode choisi dans le chat ; applyRollMode avant la v14.
    if (typeof ChatMessage.applyMode === "function") ChatMessage.applyMode(data);
    else if (typeof ChatMessage.applyRollMode === "function") ChatMessage.applyRollMode(data, game.settings.get("core", "rollMode"));
  } catch (err) { /* visibilité par défaut */ }
  return ChatMessage.implementation.create(data);
}

/** Coche l'expérience si l'utilisateur peut modifier l'acteur. */
async function maybeXp(actor, key) {
  if (actor?.isOwner) await actor.markExperience(key);
}

/* -------------------------------------------- */
/*  Boîte de dialogue d'options                 */
/* -------------------------------------------- */

/**
 * Demande modificateur et opposition. Renvoie null si annulé.
 * @param {Actor} actor
 * @param {object} rollable
 * @param {number} defaultModifier
 */
export async function promptTestOptions(actor, rollable, defaultModifier = 0, defaultInvoke = "") {
  const targetToken = [...(game.user.targets ?? [])][0];
  const target = targetToken?.actor;
  const targetRollables = target?.listRollables?.() ?? [];
  const sameKey = targetRollables.find(r => r.key === rollable.key)?.key;
  const canInvoke = PDVF.inspirableKinds.includes(rollable.kind) && typeof actor.listInvokable === "function";
  const current = canInvoke ? actor.inspirationFor(rollable.key) : null;
  const content = await foundry.applications.handlebars.renderTemplate(DIALOG_TEMPLATE, {
    modifier: defaultModifier,
    canInvoke,
    invokeChoices: canInvoke ? actor.listInvokable().map(p => ({
      key: p.key, label: `${p.label} ${formatValue(p.value)}${p.invoked ? ` — ${L("PDVF.Invoke.UsedToday")}` : ""}`,
      disabled: p.invoked, selected: p.key === defaultInvoke && !p.invoked
    })) : [],
    currentInspiration: current ? F("PDVF.Invoke.Already", { source: current.source, bonus: signed(current.bonus) }) : "",
    hasTarget: !!target && targetRollables.length > 0,
    targetName: target?.name,
    targetRollables,
    targetKey: sameKey ?? targetRollables[0]?.key,
    opposition: target && targetRollables.length ? "actor" : "none",
    reflectedChoices: [
      { value: 0, label: L("PDVF.Dialog.NoReflected") },
      { value: 5, label: "+5 / −5" }, { value: 10, label: "+10 / −10" },
      { value: -5, label: "−5 / +5" }, { value: -10, label: "−10 / +10" }
    ]
  });
  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: F("PDVF.Dialog.Title", { label: rollable.label }) },
    classes: [SYSTEM_ID, "pdvf-dialog"],
    content,
    rejectClose: false,
    buttons: [{
      action: "roll", label: L("PDVF.Dialog.Roll"), icon: "fa-solid fa-dice-d20", default: true,
      callback: (event, button) => new foundry.applications.ux.FormDataExtended(button.form).object
    }, {
      action: "cancel", label: L("PDVF.Dialog.Cancel")
    }]
  });
  if (!result || result === "cancel") return null;
  return {
    modifier: Number(result.modifier) || 0,
    reflected: Number(result.reflected) || 0,
    opposition: result.opposition ?? "none",
    fixedValue: Number(result.fixedValue) || 0,
    target: result.opposition === "actor" ? target : null,
    targetKey: result.targetKey,
    invoke: canInvoke ? (result.invoke ?? "") : ""
  };
}

/* -------------------------------------------- */
/*  Tests                                        */
/* -------------------------------------------- */

/**
 * Test d'un Attribut (caractéristique, compétence, Gloire), avec opposition éventuelle.
 * Les traits et passions ont leurs propres procédures (rollTrait, rollPassion).
 */
export async function rollAttribute(actor, key, options = {}) {
  const rollable = actor.getRollable(key);
  if (!rollable) return;
  if (rollable.kind === "trait") return rollTrait(actor, key, options);
  if (rollable.kind === "passion" && options.opposition !== "actor" && options.opposition !== "fixed") {
    return rollPassion(actor, key, options);
  }

  const pre = await invokeBefore(actor, rollable, options);
  if (!pre) return;

  const insp = actor.inspirationBonus(key);
  const reflected = Number(options.reflected || 0);
  const modifier = Number(options.modifier || 0) + insp + reflected;
  const roll = await d20();
  const result = resolveTest(rollable.value, modifier, roll.total);
  const view = {
    title: rollable.label,
    subtitle: L(`PDVF.Kind.${rollable.kind}`),
    prelude: pre.prelude,
    participants: [participantView(actor, rollable, modifier, result)],
    notes: [...pre.notes],
    buttons: pre.buttons
  };
  if (insp) view.notes.push(inspirationNote(actor, key));
  const rolls = [...pre.rolls, roll];
  const xpKeys = [];
  if (result.outcome === OUTCOME.CRITICAL && rollable.canXp) xpKeys.push([actor, key]);

  if (options.opposition === "fixed") {
    const verdict = resolveFixed(result, options.fixedValue);
    view.subtitle = F("PDVF.Card.FixedOpposition", { value: options.fixedValue });
    view.verdict = { text: L(`PDVF.Verdict.fixed.${verdict}`), cls: verdict };
  } else if (options.opposition === "actor" && options.target) {
    const target = options.target;
    const other = target.getRollable(options.targetKey);
    if (other) {
      const otherMod = -reflected + target.inspirationBonus(options.targetKey);
      const roll2 = await d20();
      const res2 = resolveTest(other.value, otherMod, roll2.total);
      rolls.push(roll2);
      view.participants.push(participantView(target, other, otherMod, res2));
      const cmp = compareOpposed(result, res2);
      view.participants[0].opposed = L(`PDVF.Opposed.${cmp.a}`);
      view.participants[1].opposed = L(`PDVF.Opposed.${cmp.b}`);
      view.subtitle = L("PDVF.Card.Opposed");
      if (reflected) view.notes.push(F("PDVF.Card.Reflected", { a: signed(reflected), b: signed(-reflected) }));
      if (cmp.kind === "victory") {
        const winner = cmp.winner === "a" ? actor : target;
        view.verdict = { text: F("PDVF.Verdict.victory", { name: winner.name }), cls: cmp.winner === "a" ? "victory" : "defeat" };
      } else {
        view.verdict = { text: L(`PDVF.Verdict.${cmp.kind}`), cls: cmp.kind };
      }
      if (res2.outcome === OUTCOME.CRITICAL && other.canXp) xpKeys.push([target, options.targetKey]);
    }
  }

  for (const [a, k] of xpKeys) {
    await maybeXp(a, k);
    view.notes.push(F("PDVF.Card.XpMarked", { name: a.name, label: a.getRollable(k)?.label ?? "" }));
  }
  return postCard(actor, view, rolls, { key, kind: rollable.kind });
}

/**
 * Test de trait selon la procédure du livre :
 * trait Célèbre ou Exalté testé en premier ; en cas d'échec, test du trait opposé.
 */
export async function rollTrait(actor, key, options = {}) {
  let first = actor.getRollable(key);
  if (!first) return;
  let second = actor.getRollable(first.opposite);
  const notes = [];

  // Un trait Célèbre ou Exalté doit toujours être testé en premier.
  const famous = (r) => ["famous", "exalted"].includes(attributeLevel(r.value));
  if (!famous(first) && famous(second)) {
    notes.push(F("PDVF.Card.FamousFirst", { label: second.label }));
    [first, second] = [second, first];
  }

  const pre = await invokeBefore(actor, actor.getRollable(key), options);
  if (!pre) return;
  notes.unshift(...pre.notes);

  const modifier = Number(options.modifier || 0);
  const mod1 = modifier + actor.inspirationBonus(first.key);
  const roll1 = await d20();
  const res1 = resolveTest(first.value, mod1, roll1.total);
  const rolls = [...pre.rolls, roll1];
  for (const k of [first.key, second.key]) if (actor.inspirationBonus(k)) notes.push(inspirationNote(actor, k));
  const participants = [participantView(actor, first, mod1, res1)];

  let proc = traitProcedure(res1);
  if (proc.needSecond) {
    // Les modificateurs de trait sont symétriques : le trait opposé reçoit l'inverse.
    const mod2 = -modifier + actor.inspirationBonus(second.key);
    const roll2 = await d20();
    const res2 = resolveTest(second.value, mod2, roll2.total);
    rolls.push(roll2);
    participants.push(participantView(actor, second, mod2, res2));
    proc = traitProcedure(res1, res2);
  }

  let verdictText;
  if (proc.acts === "player") verdictText = L("PDVF.Trait.PlayerChoice");
  else {
    const label = proc.acts === "first" ? first.label : second.label;
    verdictText = F(proc.strongly ? "PDVF.Trait.ActsStrongly" : "PDVF.Trait.Acts", { label });
  }
  if (proc.xp) {
    const xpKey = proc.xp === "first" ? first.key : second.key;
    await maybeXp(actor, xpKey);
    notes.push(F("PDVF.Card.XpMarked", { name: actor.name, label: actor.getRollable(xpKey).label }));
  }

  const view = {
    title: `${L(`PDVF.Trait.${key.split(".")[1]}.left`)} / ${L(`PDVF.Trait.${key.split(".")[1]}.right`)}`,
    subtitle: L("PDVF.Kind.trait"),
    participants,
    verdict: { text: verdictText, cls: proc.acts === "player" ? "tie" : "victory" },
    prelude: pre.prelude,
    notes,
    buttons: pre.buttons
  };
  return postCard(actor, view, rolls, { key, kind: "trait" });
}

/**
 * Invocation d'une passion (Table 4.2) : Enflammé, Inspiré, crise ou perte d'un point.
 * Coche l'expérience, note l'usage du jour et enregistre le bonus éventuel.
 * @param {Actor} actor
 * @param {string} key          clé de la passion (« honor », « passion.2 »)
 * @param {object} [options]
 * @param {number} [options.modifier]
 * @param {string} [options.target]  Attribut inspiré (vide : à choisir sur la fiche)
 * @returns {Promise<object|null>} éléments de carte et résultat
 */
export async function invokePassion(actor, key, { modifier = 0, target = "" } = {}) {
  const rollable = actor.getRollable(key);
  if (!rollable) return null;
  const roll = await d20();
  const result = resolveTest(rollable.value, Number(modifier || 0), roll.total);
  const effect = passionEffect(result.outcome, passionBonuses(rollable.label, PDVF.passionBonuses));
  const notes = [];
  const buttons = [];

  if (effect.xp) {
    await maybeXp(actor, key);
    notes.push(F("PDVF.Card.XpMarked", { name: actor.name, label: rollable.label }));
  }
  if (actor.isOwner) {
    if (effect.bonus) await actor.addInspiration({ source: rollable.label, state: effect.state, bonus: effect.bonus, target });
    else await actor.markInvoked(rollable.label);
  }
  if (effect.loss && actor.isOwner) {
    await actor.adjustPassion(key, -effect.loss);
    notes.push(F("PDVF.Card.PassionLoss", { label: rollable.label }));
  }
  if (effect.crisis) {
    buttons.push({ action: "crisis", label: L("PDVF.Card.RollCrisis"), actor: actor.uuid, key });
  }
  return {
    rollable, roll, result, effect, notes, buttons,
    participant: participantView(actor, rollable, modifier, result),
    verdict: {
      text: effect.bonus ? F(`PDVF.Passion.${effect.state}Bonus`, { bonus: signed(effect.bonus) }) : L(`PDVF.Passion.${effect.state}`),
      cls: effect.crisis || effect.loss ? "defeat" : "victory"
    }
  };
}

/**
 * Test de passion seul (depuis la fiche, ou demandé par le MJ).
 * Le bonus obtenu attend qu'on choisisse sur la fiche la compétence ou le trait inspiré.
 */
export async function rollPassion(actor, key, options = {}) {
  const inv = await invokePassion(actor, key, { modifier: options.modifier });
  if (!inv) return;
  if (inv.effect.bonus) inv.notes.push(L("PDVF.Card.ChooseInspirationTarget"));
  const view = {
    title: inv.rollable.label,
    subtitle: L("PDVF.Kind.passion"),
    participants: [inv.participant],
    verdict: inv.verdict,
    notes: inv.notes,
    buttons: inv.buttons
  };
  return postCard(actor, view, [inv.roll], { key, kind: "passion" });
}

/**
 * Passion invoquée avant un test de compétence ou de trait.
 * Renvoie les éléments à placer en tête de carte, ou poste la carte et renvoie null
 * quand l'invocation échoue (le test n'est alors pas lancé).
 */
async function invokeBefore(actor, rollable, options) {
  const none = { prelude: null, rolls: [], notes: [], buttons: [] };
  if (!options.invoke || !PDVF.inspirableKinds.includes(rollable?.kind)) return none;
  const inv = await invokePassion(actor, options.invoke, { target: rollable.key });
  if (!inv) return none;
  const prelude = { title: F("PDVF.Card.Invoked", { label: inv.rollable.label }), participant: inv.participant, verdict: inv.verdict };
  if (!inv.effect.bonus) {
    const view = {
      title: rollable.label,
      subtitle: L(`PDVF.Kind.${rollable.kind}`),
      prelude,
      participants: [],
      notes: [...inv.notes, F("PDVF.Card.TestBlocked", { label: rollable.label })],
      buttons: inv.buttons
    };
    await postCard(actor, view, [inv.roll], { key: rollable.key, kind: rollable.kind, invoked: options.invoke });
    return null;
  }
  return { prelude, rolls: [inv.roll], notes: inv.notes, buttons: inv.buttons };
}

/**
 * Test de crise de passion (« De peine et de chagrin »).
 * @param {number} modifier  0, +5 ou +10 selon les circonstances
 */
export async function rollCrisis(actor, key, modifier = 0) {
  const rollable = actor.getRollable(key);
  if (!rollable) return;
  const roll = await d20();
  const result = resolveTest(rollable.value, modifier, roll.total);
  const effect = crisisEffect(result.outcome);
  const notes = [];
  if (effect.loss && actor.isOwner) {
    await actor.adjustPassion(key, -effect.loss);
    notes.push(F("PDVF.Card.PassionLoss", { label: rollable.label }));
  }
  if (effect.state === "melancholy" || effect.state === "madness") {
    const duration = afflictionDuration(attributeLevel(rollable.value), effect.state);
    notes.push(F("PDVF.Card.Duration", { duration }));
    if (actor.isOwner) await actor.update({ [`system.health.${effect.state}`]: true });
  }
  const view = {
    title: rollable.label,
    subtitle: L("PDVF.Card.Crisis"),
    participants: [participantView(actor, rollable, modifier, result)],
    verdict: { text: L(`PDVF.Crisis.${effect.state}`), cls: effect.state === "none" ? "victory" : "defeat" },
    notes
  };
  return postCard(actor, view, [roll], { key, kind: "crisis" });
}

/* -------------------------------------------- */
/*  Boutons des cartes de chat                   */
/* -------------------------------------------- */

/** Branche les boutons des cartes (hook renderChatMessageHTML). */
export function onRenderChatMessage(message, html) {
  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root) return;
  for (const button of root.querySelectorAll("[data-pdvf-action]")) {
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      const { pdvfAction, actor: uuid, key } = button.dataset;
      const actor = await fromUuid(uuid);
      if (!actor?.isOwner) return ui.notifications.warn(L("PDVF.Notify.NotOwner"));
      if (pdvfAction === "crisis") {
        const modifier = await promptCrisisModifier();
        if (modifier === null) return;
        return rollCrisis(actor, key, modifier);
      }
    });
  }
}

async function promptCrisisModifier() {
  const options = [0, 5, 10].map(v => ({ value: v, label: L(`PDVF.CrisisMod.${v}`) }));
  const content = `<div class="form-group"><label>${L("PDVF.Dialog.Circumstance")}</label>
    <select name="modifier">${options.map(o => `<option value="${o.value}">${o.label}</option>`).join("")}</select></div>`;
  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: L("PDVF.Card.Crisis") },
    classes: [SYSTEM_ID, "pdvf-dialog"],
    content,
    rejectClose: false,
    buttons: [{
      action: "roll", label: L("PDVF.Dialog.Roll"), default: true,
      callback: (event, button) => Number(new foundry.applications.ux.FormDataExtended(button.form).object.modifier) || 0
    }, { action: "cancel", label: L("PDVF.Dialog.Cancel") }]
  });
  return typeof result === "number" ? result : null;
}
