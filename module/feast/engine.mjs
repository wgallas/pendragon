/**
 * Moteur du festin : toutes les écritures dans le document « Festin » passent par ici et sont faites par le MJ.
 * Un joueur envoie sa demande au MJ par le socket du système ; ses jets (test de Gloire, Modeste, activités,
 * Courtoisie pour partir) sont lancés chez lui et seul le résultat est transmis. Les cartes d'évènement sont
 * celles des joueurs : ils saisissent la carte jouée et son Engouement.
 */
import { PDVF, SYSTEM_ID } from "../config.mjs";
import * as R from "../rules/feast.mjs";
import { traitPair } from "../rules/resolution.mjs";

const L = (k) => game.i18n.localize(k);
const F = (k, d) => game.i18n.format(k, d);
const C = () => PDVF.feast;
const signed = (n) => (n > 0 ? `+${n}` : `${n}`);

export const SOCKET = `system.${SYSTEM_ID}`;
const CARD = `systems/${SYSTEM_ID}/templates/chat/tournament-card.hbs`;

/* -------------------------------------------- */
/*  Demandes et socket                          */
/* -------------------------------------------- */

/** Demande une action : faite tout de suite par le MJ, envoyée au MJ actif par un joueur. */
export async function request(feast, action, payload = {}) {
  if (game.user.isGM) return perform(feast, action, payload, game.user.id);
  if (!game.users.activeGM) return ui.notifications.warn(L("PDVF.Feast.Notify.NoGM"));
  game.socket.emit(SOCKET, { type: "feast", action, feast: feast.uuid, payload, user: game.user.id });
}

/** Réception des messages du socket du système. */
export function onSocket(data) {
  if (data?.type === "feastOpen") {
    if (!game.user.isGM) fromUuid(data.feast).then(f => f?.sheet?.render(true));
    return;
  }
  if (data?.type !== "feast" || !game.users.activeGM?.isSelf) return;
  fromUuid(data.feast).then(f => { if (f) perform(f, data.action, data.payload, data.user); });
}

/** Ouvre le festin chez tous les joueurs. */
export function showToPlayers(feast) {
  game.socket.emit(SOCKET, { type: "feastOpen", feast: feast.uuid });
}

let queue = Promise.resolve();

/** Exécute une action côté MJ, l'une après l'autre. */
export function perform(feast, action, payload, userId) {
  queue = queue.then(() => run(feast, action, payload ?? {}, userId)).catch(err => {
    console.error(`${SYSTEM_ID} | Festin : ${action}`, err);
    ui.notifications.error(`${L("PDVF.Feast.Title")} : ${err.message}`);
  });
  return queue;
}

async function run(feast, action, payload, userId) {
  const def = ACTIONS[action];
  if (!def) return;
  const user = userId ? game.users.get(userId) : game.user;
  if (!user) return;
  if (!allowed(feast, def.who, payload, user)) {
    console.warn(`${SYSTEM_ID} | Festin : action « ${action} » refusée pour ${user.name}`);
    return;
  }
  const sys = foundry.utils.deepClone(feast._source.system);
  const ctx = { feast, sys, user, chat: [], log: (text) => sys.log.push(text) };
  const keep = await def.fn(ctx, payload);
  if (keep !== false) await feast.update({ system: sys });
  for (const card of ctx.chat) await announce(feast, card);
}

/** Le MJ fait tout ; un joueur seulement pour son chevalier. */
function allowed(feast, who, payload, user) {
  if (user.isGM) return true;
  if (who !== "guest") return false;
  const g = feast.system.guests[Number(payload.index)];
  return !!g && !!guestActor(g)?.testUserPermission?.(user, "OWNER");
}

/** Carte de chat du festin (même gabarit que le tournoi, sans boutons). */
export async function announce(feast, { title, subtitle = "", lines = [] }) {
  const content = await foundry.applications.handlebars.renderTemplate(CARD, { title, subtitle, lines, buttons: [], tournament: "" });
  return ChatMessage.implementation.create({ speaker: { alias: feast.name }, content, flags: { [SYSTEM_ID]: { kind: "feast", feast: feast.uuid } } });
}

