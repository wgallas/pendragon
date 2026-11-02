/**
 * Moteur de la chasse, de la course et de la poursuite : toutes les écritures dans le document « Chasse »
 * passent par ici et sont faites par le MJ. Les jets collectifs (levée, tours de chasse, obstacles, tours
 * de poursuite) sont lancés par le MJ et regroupés sur une carte ; le coup porté à la proie est lancé
 * par le joueur, qui envoie son résultat.
 */
import { PDVF, SYSTEM_ID } from "../config.mjs";
import * as H from "../rules/hunt.mjs";
import { resolveTest, compareOpposed } from "../rules/resolution.mjs";
import { addDice } from "../rules/combat.mjs";
import { combatStats, mountOf, receiveDamage } from "../combat/damage.mjs";
import { normalizeLabel } from "../rules/followers.mjs";

const L = (k) => game.i18n.localize(k);
const F = (k, d) => game.i18n.format(k, d);
const C = () => PDVF.hunt;
const OC = (o) => L(`PDVF.Outcome.${o}`);

export const SOCKET = `system.${SYSTEM_ID}`;
const CARD = `systems/${SYSTEM_ID}/templates/chat/tournament-card.hbs`;

/* -------------------------------------------- */
/*  Demandes et socket                          */
/* -------------------------------------------- */

export async function request(hunt, action, payload = {}) {
  if (game.user.isGM) return perform(hunt, action, payload, game.user.id);
  if (!game.users.activeGM) return ui.notifications.warn(L("PDVF.Hunt.Notify.NoGM"));
  game.socket.emit(SOCKET, { type: "hunt", action, hunt: hunt.uuid, payload, user: game.user.id });
}

export function onSocket(data) {
  if (data?.type === "huntOpen") {
    if (!game.user.isGM) fromUuid(data.hunt).then(h => h?.sheet?.render(true));
    return;
  }
  if (data?.type !== "hunt" || !game.users.activeGM?.isSelf) return;
  fromUuid(data.hunt).then(h => { if (h) perform(h, data.action, data.payload, data.user); });
}

export function showToPlayers(hunt) {
  game.socket.emit(SOCKET, { type: "huntOpen", hunt: hunt.uuid });
}

let queue = Promise.resolve();

export function perform(hunt, action, payload, userId) {
  queue = queue.then(() => run(hunt, action, payload ?? {}, userId)).catch(err => {
    console.error(`${SYSTEM_ID} | Chasse : ${action}`, err);
    ui.notifications.error(`${L("PDVF.Hunt.Title")} : ${err.message}`);
  });
  return queue;
}

async function run(hunt, action, payload, userId) {
  const def = ACTIONS[action];
  if (!def) return;
  const user = userId ? game.users.get(userId) : game.user;
  if (!user) return;
  if (!user.isGM) {
    const p = hunt.system.participants[Number(payload.index)];
    if (def.who !== "player" || !p || !actorOf(p)?.testUserPermission?.(user, "OWNER")) return;
  }
  const sys = foundry.utils.deepClone(hunt._source.system);
  const ctx = { hunt, sys, user, chat: [], rolls: [], log: (t) => sys.log.push(t) };
  const keep = await def.fn(ctx, payload);
  if (keep !== false) await hunt.update({ system: sys });
  for (const card of ctx.chat) await announce(hunt, card, ctx.rolls);
}

export async function announce(hunt, { title, subtitle = "", lines = [] }, rolls = []) {
  const content = await foundry.applications.handlebars.renderTemplate(CARD, { title, subtitle: subtitle || hunt.name, lines, buttons: [], tournament: "" });
  return ChatMessage.implementation.create({ speaker: { alias: hunt.name }, content, rolls, flags: { [SYSTEM_ID]: { kind: "hunt", hunt: hunt.uuid } } });
}

/* -------------------------------------------- */
/*  Valeurs des participants                     */
/* -------------------------------------------- */

export function actorOf(p) {
  try { return p?.uuid ? fromUuidSync(p.uuid) : null; } catch (e) { return null; }
}

