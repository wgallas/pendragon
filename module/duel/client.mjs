/**
 * Duel stratégique : défi, fenêtre partagée des duellistes et du MJ, boutons des cartes du chat.
 */
import { PDVF, SYSTEM_ID } from "../config.mjs";
import * as D from "../rules/duel.mjs";
import { formatValue } from "../rules/resolution.mjs";
import { invokePassion, postPassionCard } from "../dice/tests.mjs";
import { STATUS, hasStatus } from "../combat/status.mjs";
import * as E from "./engine.mjs";

const { HandlebarsApplicationMixin, ApplicationV2, DialogV2 } = foundry.applications.api;
const L = (k) => game.i18n.localize(k);
const F = (k, d) => game.i18n.format(k, d);
const OTHER = { a: "b", b: "a" };
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0");

/** Le duel est-il proposé dans ce monde ? */
export function duelsEnabled() {
  try { return game.settings.get(SYSTEM_ID, "duelsEnabled") !== false; } catch (err) { return true; }
}

/* -------------------------------------------- */
/*  Défi                                         */
/* -------------------------------------------- */

function weaponSelect(actor, current, name = "weapon") {
  return `<select name="${name}">${E.duelWeapons(actor).map(o =>
    `<option value="${esc(o.ref)}" ${o.ref === current ? "selected" : ""}>${esc(o.name)} — ${formatValue(o.skillValue)} (${esc(o.damageLabel ?? o.formula)})</option>`).join("")}</select>`;
}

/** Défier le jeton ciblé en duel. */
export async function challenge(actor, { token = null } = {}) {
  if (!duelsEnabled()) return;
  const target = [...(game.user.targets ?? [])][0];
  if (!target?.actor) return ui.notifications.warn(L("PDVF.Combat.Notify.NoTarget"));
  if (target.actor.uuid === actor.uuid) return ui.notifications.warn(L("PDVF.Combat.Notify.SelfTarget"));
  if (E.activeDuels().some(m => { const d = E.duelOf(m); return [d.a, d.b].some(s => [actor.uuid, target.actor.uuid].includes(E.sideActor(s)?.uuid)); })) {
    return ui.notifications.warn(L("PDVF.Duel.Notify.AlreadyDueling"));
  }
  const tok = token ?? actor.getActiveTokens?.(true, true)?.[0] ?? null;
  const content = `<p>${F("PDVF.Duel.ChallengeText", { name: esc(target.name) })}</p>
    <div class="form-group"><label>${L("PDVF.Duel.StakesLabel")}</label><select name="stakes">${PDVF.duel.stakes.map(s => `<option value="${s}">${L(`PDVF.Duel.Stakes.${s}`)}</option>`).join("")}</select></div>
    <div class="form-group"><label>${L("PDVF.Duel.Weapon")}</label>${weaponSelect(actor, E.defaultWeapon(actor))}</div>
    <p class="hint">${L("PDVF.Duel.StakesHint")}</p>`;
  const r = await DialogV2.wait({
    window: { title: L("PDVF.Duel.Challenge") }, classes: [SYSTEM_ID, "pdvf-dialog"], content, rejectClose: false,
    buttons: [{ action: "ok", label: L("PDVF.Duel.Challenge"), icon: "fa-solid fa-hand-fist", default: true,
      callback: (e, b) => ({ stakes: b.form.elements.stakes.value, weapon: b.form.elements.weapon.value }) },
    { action: "cancel", label: L("PDVF.Dialog.Cancel") }]
  });
  if (!r?.stakes) return;
  const st = E.newDuel({
    a: E.newSide(actor, tok?.document ?? tok, r.weapon),
    b: E.newSide(target.actor, target.document, E.defaultWeapon(target.actor)),
    stakes: r.stakes
  });
  const message = await ChatMessage.implementation.create({
    speaker: ChatMessage.getSpeaker({ actor }), content: await E.renderCard(st),
    flags: { [SYSTEM_ID]: { kind: "duel", duel: st } }
  });
  openPanel(message);
  E.broadcastOpen(message);
  return message;
}

