/**
 * Moteur du tournoi : toutes les écritures dans le document « Tournoi » passent par ici et sont faites
 * par le MJ. Un joueur envoie sa demande au MJ par le socket du système ; ses propres jets (épreuves
 * abrégées, Charge des passes de joute, tests de cour) sont lancés chez lui et seul le résultat est transmis.
 */
import { PDVF, SYSTEM_ID } from "../config.mjs";
import * as T from "../rules/tournament.mjs";
import { resolveTest } from "../rules/resolution.mjs";
import { rollPlain } from "../dice/tests.mjs";
import { receiveDamage, combatStats, mountOf } from "../combat/damage.mjs";
import { perform as battlePerform } from "../battle/engine.mjs";
import { createFromTournament } from "../feast/engine.mjs";

const L = (k) => game.i18n.localize(k);
const F = (k, d) => game.i18n.format(k, d);
const C = () => PDVF.tournament;

export const SOCKET = `system.${SYSTEM_ID}`;
const CARD = `systems/${SYSTEM_ID}/templates/chat/tournament-card.hbs`;

/* -------------------------------------------- */
/*  Demandes et socket                          */
/* -------------------------------------------- */

/** Demande une action : faite tout de suite par le MJ, envoyée au MJ actif par un joueur. */
export async function request(tournament, action, payload = {}) {
  if (game.user.isGM) return perform(tournament, action, payload, game.user.id);
  if (!game.users.activeGM) return ui.notifications.warn(L("PDVF.Tournament.Notify.NoGM"));
  game.socket.emit(SOCKET, { type: "tournament", action, tournament: tournament.uuid, payload, user: game.user.id });
}

/** Réception des messages du socket du système. */
export function onSocket(data) {
  if (data?.type === "tournamentOpen") {
    if (!game.user.isGM) fromUuid(data.tournament).then(t => t?.sheet?.render(true));
    return;
  }
  if (data?.type !== "tournament" || !game.users.activeGM?.isSelf) return;
  fromUuid(data.tournament).then(t => { if (t) perform(t, data.action, data.payload, data.user); });
}

/** Ouvre le tournoi chez tous les joueurs. */
export function showToPlayers(tournament) {
  game.socket.emit(SOCKET, { type: "tournamentOpen", tournament: tournament.uuid });
}

let queue = Promise.resolve();

/** Exécute une action côté MJ, l'une après l'autre. */
export function perform(tournament, action, payload, userId) {
  queue = queue.then(() => run(tournament, action, payload ?? {}, userId)).catch(err => {
    console.error(`${SYSTEM_ID} | Tournoi : ${action}`, err);
    ui.notifications.error(`${L("PDVF.Tournament.Title")} : ${err.message}`);
  });
  return queue;
}

async function run(tournament, action, payload, userId) {
  const def = ACTIONS[action];
  if (!def) return;
  const user = userId ? game.users.get(userId) : game.user;
  if (!user) return;
  if (!allowed(tournament, def.who, payload, user)) {
    console.warn(`${SYSTEM_ID} | Tournoi : action « ${action} » refusée pour ${user.name}`);
    return;
  }
  const sys = foundry.utils.deepClone(tournament._source.system);
  const ctx = { tournament, sys, user, chat: [], log: (text) => sys.log.push(text) };
  const keep = await def.fn(ctx, payload);
  if (keep !== false) await tournament.update({ system: sys });
  for (const card of ctx.chat) await announce(tournament, card);
}

/** Le MJ fait tout ; un joueur seulement pour son chevalier. */
function allowed(tournament, who, payload, user) {
  if (user.isGM) return true;
  if (who !== "knight") return false;
  const k = tournament.system.knights[Number(payload.index)];
  return !!k && !!knightActor(k)?.testUserPermission?.(user, "OWNER");
}