/** Compétence d'un PNJ par son nom (« Chasse », « Vigilance »…), ou sa valeur par défaut. */
function npcSkill(actor, id) {
  const label = normalizeLabel(L(`PDVF.Skill.${id}`));
  const row = (actor.system.skills ?? []).find(s => normalizeLabel(s.name).startsWith(label));
  return row ? Number(row.value) || 0 : Number(actor.system.defaultSkill) || 10;
}

/** Valeur d'un Attribut pour un participant : « skill.x », « char.x », « horse.dex|con », « move ». */
export function valueOf(p, key) {
  const a = actorOf(p);
  if (!a) return 0;
  const [kind, id] = key.split(".");
  if (kind === "move") {
    if (a.type === "cheval") return Number(a.system.derived?.move) || 0;
    const st = combatStats(a);
    return p.mounted && st.horseMove ? st.horseMove : st.move;
  }
  if (kind === "horse") {
    const h = a.type === "chevalier" ? mountOf(a) : null;
    return Number((h ?? a).system.characteristics?.[id]?.value) || 0;
  }
  if (kind === "char") return Number(a.system.characteristics?.[id]?.value) || 0;
  if (kind === "skill") return a.type === "chevalier" ? Number(a.system.skills?.[id]?.value) || 0 : npcSkill(a, id);
  return 0;
}

/** Test d'un participant (critique : croix d'expérience d'un chevalier). */
async function testOf(ctx, p, key, modifier = 0) {
  const r = await new Roll("1d20").evaluate();
  ctx.rolls.push(r);
  const value = valueOf(p, key);
  const res = resolveTest(value, modifier, r.total);
  const a = actorOf(p);
  if (res.outcome === "critical" && a?.type === "chevalier" && key.startsWith("skill.")) await a.markExperience(key);
  return { ...res, value, die: r.total };
}

async function rollF(ctx, formula) {
  const r = await new Roll(String(formula).replace(/D/g, "d")).evaluate();
  ctx.rolls.push(r);
  return r.total;
}

const nameOf = (p) => actorOf(p)?.name ?? "?";
const maxRounds = (sys) => (sys.mode === "hunt" ? (C().seasonRounds[sys.season] ?? 8) : 0);
const active = (p) => !p.out && !p.escaped;

/** Chute : l'armure ne protège pas (sauf l'armure de vertu). */
async function fall(ctx, p, formula, lines, { horse = false } = {}) {
  const a = actorOf(p);
  if (!a) return;
  const n = await rollF(ctx, formula);
  if (horse) {
    const h = a.type === "chevalier" ? mountOf(a) : null;
    if (!h) return;
    await h.update({ "system.health.hp.value": (Number(h.system.health.hp.value) || 0) - n });
    lines.push(F("PDVF.Hunt.Line.HorseHurt", { horse: h.name, damage: n }));
    return;
  }
  if (a.type === "chevalier" || a.type === "pnj") {
    const out = await receiveDamage(a, { base: n, knockdown: false, source: L("PDVF.Hunt.Fall"), armorValue: combatStats(a).virtueArmor });
    lines.push(...out.lines);
  }
}

/* -------------------------------------------- */
/*  Obstacles (Table 3.9)                        */
/* -------------------------------------------- */

async function obstacle(ctx, sys, members, lines, depth = 0) {
  let total;
  do { total = await rollF(ctx, "2d6"); } while (depth > 0 && total === 11);
  const o = H.obstacleRow(total, C());
  lines.push(F("PDVF.Hunt.Line.Obstacle", { die: total, text: L(`PDVF.Hunt.Obstacle.${o.id}`) }));
  for (const p of members) {
    if (!active(p)) continue;
    if (o.bay) { p.pos = 1; continue; }
    const t = await testOf(ctx, p, o.test);
    const label = o.test.startsWith("horse") ? L(`PDVF.Hunt.Horse.${o.test.split(".")[1]}`) : L(`PDVF.Skill.${o.test.split(".")[1]}`);
    lines.push(F("PDVF.Hunt.Line.Test", { name: nameOf(p), label, value: t.value, die: t.die, outcome: OC(t.outcome) }));
    if (t.success) { if (o.success?.toPrey) { p.pos = 1; lines.push(F("PDVF.Hunt.Line.ToPrey", { name: nameOf(p) })); } continue; }
    const fx = (t.outcome === "fumble" && o.fumble) ? o.fumble : o.fail;
    if (fx.back) p.pos += fx.back;
    if (fx.rider) await fall(ctx, p, fx.rider, lines);
    if (fx.horse) await fall(ctx, p, fx.horse, lines, { horse: true });
    if (fx.again && depth === 0) {
      lines.push(F("PDVF.Hunt.Line.DeadEnd", { name: nameOf(p) }));
      for (let i = 0; i < fx.again; i++) await obstacle(ctx, sys, [p], lines, 1);
    }
  }
}