/* -------------------------------------------- */
/*  Fenêtre du duel                              */
/* -------------------------------------------- */

const panels = new Map();

export function openPanel(message) {
  if (!message) return;
  let app = panels.get(message.id);
  if (!app) {
    app = new DuelPanel(message.id);
    panels.set(message.id, app);
  }
  app.render(true);
  return app;
}

/** Redessine les fenêtres d'un duel quand sa carte change. */
export function onUpdateMessage(message) {
  if (!E.duelOf(message)) return;
  const app = panels.get(message.id);
  if (app?.rendered) app.render();
}

/** Ce que la fenêtre montre à cet utilisateur. */
export function duelView(message, user) {
  const st = E.duelOf(message);
  if (!st) return null;
  const isGM = !!user.isGM;
  const sideView = (s) => {
    const me = st[s];
    const op = st[OTHER[s]];
    const actor = E.sideActor(me);
    const mine = E.controls(user, me);
    const h = actor?.system?.health?.hp ?? { value: 0, max: 0 };
    const weapons = actor ? E.duelWeapons(actor) : [];
    const weapon = weapons.find(o => o.ref === me.weapon) ?? weapons[0];
    const waitingFirst = st.phase === "choose" && st.first && st.first !== s && !op.choice;
    const canChoose = mine && st.phase === "choose" && !me.choice && !waitingFirst;
    const disarmed = hasStatus(actor, STATUS.disarmed);
    const cards = D.INTENTS.map(i => {
      const forbidden = (me.forced && me.forced !== i) || me.blocked.includes(i) || (me.grudge && i === "defend");
      return {
        id: i, label: L(`PDVF.Duel.Intent.${i}`), tip: F("PDVF.Duel.TakesTip", { takes: L(`PDVF.Duel.Intent.${D.TAKES[i]}`), trait: L(`PDVF.Duel.IntentTrait.${i}`) }),
        exposed: op.see.includes(i), chosen: me.choice === i, forbidden, forced: me.forced === i,
        canPick: canChoose && !forbidden
      };
    });
    // Ce que je sais de l'adversaire
    const seen = D.INTENTS.map(i => ({ id: i, label: L(`PDVF.Duel.Intent.${i}`), up: me.see.includes(i) }));
    let opponentPlay = "";
    if (op.choice && st.phase === "choose" && st.first === OTHER[s]) {
      opponentPlay = op.revealed ? F("PDVF.Duel.OpponentPlays", { intent: L(`PDVF.Duel.Intent.${op.choice}`) })
        : F("PDVF.Duel.OpponentHidden", { list: D.INTENTS.filter(i => !me.see.includes(i)).map(i => L(`PDVF.Duel.Intent.${i}`)).join(", ") });
    } else if (op.choice && st.phase === "choose") opponentPlay = L("PDVF.Duel.OpponentChose");
    const states = [];
    if (me.breath) states.push(F("PDVF.Duel.State.breath", { mod: signed(me.breath) }));
    if (me.fear) states.push(F("PDVF.Duel.State.fear", { mod: signed(me.fear) }));
    if (me.grudge) states.push(L("PDVF.Duel.State.grudge"));
    if (me.forced) states.push(F("PDVF.Duel.State.forced", { intent: L(`PDVF.Duel.Intent.${me.forced}`) }));
    if (disarmed) states.push(L("PDVF.Duel.State.disarmed"));
    if (hasStatus(actor, STATUS.prone)) states.push(L("PDVF.Duel.State.prone"));
    if (hasStatus(actor, STATUS.mounted)) states.push(L("PDVF.Duel.State.mounted"));
    return {
      key: s, name: me.name, img: me.img, mine, hp: `${h.value} / ${h.max}`, half: E.atHalf(actor),
      weaponName: weapon?.name ?? "", weaponChoices: weapons.map(o => ({ value: o.ref, label: `${o.name} ${formatValue(o.skillValue)}`, selected: o.ref === me.weapon })),
      canWeapon: mine && ["mounted", "choose"].includes(st.phase) && !me.choice,
      cards, seen, seeCount: me.see.length, opponentPlay, states,
      choiceLabel: me.choice ? (mine ? L(`PDVF.Duel.Intent.${me.choice}`) : L("PDVF.Duel.Chosen")) : "",
      canChoose, waitingFirst, canRest: canChoose && !me.forced, canRearm: canChoose && disarmed && !me.forced,
      canFalseMercy: canChoose && !me.falseMercy, canSurrender: mine && ["choose", "winner", "mounted"].includes(st.phase),
      canInvoke: mine && actor?.type === "chevalier" && ["choose", "mounted"].includes(st.phase),
      isKnight: actor?.type === "chevalier"
    };
  };
  const a = sideView("a");
  const b = sideView("b");
  const p = st.pending;
  const winnerSide = p ? st[p.winner] : null;
  const winnerIntent = p ? winnerSide.choice : "";
  return {
    st, isGM, a, b, stakesLabel: L(`PDVF.Duel.Stakes.${st.stakes}`), passe: st.passe,
    phaseLabel: L(`PDVF.Duel.Phase.${st.phase}`), phase: st.phase,
    is: { [st.phase]: true },
    firstLabel: st.phase === "choose" ? (st.first ? F("PDVF.Duel.FirstChooses", { name: st[st.first].name }) : L("PDVF.Duel.Simultaneous")) : "",
    canAccept: st.phase === "challenge" && E.controls(user, st.b),
    acceptWeapons: b.weaponChoices,
    winner: p ? {
      name: winnerSide.name, mine: E.controls(user, winnerSide), side: p.winner, intent: L(`PDVF.Duel.Intent.${winnerIntent}`),
      isClose: winnerIntent === "close", effectLabel: L(`PDVF.Duel.EffectOf.${winnerIntent}`),
      traits: D.PROVOKABLE.map(k => ({ value: k, label: `${L(`PDVF.Trait.${k.split(".")[1]}.${k.split(".")[2]}`)} → ${L(`PDVF.Duel.Intent.${D.PROVOKE[k]}`)}` }))
    } : null,
    surrender: st.surrender ? { name: st[st.surrender.side].name, honorable: st.surrender.honorable, mine: E.controls(user, st[OTHER[st.surrender.side]]), side: OTHER[st.surrender.side] } : null,
    aftermath: st.phase === "aftermath" ? { mine: E.controls(user, st[st.result.winner]), side: st.result.winner, name: st[st.result.winner].name, loser: st[OTHER[st.result.winner]].name } : null,
    result: st.phase === "over" && st.result ? { text: F(`PDVF.Duel.End.${st.result.reason}`, { winner: st[st.result.winner]?.name ?? "", loser: st[OTHER[st.result.winner]]?.name ?? "" }), glory: st.result.glory } : null,
    log: [...st.log].reverse().slice(0, 12)
  };
}