/** Carte de chat du tournoi. */
export async function announce(tournament, { title, subtitle = "", lines = [], buttons = [] }) {
  const content = await foundry.applications.handlebars.renderTemplate(CARD, { title, subtitle, lines, buttons, tournament: tournament.uuid });
  return ChatMessage.implementation.create({ speaker: { alias: tournament.name }, content, flags: { [SYSTEM_ID]: { kind: "tournament", tournament: tournament.uuid } } });
}

/* -------------------------------------------- */
/*  Outils                                       */
/* -------------------------------------------- */

export function knightActor(k) {
  try { return k?.uuid ? fromUuidSync(k.uuid) : null; } catch (err) { return null; }
}

async function roll(formula, flavor, tournament) {
  const r = new Roll(String(formula).replace(/D/g, "d"));
  await r.evaluate();
  if (flavor) await r.toMessage({ speaker: { alias: tournament.name }, flavor });
  return r;
}

const blunted = (sys) => sys.stakes !== "war";
const outcomeLabel = (o) => L(`PDVF.Outcome.${o}`);

/** Un PJ concurrent d'une joute (valeurs lues sur sa fiche). */
function pcJouster(sys, index) {
  const actor = knightActor(sys.knights[index]);
  const s = actor?.system;
  const horse = actor ? mountOf(actor) : null;
  return {
    kind: "pc", index, name: actor?.name ?? "?",
    charge: Math.min(Number(s?.skills?.charge?.value) || 0, Number(s?.skills?.horsemanship?.value) || 0),
    dex: Number(s?.characteristics?.dex?.value) || 0, horsemanship: Number(s?.skills?.horsemanship?.value) || 0,
    horseDamage: horse?.system?.charge ?? "", lances: 0, unhorsed: false, disqualified: false,
    roll: { die: null, adjusted: null, outcome: "", success: false, total: null }
  };
}

/** Un adversaire de la Table 3.14. */
function npcJouster(row, n) {
  return {
    kind: "npc", index: null, name: F("PDVF.Tournament.OpponentName", { n }),
    charge: row.charge, dex: PDVF.tournament.opponentDex, horsemanship: row.charge,
    horseDamage: row.horseDamage, lances: 0, unhorsed: false, disqualified: false,
    roll: { die: null, adjusted: null, outcome: "", success: false, total: null }
  };
}

/** Dégâts de chute (l'armure ne protège pas, sauf l'armure de vertu) ou d'écrasement (armure normale). */
async function hurt(sys, side, formula, { fall = true, ignoreArmor = false, source = "" } = {}, lines, tournament) {
  const r = await roll(formula, null, tournament);
  if (side.kind !== "pc") { lines.push(F("PDVF.Tournament.Line.NpcHurt", { name: side.name, damage: r.total })); return; }
  const actor = knightActor(sys.knights[side.index]);
  if (!actor) return;
  const st = combatStats(actor);
  const out = await receiveDamage(actor, {
    base: r.total, knockdown: false, source,
    ...(fall || ignoreArmor ? { armorValue: st.virtueArmor } : {})
  });
  lines.push(...out.lines);
}

/** Test d'un concurrent (DEX, Équitation) lancé par le MJ, visible dans le chat. */
async function sideTest(side, value, label, tournament) {
  const res = await rollPlain({ name: side.name, label, value, title: label, subtitle: tournament.name, alias: side.name });
  return res.result;
}

/* -------------------------------------------- */
/*  Actions                                      */
/* -------------------------------------------- */