function checkOut(sys, lines) {
  for (const p of sys.participants) {
    if (!p.out && H.isOut(p.pos, C())) { p.out = true; p.outReason = "behind"; lines.push(F("PDVF.Hunt.Line.Behind", { name: nameOf(p) })); }
  }
}

/** Meneur d'un groupe : la meilleure Chasse parmi les membres encore en course. */
function leaderOf(members) {
  return members.filter(active).reduce((a, b) => (!a || valueOf(b, "skill.hunting") > valueOf(a, "skill.hunting") ? b : a), null);
}

function groups(sys) {
  const g = new Map();
  sys.participants.forEach((p, index) => { p.index = index; if (p.side === "hunter") { if (!g.has(p.group)) g.set(p.group, []); g.get(p.group).push(p); } });
  return g;
}

function clean(sys) {
  for (const p of sys.participants) delete p.index;
}

/** Chasseur qui portera le premier coup : l'hôte ou l'invité d'honneur à l'aboi, sinon le plus glorieux. */
function firstStriker(sys) {
  const at = sys.participants.map((p, i) => ({ p, i })).filter(({ p }) => p.side === "hunter" && active(p) && p.pos <= 1);
  if (!at.length) return null;
  const honored = at.find(({ p }) => p.honored);
  if (honored) return honored.i;
  return at.reduce((a, b) => ((actorOf(b.p)?.system?.gloryTotal ?? 0) > (actorOf(a.p)?.system?.gloryTotal ?? 0) ? b : a)).i;
}

/* -------------------------------------------- */
/*  Actions                                      */
/* -------------------------------------------- */

