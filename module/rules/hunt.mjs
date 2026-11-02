/**
 * Chasse, course et poursuite (Livre du maître, chap. 3, p. 45–49). Module pur, testable sans Foundry.
 */
import { abridgedRow } from "./tournament.mjs";

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Position après la levée : test de Chasse du meneur, puis décalage du test de Mouvement de chacun. */
export function leveePosition(leaderOutcome, moveOutcome, cfg) {
  const base = cfg.levee[leaderOutcome] ?? 3;
  return base + (cfg.move[moveOutcome] ?? 0);
}

/** Hors de la chasse au-delà de la 4e position. */
export function isOut(pos, cfg) {
  return pos > cfg.positions;
}

/** Ligne de la Table 3.8 : Chasse du meneur contre Évitement de la proie (deux échecs : égalité). */
export function pursuitRow(leader, prey, cfg) {
  const row = abridgedRow(leader, prey);
  return { id: row, ...cfg.pursuit[row] };
}

/** Nouvelle position (jamais devant la proie). */
export function shiftPosition(pos, shift) {
  return Math.max(1, (Number(pos) || 1) + (Number(shift) || 0));
}

/** Ligne de la Table 3.9 (2D6). */
export function obstacleRow(total, cfg) {
  return cfg.obstacles.find(o => total >= o.min && total <= o.max) ?? cfg.obstacles[0];
}

/** Ligne de la Table 3.10 : coup du chasseur contre l'Évitement de la proie. */
export function strikeRow(attack, prey, cfg) {
  const r = abridgedRow(attack, prey);
  const id = { critical: "critical", winner: "success", partial: "partial", tie: "partial", loser: "failure", fumble: "fumble" }[r];
  return { id, ...cfg.strike[id] };
}

/** Évitement de la proie pendant la ruée : −5 par attaquant au-delà du premier. */
export function rushAvoidance(avoidance, attackers, cfg) {
  return (Number(avoidance) || 0) + cfg.multiPenalty * Math.max(0, (Number(attackers) || 1) - 1);
}

/** Dégâts subis par la proie : dégâts − armure ; grièvement blessée si un coup atteint sa Blessure majeure. */
export function preyHit(prey, rolled) {
  const dmg = Math.max(0, (Number(rolled) || 0) - (Number(prey.armor) || 0));
  const hp = (Number(prey.hp) || 0) - dmg;
  return { damage: dmg, hp, dead: hp <= 0, grievous: dmg >= (Number(prey.majorWound) || 999) || !!prey.grievous };
}

/** Course ou poursuite : lignes avancées d'après le test de Mouvement (échec critique : test de DEX). */
export function chaseStep(outcome, cfg) {
  if (outcome === "critical") return { advance: cfg.critical, check: false };
  if (outcome === "success") return { advance: cfg.success, check: false };
  return { advance: 0, check: outcome === "fumble" };
}

/** Gagnants d'une course : ceux qui ont franchi la dernière ligne, le plus loin d'abord. */
export function raceFinishers(runners, lines) {
  const done = runners.filter(r => !r.out && r.pos >= lines);
  if (!done.length) return [];
  const best = Math.max(...done.map(r => r.pos));
  return done.filter(r => r.pos === best);
}

/** Poursuite : poursuivants sur la ligne d'un poursuivi à la fin d'un tour. */
export function caught(participants) {
  const out = [];
  for (const q of participants.filter(p => p.side === "quarry" && !p.out && !p.escaped)) {
    for (const p of participants.filter(x => x.side === "pursuer" && !x.out)) if (p.pos === q.pos) out.push({ quarry: q.index, pursuer: p.index });
  }
  return out;
}

export { clamp };