export class DuelPanel extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(messageId, options = {}) {
    super({ ...options, id: `pdvf-duel-${messageId}` });
    this.messageId = messageId;
  }

  static DEFAULT_OPTIONS = {
    classes: [SYSTEM_ID, "pdvf-sheet", "pdvf-duel-panel"],
    window: { title: "PDVF.Duel.Title", resizable: true, icon: "fa-solid fa-hand-fist" },
    position: { width: 760, height: 640 },
    actions: {
      duelOp: DuelPanel.#onOp,
      duelInvoke: DuelPanel.#onInvoke
    }
  };

  static PARTS = { body: { template: `systems/${SYSTEM_ID}/templates/duel/panel.hbs`, scrollable: [".pdvf-duel-body"] } };

  get message() { return game.messages.get(this.messageId); }

  get title() {
    const st = E.duelOf(this.message);
    return st ? F("PDVF.Duel.TitleOf", { a: st.a.name, b: st.b.name }) : L("PDVF.Duel.Title");
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    return Object.assign(context, duelView(this.message, game.user) ?? {});
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    for (const sel of this.element.querySelectorAll("select[data-duel-weapon]")) {
      sel.addEventListener("change", () => E.request(this.message, "weapon", { side: sel.dataset.side, ref: sel.value }));
    }
  }

  _onClose(options) {
    super._onClose?.(options);
    panels.delete(this.messageId);
  }

  /** Actions du duel (data-op, data-side et autres données ; listes voisines data-group). */
  static async #onOp(event, target) {
    const message = this.message;
    if (!message) return;
    const { op, ...rest } = target.dataset;
    const payload = {};
    for (const [k, v] of Object.entries(rest)) if (k !== "action") payload[k] = v === "true" ? true : v === "false" ? false : v;
    const group = target.closest("[data-group]");
    if (group) for (const sel of group.querySelectorAll("select[name]")) payload[sel.name] = sel.value;
    if (op === "stop") {
      const ok = await DialogV2.confirm({ window: { title: L("PDVF.Duel.Stop") }, content: `<p>${L("PDVF.Duel.StopConfirm")}</p>`, classes: [SYSTEM_ID, "pdvf-dialog"] });
      if (!ok) return;
    }
    if (op === "surrender") {
      const ok = await DialogV2.confirm({ window: { title: L("PDVF.Duel.Surrender") }, content: `<p>${L("PDVF.Duel.SurrenderConfirm")}</p>`, classes: [SYSTEM_ID, "pdvf-dialog"] });
      if (!ok) return;
    }
    return E.request(message, op, payload);
  }

  /** Invoquer une passion : l'inspiration porte sur la compétence de l'arme du duel. */
  static async #onInvoke(event, target) {
    const st = E.duelOf(this.message);
    const side = st?.[target.dataset.side];
    const actor = E.sideActor(side);
    if (!actor || actor.type !== "chevalier") return;
    const weapon = E.duelWeapons(actor).find(o => o.ref === side.weapon) ?? E.duelWeapons(actor)[0];
    const skillKey = `skill.${weapon?.skill ?? "sword"}`;
    const passions = actor.listInvokable();
    const content = `<div class="form-group"><label>${L("PDVF.Invoke.Passion")}</label><select name="key">${passions.map(p =>
      `<option value="${p.key}" ${p.disabled ? "disabled" : ""}>${esc(p.label)} ${formatValue(p.value)}</option>`).join("")}</select></div>
      <p class="hint">${F("PDVF.Duel.InvokeHint", { skill: esc(actor.getRollable(skillKey)?.label ?? "") })}</p>`;
    const key = await DialogV2.wait({
      window: { title: L("PDVF.Battle.Invoke") }, classes: [SYSTEM_ID, "pdvf-dialog"], content, rejectClose: false,
      buttons: [{ action: "ok", label: L("PDVF.Dialog.Roll"), default: true, callback: (e, b) => b.form.elements.key.value },
        { action: "cancel", label: L("PDVF.Dialog.Cancel") }]
    });
    if (!key || key === "cancel") return;
    const inv = await invokePassion(actor, key, { target: skillKey });
    if (inv) await postPassionCard(actor, inv, []);
  }
}

/* -------------------------------------------- */
/*  Cartes du chat                               */
/* -------------------------------------------- */

export function onRenderChatMessage(message, html) {
  const st = E.duelOf(message);
  if (!st) return;
  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root) return;
  for (const btn of root.querySelectorAll("[data-pdvf-duel]")) {
    const action = btn.dataset.pdvfDuel;
    const visible = action === "open" ? (game.user.isGM || E.controls(game.user, st.a) || E.controls(game.user, st.b) || st.phase !== "challenge") : true;
    if (!visible) { btn.remove(); continue; }
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      openPanel(message);
    });
  }
}