const ACTIONS = {
  addParticipant: { who: "gm", fn: async ({ sys }, { uuid }) => {
    if (!uuid || sys.participants.some(p => p.uuid === uuid)) return false;
    const a = await fromUuid(uuid);
    if (!["chevalier", "pnj", "cheval"].includes(a?.type)) return false;
    const side = sys.mode === "hunt" ? "hunter" : sys.mode === "race" ? "runner" : (sys.participants.some(p => p.side === "quarry") ? "pursuer" : "quarry");
    sys.participants.push({ uuid, group: 1, side, mounted: a.type === "chevalier" ? !!mountOf(a) : false, pos: 0, out: false, outReason: "", skip: false, escaped: false, honored: false, glory: 0 });
  } },

  removeParticipant: { who: "gm", fn: async ({ sys }, { index }) => { sys.participants.splice(Number(index), 1); } },

  /** Proie tirée d'un PNJ (animal du compendium) : Évitement, Mouvement, PV, armure, Gloire. */
  setPrey: { who: "gm", fn: async ({ sys }, { uuid }) => {
    const a = await fromUuid(uuid);
    if (a?.type !== "pnj") return false;
    const s = a.system;
    const avoid = (s.skills ?? []).find(x => normalizeLabel(x.name).startsWith("evitement"));
    const atk = (s.attacks ?? [])[0];
    const hp = Number(s.derived?.hp) || Number(s.health?.hp?.value) || 20;
    sys.prey = { uuid, name: a.name, img: a.img, avoidance: Number(avoid?.value) || 0, move: Number(s.derived?.move) || 10, hp, hpMax: hp,
      armor: Number(s.armor?.value) || 0, majorWound: Number(s.derived?.majorWound) || Number(s.characteristics?.con?.value) || 10,
      glory: Number(s.gloryReward) || 0, damage: atk?.damage ?? "", attack: Number(atk?.value) || 10, grievous: false, dead: false, killer: "", fleeing: false };
  } },

  /** La levée : Chasse du meneur (position 1 à 4), puis Mouvement de chacun. */
  levee: { who: "gm", fn: async (ctx) => {
    const { sys, hunt } = ctx;
    if (sys.mode !== "hunt" || !sys.prey.uuid) return ui.notifications.warn(L("PDVF.Hunt.Notify.NoPrey")) && false;
    const lines = [];
    const mod = sys.heavyArmor ? C().heavyArmor : 0;
    for (const [g, members] of groups(sys)) {
      const leader = leaderOf(members);
      if (!leader) continue;
      const t = await testOf(ctx, leader, "skill.hunting", mod);
      lines.push(F("PDVF.Hunt.Line.Leader", { group: g, name: nameOf(leader), value: t.value, die: t.die, outcome: OC(t.outcome) }));
      for (const p of members) {
        const m = await testOf(ctx, p, "move");
        p.pos = Math.max(1, H.leveePosition(t.outcome, m.outcome, C()));
        p.out = false; p.escaped = false;
        lines.push(F("PDVF.Hunt.Line.Move", { name: nameOf(p), value: m.value, die: m.die, outcome: OC(m.outcome), pos: p.pos }));
      }
    }
    checkOut(sys, lines);
    clean(sys);
    sys.phase = "pursuit";
    sys.round = 0;
    ctx.log(L("PDVF.Hunt.Levee"));
    ctx.chat.push({ title: L("PDVF.Hunt.Levee"), subtitle: `${hunt.name} — ${sys.prey.name}`, lines });
  } },

  /** Un tour de chasse : Chasse du meneur contre Évitement (Table 3.8), obstacles (Table 3.9). */
  huntRound: { who: "gm", fn: async (ctx) => {
    const { sys, hunt } = ctx;
    if (sys.phase !== "pursuit") return false;
    if (sys.round >= maxRounds(sys)) return ui.notifications.info(L("PDVF.Hunt.Notify.DayOver")) && false;
    sys.round += 1;
    const lines = [];
    const mod = (sys.heavyArmor ? C().heavyArmor : 0) + (Number(sys.bonus) || 0);
    if (sys.bonus) lines.push(F("PDVF.Hunt.Line.Bonus", { bonus: sys.bonus }));
    sys.bonus = 0;
    for (const [g, members] of groups(sys)) {
      const leader = leaderOf(members);
      if (!leader) continue;
      const t = await testOf(ctx, leader, "skill.hunting", mod);
      const pr = await new Roll("1d20").evaluate();
      ctx.rolls.push(pr);
      const prey = resolveTest(sys.prey.avoidance, 0, pr.total);
      const row = H.pursuitRow(t, prey, C());
      lines.push(F("PDVF.Hunt.Line.Pursuit", { group: g, name: nameOf(leader), value: t.value, die: t.die, outcome: OC(t.outcome),
        prey: sys.prey.name, avoid: sys.prey.avoidance, pdie: pr.total, poutcome: OC(prey.outcome), result: L(`PDVF.Hunt.Row.${row.id}`) }));
      for (const p of members) if (active(p)) p.pos = Math.max(1, p.pos + row.shift);
      if (row.obstacle) await obstacle(ctx, sys, members, lines);
      for (const p of members) if (active(p)) p.pos = Math.max(1, p.pos);
    }
    checkOut(sys, lines);
    const first = firstStriker(sys);
    clean(sys);
    if (first !== null) {
      sys.phase = "bay";
      sys.first = { index: first, done: false, outcome: "" };
      lines.push(F("PDVF.Hunt.Line.Bay", { prey: sys.prey.name, name: nameOf(sys.participants[first]) }));
    } else if (sys.round >= maxRounds(sys)) {
      sys.phase = "over";
      lines.push(L("PDVF.Hunt.Line.DayOver"));
    } else if (!sys.participants.some(p => p.side === "hunter" && active(p))) {
      sys.phase = "over";
      lines.push(L("PDVF.Hunt.Line.AllBehind"));
    }
    ctx.log(F("PDVF.Hunt.RoundTitle", { round: sys.round, rounds: maxRounds(sys) }));
    ctx.chat.push({ title: F("PDVF.Hunt.RoundTitle", { round: sys.round, rounds: maxRounds(sys) }), subtitle: `${hunt.name} — ${sys.prey.name}`, lines });
  } },

  /** Le MJ choisit qui porte le premier coup. */
  setFirst: { who: "gm", fn: async ({ sys }, { index }) => {
    if (sys.phase !== "bay") return false;
    sys.first.index = Number(index);
  } },

  /** Attaquants de la ruée (trois au plus). */
  setRush: { who: "gm", fn: async ({ sys }, { indexes = [] }) => {
    if (sys.phase !== "rush") return false;
    sys.rush.attackers = indexes.map(Number).filter(i => sys.participants[i] && active(sys.participants[i])).slice(0, C().rushMax);
    sys.rush.done = [];
    sys.rush.escapes = 0;
  } },

  /** Un coup porté à la proie (premier coup à l'aboi, ou ruée), lancé chez le joueur (Table 3.10). */
  strike: { who: "player", fn: async (ctx, { index, result, formula = "", weapon = "" }) => {
    const { sys, hunt } = ctx;
    const i = Number(index);
    const p = sys.participants[i];
    if (!p || !active(p) || sys.prey.dead) return false;
    const rush = sys.phase === "rush";
    if (sys.phase === "bay" && (sys.first.index !== i || sys.first.done)) return false;
    if (rush && (!sys.rush.attackers.includes(i) || sys.rush.done.includes(i))) return false;
    if (!["bay", "rush"].includes(sys.phase)) return false;
    const avoid = rush ? H.rushAvoidance(sys.prey.avoidance, sys.rush.attackers.length, C()) : sys.prey.avoidance;
    const pr = await new Roll("1d20").evaluate();
    ctx.rolls.push(pr);
    const prey = resolveTest(avoid, 0, pr.total);
    const row = H.strikeRow(result, prey, C());
    const lines = [F("PDVF.Hunt.Line.Strike", { name: nameOf(p), weapon, die: result.die, outcome: OC(result.outcome), prey: sys.prey.name, avoid, pdie: pr.total, poutcome: OC(prey.outcome), result: L(`PDVF.Hunt.Strike.${row.id}`) })];
    if (row.hit && formula) {
      const f = row.extraDice ? addDice(formula, row.extraDice) : formula;
      const rolled = await rollF(ctx, f);
      const hit = H.preyHit(sys.prey, rolled);
      sys.prey.hp = hit.hp;
      sys.prey.grievous = hit.grievous;
      lines.push(F("PDVF.Hunt.Line.Damage", { formula: f, rolled, armor: sys.prey.armor, damage: hit.damage, hp: Math.max(0, hit.hp), max: sys.prey.hpMax }));
      if (hit.dead) await kill(ctx, i, lines);
      else if (hit.grievous) lines.push(F("PDVF.Hunt.Line.Grievous", { prey: sys.prey.name }));
    }
    if (row.fall) await fall(ctx, p, row.fall, lines);
    if (rush) { sys.rush.done.push(i); if (row.escape) sys.rush.escapes = (Number(sys.rush.escapes) || 0) + 1; }
    else { sys.first.done = true; sys.first.outcome = row.id; }
    if (!sys.prey.dead) {
      if (!rush) {
        if (row.escape) escape(sys, row.bonus, lines);
        else if (sys.prey.grievous) {
          // Grièvement blessée, la proie cherche à fuir : la ruée se joue contre son Évitement.
          sys.phase = "rush"; sys.prey.fleeing = true; sys.rush = { attackers: [], done: [], escapes: 0 };
          lines.push(L("PDVF.Hunt.Line.RushFlee"));
        } else { sys.phase = "combat"; sys.prey.fleeing = false; lines.push(F("PDVF.Hunt.Line.RushFight", { prey: sys.prey.name })); }
      } else if (sys.rush.done.length >= sys.rush.attackers.length) {
        // Après la ruée : la proie qui a esquivé tous les coups reprend la fuite ; sinon, combat ordinaire.
        if ((Number(sys.rush.escapes) || 0) >= sys.rush.attackers.length) escape(sys, row.bonus, lines);
        else { sys.phase = "combat"; lines.push(F("PDVF.Hunt.Line.Combat", { prey: sys.prey.name })); }
      }
    }
    ctx.chat.push({ title: L(rush ? "PDVF.Hunt.Rush" : "PDVF.Hunt.FirstStrike"), subtitle: `${hunt.name} — ${sys.prey.name}`, lines });
  } },

  /** Fin d'un combat ordinaire : proie tuée (par qui) ou échappée. */
  endCombat: { who: "gm", fn: async (ctx, { result, killer }) => {
    const { sys, hunt } = ctx;
    if (sys.prey.dead) return false;
    const lines = [];
    if (result === "killed") await kill(ctx, Number(killer), lines);
    else escape(sys, false, lines);
    ctx.chat.push({ title: L("PDVF.Hunt.Title"), subtitle: `${hunt.name} — ${sys.prey.name}`, lines });
  } },

  /** Course ou poursuite : un tour de tests de Mouvement. */
  chaseRound: { who: "gm", fn: async (ctx) => {
    const { sys, hunt } = ctx;
    if (sys.mode === "hunt" || sys.phase === "over") return false;
    if (sys.caught.length) return ui.notifications.warn(L("PDVF.Hunt.Notify.Caught")) && false;
    sys.round += 1;
    sys.phase = "running";
    const lines = [];
    for (const p of sys.participants) {
      if (!active(p)) continue;
      if (p.skip) { p.skip = false; lines.push(F("PDVF.Hunt.Line.Skip", { name: nameOf(p) })); continue; }
      const t = await testOf(ctx, p, "move");
      const step = H.chaseStep(t.outcome, C().chase);
      p.pos += step.advance;
      let extra = "";
      if (step.check) {
        const key = p.mounted && actorOf(p)?.type === "chevalier" ? "skill.horsemanship" : "char.dex";
        const c = await testOf(ctx, p, key);
        if (c.success) { p.skip = true; extra = F("PDVF.Hunt.Line.Slowed", { die: c.die }); }
        else { p.out = true; p.outReason = "hurt"; extra = F("PDVF.Hunt.Line.Winded", { die: c.die }); }
      }
      lines.push(F("PDVF.Hunt.Line.ChaseMove", { name: nameOf(p), value: t.value, die: t.die, outcome: OC(t.outcome), pos: p.pos, lines: sys.lines }) + (extra ? ` ${extra}` : ""));
    }
    if (sys.mode === "race") {
      const runners = sys.participants.map((p, index) => ({ ...p, index }));
      let win = H.raceFinishers(runners, sys.lines);
      if (win.length > 1) {
        lines.push(L("PDVF.Hunt.Line.Tie"));
        const scored = [];
        for (const w of win) {
          const p = sys.participants[w.index];
          const key = p.mounted && actorOf(p)?.type === "chevalier" ? "skill.horsemanship" : "char.dex";
          const t = await testOf(ctx, p, key);
          scored.push({ index: w.index, res: t });
          lines.push(F("PDVF.Hunt.Line.TieRoll", { name: nameOf(p), die: t.die, outcome: OC(t.outcome) }));
        }
        const score = (r) => (r.outcome === "critical" ? 100 : r.success ? r.adjusted ?? r.die : -1);
        const best = Math.max(...scored.map(s => score(s.res)));
        win = scored.filter(s => score(s.res) === best).map(s => ({ index: s.index }));
      }
      if (win.length) {
        sys.winners = win.map(w => w.index);
        sys.phase = "over";
        lines.push(F("PDVF.Hunt.Line.Winner", { names: win.map(w => nameOf(sys.participants[w.index])).join(", ") }));
      }
    } else {
      const parts = sys.participants.map((p, index) => ({ ...p, index }));
      sys.caught = H.caught(parts);
      for (const c of sys.caught) lines.push(F("PDVF.Hunt.Line.Caught", { pursuer: nameOf(sys.participants[c.pursuer]), quarry: nameOf(sys.participants[c.quarry]) }));
      for (const q of sys.participants) {
        if (q.side !== "quarry" || !active(q) || q.pos < sys.lines) continue;
        if (sys.caught.some(c => sys.participants[c.quarry] === q)) continue;
        q.escaped = true;
        lines.push(F("PDVF.Hunt.Line.Escaped", { name: nameOf(q) }));
      }
      if (!sys.participants.some(p => p.side === "quarry" && active(p))) sys.phase = "over";
    }
    ctx.chat.push({ title: F("PDVF.Hunt.ChaseTitle", { round: sys.round }), subtitle: hunt.name, lines });
  } },

  /** Poursuivant et poursuivi sur la même ligne : test opposé selon l'intention (valeurs choisies par le MJ). */
  opposed: { who: "gm", fn: async (ctx, { pair, qKey, pKey }) => {
    const { sys, hunt } = ctx;
    const c = sys.caught[Number(pair)];
    if (!c) return false;
    const q = sys.participants[c.quarry];
    const pu = sys.participants[c.pursuer];
    const qt = await testOf(ctx, q, qKey);
    const pt = await testOf(ctx, pu, pKey);
    const cmp = compareOpposed(qt, pt);
    const lines = [F("PDVF.Hunt.Line.Opposed", { quarry: nameOf(q), ql: L(`PDVF.Hunt.Key.${qKey}`), qd: qt.die, qo: OC(qt.outcome), pursuer: nameOf(pu), pl: L(`PDVF.Hunt.Key.${pKey}`), pd: pt.die, po: OC(pt.outcome) })];
    if (cmp.winner === "a") { q.pos += 1; lines.push(F("PDVF.Hunt.Line.Shaken", { name: nameOf(q) })); }
    else if (cmp.winner === "b") { q.out = true; q.outReason = "cornered"; lines.push(F("PDVF.Hunt.Line.Cornered", { name: nameOf(q) })); }
    else lines.push(L("PDVF.Hunt.Line.NoWinner"));
    sys.caught.splice(Number(pair), 1);
    if (!sys.participants.some(p => p.side === "quarry" && active(p))) sys.phase = "over";
    ctx.chat.push({ title: L("PDVF.Hunt.Caught"), subtitle: hunt.name, lines });
  } },

  /** Recommencer (nouvelle journée de chasse, ou nouvelle course). */
  reset: { who: "gm", fn: async ({ sys }) => {
    sys.round = 0; sys.phase = "setup"; sys.bonus = 0; sys.winners = []; sys.caught = [];
    sys.first = { index: null, done: false, outcome: "" }; sys.rush = { attackers: [], done: [], escapes: 0 };
    if (!sys.prey.dead) { sys.prey.grievous = false; sys.prey.fleeing = false; }
    for (const p of sys.participants) Object.assign(p, { pos: 0, out: false, outReason: "", skip: false, escaped: false });
  } }
};