/* -------------------------------------------- */
/*  État d'un invité                            */
/* -------------------------------------------- */

export function guestActor(g) {
  try { return g?.uuid ? fromUuidSync(g.uuid) : null; } catch (err) { return null; }
}

/**
 * Tout ce que l'on sait d'un invité à cet instant du festin.
 * @param {object} sys  données du festin (source ou système préparé)
 * @param {object} g    l'invité
 */
export function guestState(sys, g, actor = guestActor(g)) {
  const cfg = C();
  const s = actor?.system;
  const app = Number(s?.characteristics?.app?.value) || 0;
  const living = g.clothing || s?.economy?.living || "ordinary";
  const romantic = (s?.idealEffects?.met ?? []).includes("romantic");
  const start = R.startingEngouement({ living, romantic, other: g.bonus, app }, cfg);
  const eng = R.engouementState({ start, entries: g.entries, app });
  const gloryTotal = Number(s?.gloryTotal) || 0;
  const notoriety = R.notorietyMod(gloryTotal, cfg);
  const att = R.attTotal({ app, engouement: eng.total, notoriety });
  const proud = s?.traits?.modest ? traitPair(s.traits.modest.value).right : 0;
  const modestValue = s?.traits?.modest ? traitPair(s.traits.modest.value).left : 0;
  const round = Number(sys.round) || 0;
  return {
    app, living, romantic, start, acc: eng.acc, engouement: eng.total, gloryTotal, notoriety, att,
    cards: R.cardsAllowed(att, cfg), proud, proudFamous: proud >= cfg.proudFamous, modestValue,
    rank: s?.biography?.knightClass ?? "", seatRank: g.seat ? R.seatRank(g.seat, cfg) : null,
    present: g.left === null || g.left === undefined,
    attended: g.entries.filter(e => e.kind === "seat").length,
    acted: round > 0 && g.entries.some(e => e.round === round && (e.kind === "card" || e.kind === "activity")),
    gloryEarned: g.glory.reduce((t, x) => t + (Number(x.glory) || 0), 0)
  };
}

/**
 * Invités placés sous un PJ de même rang qui a moins de Gloire : test de Modeste ou −1 Honneur.
 * @returns {Set<number>}
 */
export function slightedGuests(sys, states) {
  const out = new Set();
  sys.guests.forEach((g, i) => {
    const a = states[i];
    if (!g.seat || g.yielded === "success" || g.yielded === "critical") return;
    sys.guests.forEach((h, j) => {
      const b = states[j];
      if (i === j || !h.seat || !a.rank || a.rank !== b.rank) return;
      if (b.seatRank > a.seatRank && b.gloryTotal < a.gloryTotal) out.add(i);
    });
  });
  return out;
}

/** Gloire du festin pour chaque invité (Table 3.7 et Gloire gagnée en cours de festin). */
export function feastGloryAll(sys) {
  const states = sys.guests.map(g => guestState(sys, g));
  const size = C().sizes[sys.size] ?? C().sizes.medium;
  const table = R.feastGlory(sys.guests.map((g, i) => ({ id: String(i), app: states[i].app, acc: states[i].acc, rounds: states[i].attended, glory: states[i].gloryTotal })), size, C());
  return sys.guests.map((g, i) => {
    const t = table[String(i)];
    const extra = states[i].gloryEarned;
    return { ...t, extra, total: t.base + t.bonus + extra, state: states[i] };
  });
}

const outcomeLabel = (o) => L(`PDVF.Outcome.${o}`);
const seatLabel = (s) => L(`PDVF.Feast.Seat.${s}`);

/* -------------------------------------------- */
/*  Actions                                      */
/* -------------------------------------------- */