const ACTIONS = {
  addKnight: { who: "gm", fn: async ({ sys, tournament }, { uuid }) => {
    if (!uuid || sys.knights.some(k => k.uuid === uuid)) return false;
    const actor = await fromUuid(uuid);
    if (actor?.type !== "chevalier") return false;
    const abridged = () => ({ row: "", skill: "", glory: 0, damageRow: "", damage: 0 });
    sys.knights.push({
      uuid, melee: true, joust: !!sys.joust.enabled, favor: false,
      abridged: { melee: abridged(), joust: abridged() },
      court: { allowed: null, penalty: 0, tests: [] },
      side: { feast: "", mass: "", temptation: "" },
      joustWins: 0, joustGlory: 0, joustOut: false, champion: { melee: false, joust: false }, inscribed: 0
    });
  } },

  removeKnight: { who: "gm", fn: async ({ sys }, { index }) => {
    sys.knights.splice(Number(index), 1);
  } },

  rollSize: { who: "gm", fn: async ({ sys, tournament, chat }, { bonus = 0 }) => {
    const r = await roll(`1d20 + ${Number(bonus) || 0}`, L("PDVF.Tournament.SizeRoll"), tournament);
    sys.sizeRoll = r.total;
    sys.size = T.sizeFromRoll(r.total, C().sizes);
    chat.push({ title: L("PDVF.Tournament.SizeRoll"), subtitle: tournament.name, lines: [F("PDVF.Tournament.Line.Size", { total: r.total, size: L(`PDVF.Tournament.Size.${sys.size}`) })] });
  } },

  rollDifficulty: { who: "gm", fn: async ({ sys, tournament, chat }) => {
    const r = await roll("1d20", L("PDVF.Tournament.DifficultyRoll"), tournament);
    const row = T.difficultyFromRoll(r.total, C().difficulty);
    sys.difficulty.roll = r.total;
    sys.difficulty.mod = row.mod;
    sys.difficulty.cause = row.id;
    chat.push({ title: L("PDVF.Tournament.DifficultyRoll"), subtitle: tournament.name,
      lines: [F("PDVF.Tournament.Line.Difficulty", { total: r.total, mod: row.mod > 0 ? `+${row.mod}` : `${row.mod}`, cause: L(`PDVF.Tournament.Cause.${row.id}`) })] });
  } },

  /** Épreuve abrégée d'un PJ : jets et dégâts faits chez le joueur, résultat noté ici. */
  abridged: { who: "knight", fn: async ({ sys, log }, { index, event, row, skill, glory, damageRow, damage }) => {
    const k = sys.knights[Number(index)];
    if (!k || !["melee", "joust"].includes(event) || k.abridged[event]?.row) return false;
    k.abridged[event] = { row, skill, glory: Number(glory) || 0, damageRow: damageRow ?? "", damage: Number(damage) || 0 };
    log(F("PDVF.Tournament.Log.Abridged", { name: knightActor(k)?.name ?? "?", event: L(`PDVF.Tournament.Event.${event}`), row: L(`PDVF.Tournament.Row.${row}`), glory }));
  } },

  /** Nombre de tests de cour du PJ (tiré une fois). */
  courtAllowed: { who: "knight", fn: async ({ sys }, { index, allowed }) => {
    const k = sys.knights[Number(index)];
    if (!k || k.court.allowed !== null) return false;
    k.court.allowed = Number(allowed) || 0;
  } },

  court: { who: "knight", fn: async ({ sys, log }, { index, skill, outcome, glory }) => {
    const k = sys.knights[Number(index)];
    if (!k || k.court.allowed === null || k.court.tests.length >= k.court.allowed) return false;
    k.court.tests.push({ skill, outcome, glory: Number(glory) || 0 });
    log(F("PDVF.Tournament.Log.Court", { name: knightActor(k)?.name ?? "?", skill: L(`PDVF.Skill.${skill}`), outcome: outcomeLabel(outcome), glory }));
  } },

  side: { who: "knight", fn: async ({ sys }, { index, event, choice }) => {
    const k = sys.knights[Number(index)];
    if (!k || !(event in k.side) || k.side[event]) return false;
    k.side[event] = choice;
  } },

  /* ----- Joute ----- */

  /** Nouveau tour de joute : chaque PJ encore en lice affronte un adversaire tiré (1D20 + tour). */
  joustRound: { who: "gm", fn: async ({ sys, tournament, chat }) => {
    if (sys.joust.matches.some(m => m.state === "open")) return ui.notifications.warn(L("PDVF.Tournament.Notify.MatchesOpen")) && false;
    const rounds = (C().sizes[sys.size] ?? C().sizes.neighborhood).joustRounds;
    if (sys.joust.round >= rounds) return ui.notifications.info(L("PDVF.Tournament.Notify.JoustOver")) && false;
    const round = sys.joust.round + 1;
    const lines = [];
    let n = 0;
    for (const [index, k] of sys.knights.entries()) {
      if (!k.joust || k.joustOut) continue;
      const r = await roll(`1d20 + ${round}`, null, tournament);
      const row = T.opponentFromRoll(r.total, C().opponents);
      n++;
      const npc = npcJouster(row, `${round}.${n}`);
      sys.joust.matches.push({ id: foundry.utils.randomID(), round, pass: 0, a: pcJouster(sys, index), b: npc, state: "open", winner: "", lines: [] });
      lines.push(F("PDVF.Tournament.Line.Pairing", { name: knightActor(k)?.name ?? "?", roll: r.total, charge: row.charge }));
    }
    if (!n) return ui.notifications.info(L("PDVF.Tournament.Notify.NoJouster")) && false;
    sys.joust.round = round;
    chat.push({ title: F("PDVF.Tournament.JoustRound", { round, rounds }), subtitle: tournament.name, lines,
      buttons: [{ action: "charge", label: L("PDVF.Tournament.RollCharge") }] });
  } },

  /** Test de Charge d'un PJ pour la passe en cours (lancé chez le joueur). */
  charge: { who: "knight", fn: async ({ sys }, { index, match, result }) => {
    const m = sys.joust.matches.find(x => x.id === match);
    if (!m || m.state !== "open") return false;
    const side = m.a.kind === "pc" && m.a.index === Number(index) ? m.a : m.b.kind === "pc" && m.b.index === Number(index) ? m.b : null;
    if (!side || side.roll.outcome) return false;
    side.roll = { die: result.die, adjusted: result.adjusted, outcome: result.outcome, success: !!result.success, total: result.total };
  } },

  /** Le MJ résout la passe : Charge des adversaires, Table 3.17, tests de DEX et d'Équitation, chutes. */
  resolvePass: { who: "gm", fn: async (ctx, { match }) => {
    const { sys, tournament, chat } = ctx;
    const m = sys.joust.matches.find(x => x.id === match);
    if (!m || m.state !== "open") return false;
    for (const side of [m.a, m.b]) {
      if (side.roll.outcome) continue;
      if (side.kind === "pc") return ui.notifications.warn(F("PDVF.Tournament.Notify.WaitCharge", { name: side.name })) && false;
      const res = await rollPlain({ name: side.name, label: L("PDVF.Skill.charge"), value: side.charge, title: L("PDVF.Tournament.Pass"), subtitle: tournament.name, alias: side.name });
      side.roll = { die: res.result.die, adjusted: res.result.adjusted, outcome: res.result.outcome, success: res.result.success, total: res.result.total };
    }
    m.pass += 1;
    const lines = [F("PDVF.Tournament.Line.PassRolls", { pass: m.pass, a: m.a.name, ao: outcomeLabel(m.a.roll.outcome), ad: m.a.roll.die, b: m.b.name, bo: outcomeLabel(m.b.roll.outcome), bd: m.b.roll.die })];
    const ra = { ...m.a.roll, critBonus: 0 };
    const rb = { ...m.b.roll, critBonus: 0 };
    const pass = T.joustPass(ra, rb);
    lines.push(L(`PDVF.Tournament.PassKind.${pass.kind}`));
    const barrier = !!sys.joust.barrier;
    const src = L("PDVF.Tournament.JoustFall");

    if (pass.kind === "doubleFumble") {
      const d = await roll("1d6", null, tournament);
      const df = T.joustDoubleFumble(d.total, { barrier });
      lines.push(F("PDVF.Tournament.Line.DoubleFumble", { die: d.total, text: L(`PDVF.Tournament.DoubleFumble.${df.id}`) }));
      if (df.disqualified) { m.a.disqualified = m.b.disqualified = true; }
      if (df.unhorsed) for (const s of [m.a, m.b]) { s.unhorsed = true; await hurt(sys, s, df.fallDice, { source: src }, lines, tournament); }
      if (df.collision) for (const [s, o] of [[m.a, m.b], [m.b, m.a]]) lines.push(F("PDVF.Tournament.Line.Collision", { name: s.name, damage: o.horseDamage || "—" }));
    }

    for (const [key, other] of [["a", "b"], ["b", "a"]]) {
      const side = m[key];
      const eff = pass[key];
      // Lance brisée sur l'adversaire
      if (eff.breaks || (eff.breaksIfOdd && (Number(side.roll.die) || 0) % 2 === 1)) {
        side.lances += 1;
        lines.push(F("PDVF.Tournament.Line.LanceBroken", { name: side.name, lances: side.lances }));
      }
      // Coup parfait : désarçonné d'office, chute, peut-être écrasé sous son cheval
      if (eff.unhorsed) {
        side.unhorsed = true;
        lines.push(F("PDVF.Tournament.Line.Unhorsed", { name: side.name }));
        if (eff.fallDice) await hurt(sys, side, eff.fallDice, { source: src }, lines, tournament);
      }
      if (eff.rideTest) {
        const t = await sideTest(side, side.horsemanship, L("PDVF.Skill.horsemanship"), tournament);
        lines.push(F("PDVF.Tournament.Line.Test", { name: side.name, label: L("PDVF.Skill.horsemanship"), die: t.die, outcome: outcomeLabel(t.outcome) }));
        if (!t.success) {
          if (eff.rideTest === "crushed") {
            lines.push(F("PDVF.Tournament.Line.Crushed", { name: side.name }));
            if (side.horseDamage) await hurt(sys, side, side.horseDamage, { fall: false, source: L("PDVF.Tournament.Crushed") }, lines, tournament);
          } else {
            side.unhorsed = true;
            lines.push(F("PDVF.Tournament.Line.HorseDown", { name: side.name }));
            await hurt(sys, side, "1D6", { source: src }, lines, tournament);
          }
        }
      }
      if (eff.dexTest && !side.unhorsed) {
        const t = await sideTest(side, side.dex, L("PDVF.Char.dex.long"), tournament);
        lines.push(F("PDVF.Tournament.Line.Test", { name: side.name, label: L("PDVF.Char.dex.long"), die: t.die, outcome: outcomeLabel(t.outcome) }));
        if (!t.success) {
          side.unhorsed = true;
          lines.push(F("PDVF.Tournament.Line.Unhorsed", { name: side.name }));
          await hurt(sys, side, "1D6", { source: src }, lines, tournament);
        }
      }
      if (eff.fumble) {
        const d = await roll("1d20", null, tournament);
        const f = T.joustFumble(d.total, { barrier });
        lines.push(F("PDVF.Tournament.Line.Fumble", { name: side.name, die: d.total, text: L(`PDVF.Tournament.Fumble.${f.id}`) }));
        if (f.disqualified) side.disqualified = true;
        if (f.unhorsed) { side.unhorsed = true; await hurt(sys, side, f.fallDice, { source: src, ignoreArmor: !!f.ignoreArmor }, lines, tournament); }
        if (f.courtPenalty && side.kind === "pc") sys.knights[side.index].court.penalty = C().droppedLance;
        if (f.forgiving) lines.push(F("PDVF.Tournament.Line.Forgiving", { name: m[other].name }));
      }
    }

    const outcome = T.joustOutcome(m.a, m.b, { pass: m.pass, lances: C().joust.lances, passes: C().joust.passes });
    if (outcome) finishMatch(sys, m, outcome, lines);
    else {
      // Passe suivante : on remet en selle et on efface les jets
      for (const s of [m.a, m.b]) { s.unhorsed = false; s.roll = { die: null, adjusted: null, outcome: "", success: false, total: null }; }
      lines.push(F("PDVF.Tournament.Line.NextPass", { a: m.a.lances, b: m.b.lances }));
    }
    m.lines.push(...lines);
    chat.push({ title: F("PDVF.Tournament.MatchTitle", { a: m.a.name, b: m.b.name }), subtitle: `${tournament.name} — ${F("PDVF.Tournament.PassN", { pass: m.pass })}`, lines,
      buttons: m.state === "open" ? [{ action: "charge", label: L("PDVF.Tournament.RollCharge") }] : [] });
  } },

  /** Le MJ déclare l'issue d'une rencontre (cas particuliers). */
  decideMatch: { who: "gm", fn: async ({ sys, tournament, chat }, { match, winner }) => {
    const m = sys.joust.matches.find(x => x.id === match);
    if (!m || m.state !== "open") return false;
    const lines = [];
    finishMatch(sys, m, winner, lines);
    m.lines.push(...lines);
    chat.push({ title: F("PDVF.Tournament.MatchTitle", { a: m.a.name, b: m.b.name }), subtitle: tournament.name, lines });
  } },

  /* ----- Mêlée, défis, trophées, inscription ----- */

  /** Crée la mêlée : une Bataille en mode tournoi, avec les chevaliers inscrits. */
  createMelee: { who: "gm", fn: async ({ sys, tournament, chat }) => {
    const existing = sys.melee.battle ? await fromUuid(sys.melee.battle) : null;
    if (existing) { existing.sheet?.render(true); return false; }
    const size = C().sizes[sys.size] ?? C().sizes.neighborhood;
    const battle = await Item.implementation.create({
      name: F("PDVF.Tournament.MeleeName", { name: tournament.name }), type: "bataille", folder: tournament.folder?.id ?? null,
      system: { tournament: true, size: size.battle, year: sys.year, place: sys.place }
    });
    sys.melee.battle = battle.uuid;
    for (const k of sys.knights.filter(x => x.melee)) await battlePerform(battle, "addKnight", { uuid: k.uuid }, game.user.id);
    battle.sheet?.render(true);
    chat.push({ title: L("PDVF.Tournament.Melee"), subtitle: tournament.name, lines: [L("PDVF.Tournament.Line.MeleeCreated")] });
  } },

  /** Festin du soir : un objet « Festin » avec les chevaliers inscrits. */
  createFeast: { who: "gm", fn: async ({ sys, tournament, chat }) => {
    const existing = sys.feast ? await fromUuid(sys.feast) : null;
    if (existing) { existing.sheet?.render(true); return false; }
    const feast = await createFromTournament(tournament);
    sys.feast = feast.uuid;
    feast.sheet?.render(true);
    chat.push({ title: L("PDVF.Feast.Evening"), subtitle: tournament.name, lines: [F("PDVF.Feast.Line.EveningCreated", { size: L(`PDVF.Feast.Size.${feast.system.size}`) })] });
  } },

  /** Défi courtois : test de la même compétence pour tous ; les meilleurs restent, jusqu'à un seul vainqueur. */
  challenge: { who: "gm", fn: async ({ sys, tournament, chat }, { skill }) => {
    let field = sys.knights.map((k, index) => ({ index, actor: knightActor(k) })).filter(x => x.actor);
    if (field.length < 2 || !(skill in PDVF.skills)) return ui.notifications.warn(L("PDVF.Tournament.Notify.ChallengeField")) && false;
    const lines = [];
    for (let round = 1; round <= 10 && field.length > 1; round++) {
      const results = [];
      for (const x of field) {
        const value = Number(x.actor.system.skills?.[skill]?.value) || 0;
        const r = await roll("1d20", null, tournament);
        const res = resolveTest(value, sys.knights[x.index].court.penalty || 0, r.total);
        const score = res.outcome === "critical" ? 100 : res.success ? res.adjusted : -1;
        results.push({ ...x, res, score });
        lines.push(F("PDVF.Tournament.Line.Challenge", { round, name: x.actor.name, value, die: res.die, outcome: outcomeLabel(res.outcome) }));
      }
      const best = Math.max(...results.map(r => r.score));
      field = best < 0 ? field : results.filter(r => r.score === best);
    }
    const winner = field.length === 1 ? field[0].actor.name : "";
    lines.push(winner ? F("PDVF.Tournament.Line.ChallengeWinner", { name: winner }) : L("PDVF.Tournament.Line.ChallengeNone"));
    sys.challenges.push({ skill, winner, lines });
    chat.push({ title: F("PDVF.Tournament.Challenge", { skill: L(`PDVF.Skill.${skill}`) }), subtitle: tournament.name, lines });
  } },

  /** Trophée (Table 3.18) remis à un chevalier. */
  prize: { who: "gm", fn: async ({ sys, tournament, chat }, { to = "" }) => {
    const size = C().sizes[sys.size] ?? C().sizes.neighborhood;
    const r = await roll(`1d20 + ${size.prize}`, L("PDVF.Tournament.PrizeRoll"), tournament);
    const p = T.prizeFromRoll(r.total, C().prizes);
    sys.prizes.push({ r: p.r, pounds: p.pounds, to });
    chat.push({ title: L("PDVF.Tournament.PrizeRoll"), subtitle: tournament.name, lines: [F("PDVF.Tournament.Line.Prize", { to: to || "—", prize: L(`PDVF.Tournament.Prize.${p.r}`), pounds: p.pounds })] });
  } },

  /** Inscrit la Gloire du tournoi dans la Gloire de session de chaque chevalier (ce qui n'y est pas encore). */
  inscribe: { who: "gm", fn: async ({ sys, tournament, chat }) => {
    const size = C().sizes[sys.size] ?? C().sizes.neighborhood;
    const lines = [];
    for (const k of sys.knights) {
      const actor = knightActor(k);
      if (!actor) continue;
      const romantic = (actor.system.idealEffects?.met ?? []).includes("romantic");
      const g = T.knightTournamentGlory(k, size, { romantic });
      const due = g.total - (Number(k.inscribed) || 0);
      if (due <= 0) continue;
      await actor.update({ "system.glory.session": (Number(actor.system.glory?.session) || 0) + due });
      k.inscribed = g.total;
      lines.push(F(g.doubled ? "PDVF.Tournament.Line.InscribedFavor" : "PDVF.Tournament.Line.Inscribed", { name: actor.name, glory: due }));
    }
    if (!lines.length) return ui.notifications.info(L("PDVF.Tournament.Notify.NothingToInscribe")) && false;
    chat.push({ title: L("PDVF.Tournament.Inscribe"), subtitle: tournament.name, lines });
  } }
};