/** La proie s'échappe : retour à la poursuite, les chasseurs de l'aboi en 4e position. */
function escape(sys, bonus, lines) {
  for (const p of sys.participants) if (p.side === "hunter" && active(p) && p.pos <= 1) p.pos = C().positions;
  sys.bonus = bonus ? C().partialBonus : 0;
  sys.phase = sys.round >= maxRounds(sys) ? "over" : "pursuit";
  sys.rush = { attackers: [], done: [], escapes: 0 };
  sys.first = { index: null, done: false, outcome: "" };
  lines.push(F(bonus ? "PDVF.Hunt.Line.EscapeBonus" : "PDVF.Hunt.Line.Escape", { prey: sys.prey.name, bonus: C().partialBonus }));
}

/** La proie est tuée : la Gloire de la bête va au chasseur qui l'abat (Gloire de session). */
async function kill(ctx, index, lines) {
  const { sys } = ctx;
  const p = sys.participants[index];
  sys.prey.dead = true;
  sys.prey.hp = Math.min(0, sys.prey.hp);
  sys.phase = "over";
  const a = actorOf(p);
  sys.prey.killer = a?.name ?? "";
  lines.push(F("PDVF.Hunt.Line.Killed", { prey: sys.prey.name, name: a?.name ?? "?" }));
  if (a?.type === "chevalier" && sys.prey.glory) {
    await a.update({ "system.glory.session": (Number(a.system.glory?.session) || 0) + sys.prey.glory });
    p.glory = (Number(p.glory) || 0) + sys.prey.glory;
    lines.push(F("PDVF.Hunt.Line.Glory", { name: a.name, glory: sys.prey.glory }));
  }
}