const ACTIONS = {
  addGuest: { who: "gm", fn: async ({ sys }, { uuid }) => {
    if (!uuid || sys.guests.some(g => g.uuid === uuid)) return false;
    const actor = await fromUuid(uuid);
    if (actor?.type !== "chevalier") return false;
    sys.guests.push({ uuid, clothing: "", bonus: 0, seat: "", seatTest: { outcome: "", second: "" }, modest: "", yielded: "",
      entries: [], glory: [], left: null, leftHow: "", inscribed: 0 });
  } },

  removeGuest: { who: "gm", fn: async ({ sys }, { index }) => {
    sys.guests.splice(Number(index), 1);
  } },

  /** Test de Gloire (lancé chez le joueur) : place à table ; sur un échec critique, second test. */
  seat: { who: "guest", fn: async ({ sys, feast, chat, log }, { index, outcome, second = "" }) => {
    const g = sys.guests[Number(index)];
    if (!g || g.seat) return false;
    const size = C().sizes[sys.size] ?? C().sizes.medium;
    const r = R.seatFromTest(outcome, size, { second: second || null });
    if (!r.seat) {
      g.seatTest = { outcome, second: "" };
      return;
    }
    g.seat = r.seat;
    g.seatTest = { outcome, second: second || "" };
    const name = guestActor(g)?.name ?? "?";
    const text = F("PDVF.Feast.Line.Seat", { name, seat: seatLabel(r.seat), outcome: outcomeLabel(outcome) });
    log(text);
    chat.push({ title: L("PDVF.Feast.Seating"), subtitle: feast.name, lines: [text, ...(r.fumble ? [F("PDVF.Feast.Line.FumbleHonor", { name })] : [])] });
  } },

  /** Test de Modeste (placé sous un PJ de même rang moins glorieux) : résultat noté. */
  modest: { who: "guest", fn: async ({ sys, log }, { index, outcome }) => {
    const g = sys.guests[Number(index)];
    if (!g || g.modest) return false;
    g.modest = outcome;
    log(F("PDVF.Feast.Line.Modest", { name: guestActor(g)?.name ?? "?", outcome: outcomeLabel(outcome) }));
  } },

  /** Céder sa place (test de Modeste) : un rang plus bas et de la Gloire sur un succès. */
  yieldSeat: { who: "guest", fn: async ({ sys, feast, chat, log }, { index, outcome }) => {
    const g = sys.guests[Number(index)];
    if (!g || !g.seat || g.yielded) return false;
    g.yielded = outcome;
    const name = guestActor(g)?.name ?? "?";
    const lines = [];
    if (outcome === "success" || outcome === "critical") {
      g.seat = R.lowerSeat(g.seat);
      const glory = C().yieldGlory[outcome];
      g.glory.push({ label: L("PDVF.Feast.Yield"), glory });
      lines.push(F("PDVF.Feast.Line.Yielded", { name, seat: seatLabel(g.seat), glory }));
    } else lines.push(F(outcome === "fumble" ? "PDVF.Feast.Line.YieldFumble" : "PDVF.Feast.Line.YieldFailed", { name }));
    lines.forEach(log);
    chat.push({ title: L("PDVF.Feast.Yield"), subtitle: feast.name, lines });
  } },

  /** Tour suivant : chaque invité présent et placé reçoit l'Engouement de sa place. */
  nextRound: { who: "gm", fn: async ({ sys, feast, chat, log }) => {
    if (sys.round >= sys.rounds) return ui.notifications.info(L("PDVF.Feast.Notify.Over")) && false;
    const unseated = sys.guests.filter(g => !g.seat && (g.left === null)).map(g => guestActor(g)?.name ?? "?");
    if (unseated.length) return ui.notifications.warn(F("PDVF.Feast.Notify.Unseated", { names: unseated.join(", ") })) && false;
    sys.round += 1;
    const lines = [];
    for (const g of sys.guests) {
      if (g.left !== null) continue;
      const mod = C().seats[g.seat]?.mod ?? 0;
      g.entries.push({ round: sys.round, kind: "seat", label: seatLabel(g.seat), mod, host: false, outcome: "", floorZero: false, reset: false });
      const st = guestState(sys, g);
      lines.push(F("PDVF.Feast.Line.RoundGuest", { name: guestActor(g)?.name ?? "?", seat: seatLabel(g.seat), mod: signed(mod), att: st.att, cards: st.cards }));
    }
    const dish = sys.dishes[sys.round - 1];
    if (dish) lines.unshift(F("PDVF.Feast.Line.Dish", { dish }));
    log(F("PDVF.Feast.Line.Round", { round: sys.round, rounds: sys.rounds }));
    chat.push({ title: F("PDVF.Feast.RoundTitle", { round: sys.round, rounds: sys.rounds }), subtitle: feast.name, lines });
  } },

  /** Carte d'évènement jouée (saisie par le joueur) : son Engouement, doublé s'il est perdu au-dessus du sel. */
  card: { who: "guest", fn: async ({ sys, feast, chat, log }, { index, name = "", mod = 0, host = false, forced = false, drawn = null }) => {
    const g = sys.guests[Number(index)];
    if (!g || sys.round < 1 || g.left !== null) return false;
    const before = guestState(sys, g);
    if (before.acted) return ui.notifications.info(L("PDVF.Feast.Notify.AlreadyActed")) && false;
    const applied = R.eventEngouement(Number(mod) || 0, g.seat);
    const label = String(name || L("PDVF.Feast.Card")).slice(0, 80);
    g.entries.push({ round: sys.round, kind: "card", label, mod: applied, host: !!host, outcome: "", floorZero: false, reset: false });
    const who = guestActor(g)?.name ?? "?";
    const lines = [F("PDVF.Feast.Line.Card", { name: who, card: label, mod: signed(applied) })];
    if (applied !== (Number(mod) || 0)) lines.push(L("PDVF.Feast.Line.Doubled"));
    if (host) lines.push(L("PDVF.Feast.Line.HostCard"));
    if (drawn) lines.push(F("PDVF.Feast.Line.Drawn", { n: drawn, max: before.cards }));
    if (forced) {
      g.left = sys.round;
      g.leftHow = "forced";
      lines.push(F("PDVF.Feast.Line.Forced", { name: who }));
    }
    const after = guestState(sys, g);
    lines.push(F("PDVF.Feast.Line.Engouement", { value: signed(after.engouement), att: after.att }));
    log(lines[0]);
    chat.push({ title: F("PDVF.Feast.RoundTitle", { round: sys.round, rounds: sys.rounds }), subtitle: feast.name, lines });
  } },

  /** Autre activité de cour (test lancé chez le joueur) : expérience cochée chez lui, Gloire sur un critique. */
  activity: { who: "guest", fn: async ({ sys, feast, chat, log }, { index, activity, outcome, glory = 0 }) => {
    const g = sys.guests[Number(index)];
    if (!g || sys.round < 1 || g.left !== null || !(activity in C().activities)) return false;
    if (guestState(sys, g).acted) return ui.notifications.info(L("PDVF.Feast.Notify.AlreadyActed")) && false;
    const label = L(`PDVF.Feast.Activity.${activity}`);
    g.entries.push({ round: sys.round, kind: "activity", label, mod: 0, host: false, outcome, floorZero: false, reset: false });
    if (Number(glory) > 0) g.glory.push({ label, glory: Number(glory) });
    const who = guestActor(g)?.name ?? "?";
    const lines = [F("PDVF.Feast.Line.Activity", { name: who, activity: label, outcome: outcomeLabel(outcome) })];
    if (Number(glory) > 0) lines.push(F("PDVF.Feast.Line.ActivityGlory", { name: who, glory }));
    lines.forEach(log);
    chat.push({ title: F("PDVF.Feast.RoundTitle", { round: sys.round, rounds: sys.rounds }), subtitle: feast.name, lines });
  } },

  /** Quitter le festin (test de Courtoisie lancé chez le joueur). */
  leave: { who: "guest", fn: async ({ sys, feast, chat, log }, { index, outcome, loss = 0 }) => {
    const g = sys.guests[Number(index)];
    if (!g || sys.round < 1 || g.left !== null) return false;
    const name = guestActor(g)?.name ?? "?";
    const lines = [];
    if (outcome === "failure") {
      g.entries.push({ round: sys.round, kind: "leave", label: L("PDVF.Feast.Leave"), mod: -(Number(loss) || 0), host: false, outcome, floorZero: true, reset: false });
      lines.push(F("PDVF.Feast.Line.LeaveFailure", { name, loss }));
    } else if (outcome === "fumble") {
      g.entries.push({ round: sys.round, kind: "leave", label: L("PDVF.Feast.Leave"), mod: 0, host: false, outcome, floorZero: false, reset: true });
      lines.push(F("PDVF.Feast.Line.LeaveFumble", { name }));
    } else {
      if (outcome === "critical") g.glory.push({ label: L("PDVF.Feast.Leave"), glory: C().leaveGlory });
      lines.push(F(outcome === "critical" ? "PDVF.Feast.Line.LeaveCritical" : "PDVF.Feast.Line.LeaveSuccess", { name, glory: C().leaveGlory }));
    }
    g.left = sys.round;
    g.leftHow = "courtesy";
    lines.forEach(log);
    chat.push({ title: L("PDVF.Feast.Leave"), subtitle: feast.name, lines });
  } },

  /** Ajustement d'Engouement par le MJ (carte jouée par un autre, effet d'une carte conservée…). */
  adjust: { who: "gm", fn: async ({ sys, log }, { index, mod = 0, label = "" }) => {
    const g = sys.guests[Number(index)];
    const m = Number(mod) || 0;
    if (!g || !m) return false;
    g.entries.push({ round: sys.round, kind: "gm", label: String(label || L("PDVF.Feast.Adjust")).slice(0, 80), mod: m, host: false, outcome: "", floorZero: false, reset: false });
    log(F("PDVF.Feast.Line.Adjust", { name: guestActor(g)?.name ?? "?", mod: signed(m), label: label || L("PDVF.Feast.Adjust") }));
  } },

  /** Le MJ annule la dernière écriture d'un invité. */
  undoEntry: { who: "gm", fn: async ({ sys }, { index }) => {
    const g = sys.guests[Number(index)];
    if (!g?.entries.length) return false;
    const e = g.entries.pop();
    if (e.kind === "card" || e.kind === "leave") { if (g.left === e.round) { g.left = null; g.leftHow = ""; } }
  } },

  /** Le MJ efface la place (nouveau test de Gloire). */
  resetSeat: { who: "gm", fn: async ({ sys }, { index }) => {
    const g = sys.guests[Number(index)];
    if (!g) return false;
    g.seat = ""; g.seatTest = { outcome: "", second: "" }; g.modest = ""; g.yielded = "";
  } },

  /** Inscrit la Gloire du festin dans la Gloire de session de chaque invité (ce qui n'y est pas encore). */
  inscribe: { who: "gm", fn: async ({ sys, feast, chat }) => {
    const all = feastGloryAll(sys);
    const lines = [];
    for (const [i, g] of sys.guests.entries()) {
      const actor = guestActor(g);
      if (!actor) continue;
      const due = all[i].total - (Number(g.inscribed) || 0);
      if (due <= 0) continue;
      await actor.update({ "system.glory.session": (Number(actor.system.glory?.session) || 0) + due });
      g.inscribed = all[i].total;
      lines.push(F(all[i].best ? "PDVF.Feast.Line.InscribedBest" : "PDVF.Feast.Line.Inscribed", { name: actor.name, glory: due }));
    }
    if (!lines.length) return ui.notifications.info(L("PDVF.Feast.Notify.NothingToInscribe")) && false;
    chat.push({ title: L("PDVF.Feast.Inscribe"), subtitle: feast.name, lines });
  } }
};

/**
 * Crée le festin du soir d'un tournoi, avec ses chevaliers inscrits.
 * @param {Item} tournament
 * @returns {Promise<Item>}
 */
export async function createFromTournament(tournament) {
  const s = tournament.system;
  const size = C().fromTournament[s.size] ?? "medium";
  const feast = await Item.implementation.create({
    name: F("PDVF.Feast.EveningName", { name: tournament.name }), type: "festin", folder: tournament.folder?.id ?? null,
    system: { size, rounds: C().sizes[size].rounds, year: s.year, place: s.place, host: s.host, tournament: tournament.uuid }
  });
  for (const k of s.knights) await perform(feast, "addGuest", { uuid: k.uuid }, game.user.id);
  return feast;
}