/** Fin d'une rencontre : vainqueur, Gloire, élimination, champion de la joute au dernier tour. */
function finishMatch(sys, m, outcome, lines) {
  m.state = "done";
  m.winner = outcome;
  const rounds = (C().sizes[sys.size] ?? C().sizes.neighborhood).joustRounds;
  if (outcome === "none") {
    lines.push(L("PDVF.Tournament.Line.NoWinner"));
    for (const s of [m.a, m.b]) if (s.kind === "pc") sys.knights[s.index].joustOut = true;
    return;
  }
  const W = m[outcome];
  const Lo = m[outcome === "a" ? "b" : "a"];
  lines.push(F("PDVF.Tournament.Line.MatchWon", { name: W.name, lances: W.lances, other: Lo.lances }));
  if (W.kind === "pc") {
    const k = sys.knights[W.index];
    const g = T.joustGlory(Lo.charge, { blunted: blunted(sys) }, PDVF.combatGlory);
    k.joustWins += 1;
    k.joustGlory += g;
    lines.push(F("PDVF.Tournament.Line.JoustGlory", { name: W.name, glory: g }));
    if (m.round >= rounds) { k.champion.joust = true; lines.push(F("PDVF.Tournament.Line.Champion", { name: W.name })); }
  }
  if (Lo.kind === "pc") sys.knights[Lo.index].joustOut = true;
}
