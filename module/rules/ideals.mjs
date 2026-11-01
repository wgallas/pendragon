/**
 * Idéaux (Livre du joueur, chap. 6, p. 126–128) et Table Ronde (p. 128–129).
 * Module pur : aucune dépendance à Foundry. Les définitions sont des données (PDVF.ideals,
 * PDVF.religions[…].religiousBonus, PDVF.roundTable) ; ce module dit seulement si un chevalier
 * remplit les conditions, ce qui lui manque, et ce que les idéaux atteints lui apportent.
 */
import { traitPair } from "./resolution.mjs";

/** Libellé sans accents ni casse (« Dévotion (Dieu) » → « devotion (dieu) »). */
export function normalize(s) {
  return String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
}

/** Le nom commence-t-il par le motif, suivi d'une fin de mot ? (« rang » ≠ « rancune ») */
export function matchesName(name, match) {
  const n = normalize(name);
  const m = normalize(match);
  if (!m || !n.startsWith(m)) return false;
  return n.length === m.length || /[\s(,:–-]/.test(n[m.length]);
}

/** Meilleure passion d'un chevalier qui répond au motif (« honor » : l'Honneur). */
export function bestPassion(sys, match) {
  if (normalize(match) === "honor") return { name: "Honneur", value: Number(sys.honor?.value) || 0 };
  let best = null;
  for (const p of sys.passions ?? []) {
    if (!matchesName(p.name, match)) continue;
    const v = Number(p.value) || 0;
    if (!best || v > best.value) best = { name: p.name, value: v };
  }
  return best;
}

/** Valeur d'un trait « id.côté » du chevalier. */
export function traitValue(sys, key) {
  const [id, side] = String(key).split(".");
  const t = sys.traits?.[id];
  if (!t) return 0;
  return traitPair(t.value)[side] ?? 0;
}

/**
 * Meilleur modificateur positif d'un trait dirigé portant le nom du trait (« Croyant (dame Ellen) +4 »).
 * @param {object} sys
 * @param {string} key          « spiritual.left »
 * @param {(id:string, side:string) => string} [traitLabel]  libellé traduit du trait
 */
export function directedBonus(sys, key, traitLabel) {
  if (typeof traitLabel !== "function") return { value: 0, name: "" };
  const [id, side] = String(key).split(".");
  const label = traitLabel(id, side);
  let best = { value: 0, name: "" };
  for (const d of sys.directedTraits ?? []) {
    const v = Number(d.value) || 0;
    if (v > best.value && matchesName(d.name, label)) best = { value: v, name: d.name };
  }
  return best;
}

/**
 * État de chaque idéal pour un chevalier.
 * @param {object} sys  données du chevalier (system)
 * @param {object} cfg
 * @param {object} cfg.ideals     PDVF.ideals
 * @param {object} cfg.religions  PDVF.religions
 * @param {Function} [cfg.traitLabel]  (id, côté) → libellé, pour les traits dirigés
 * @returns {{id:string, enabled:boolean, revoked:boolean, met:boolean, reached:boolean,
 *   checks:object[], effects:object, glory:number, def:object}[]}
 *   reached : conditions remplies ; met : bénéfices acquis (remplies et non retirées par le MJ).
 */
export function idealsStatus(sys, { ideals = {}, religions = {}, traitLabel } = {}) {
  const gm = sys.idealGM ?? {};
  const revokedIds = new Set(gm.revoked ?? []);
  const religionId = sys.biography?.religion;
  const religion = religions[religionId] ?? null;
  const out = [];
  for (const [id, def] of Object.entries(ideals)) {
    const enabled = !def.gmOnly || !!gm.wicked;
    const checks = [];
    if (def.traits?.length) {
      const parts = def.traits.map(key => {
        const base = traitValue(sys, key);
        const dir = (def.directed ?? []).includes(key) ? directedBonus(sys, key, traitLabel) : { value: 0, name: "" };
        return { key, value: base + dir.value, base, directed: dir.value, directedName: dir.name };
      });
      const value = parts.reduce((s, p) => s + p.value, 0);
      checks.push({ kind: "traits", parts, value, min: def.total, ok: value >= def.total });
    }
    if (def.virtues) {
      const virtues = religion?.virtues ?? [];
      if (!virtues.length) checks.push({ kind: "religion", value: 0, min: 1, ok: false });
      for (const key of virtues) {
        const value = traitValue(sys, key);
        checks.push({ kind: "virtue", key, value, min: def.virtues, ok: value >= def.virtues });
      }
    }
    for (const p of def.passions ?? []) {
      const best = bestPassion(sys, p.match);
      const value = best?.value ?? 0;
      checks.push({ kind: "passion", match: p.match, label: p.label ?? p.match, name: best?.name ?? "", value, min: p.min, ok: !!best && value >= p.min });
    }
    for (const s of def.skills ?? []) {
      const value = Number(sys.skills?.[s.id]?.value) || 0;
      checks.push({ kind: "skill", id: s.id, value, min: s.min, ok: value >= s.min });
    }
    const reached = enabled && checks.length > 0 && checks.every(c => c.ok);
    const revoked = revokedIds.has(id);
    const met = reached && !revoked;
    const effects = { ...(def.effects ?? {}) };
    if (def.religion && religion?.religiousBonus) {
      for (const [k, v] of Object.entries(religion.religiousBonus)) effects[k] = (effects[k] ?? 0) + v;
    }
    out.push({ id, def, enabled, revoked, reached, met, checks, effects, glory: Number(def.glory) || 0 });
  }
  return out;
}

/** Effets cumulés des idéaux atteints : { hp, healRate, move, damageDice, armor, glory, met: [ids] }. */
export function idealsEffects(status = []) {
  const total = { hp: 0, healRate: 0, move: 0, damageDice: 0, armor: 0, glory: 0, met: [] };
  for (const s of status) {
    if (!s.met) continue;
    total.met.push(s.id);
    total.glory += s.glory;
    for (const [k, v] of Object.entries(s.effects ?? {})) {
      if (k in total && typeof total[k] === "number") total[k] += Number(v) || 0;
    }
  }
  return total;
}

/**
 * Idéal qui réserve l'invocation d'une passion (Chevalerie : Courtois ; Dévotion : Religieux),
 * ou null si la passion est toujours invocable.
 */
export function invokeRequirement(passionName, ideals = {}) {
  for (const [id, def] of Object.entries(ideals)) {
    if (def.invoke && matchesName(passionName, def.invoke)) return id;
  }
  return null;
}

/** Idéaux gagnés et perdus entre deux états (listes d'identifiants d'idéaux atteints). */
export function idealsChange(before = [], after = []) {
  const b = new Set(before);
  const a = new Set(after);
  return { gained: [...a].filter(id => !b.has(id)), lost: [...b].filter(id => !a.has(id)) };
}

/**
 * Candidature à la Table Ronde : passions conseillées et Gloire (8000 ou idéal Courtois).
 * @param {object} sys
 * @param {object} rt          PDVF.roundTable
 * @param {object} ctx
 * @param {number} ctx.glory   Gloire totale
 * @param {boolean} ctx.courteous  idéal Courtois atteint
 */
export function roundTableCandidacy(sys, rt, { glory = 0, courteous = false } = {}) {
  const checks = (rt.passions ?? []).map(p => {
    const best = bestPassion(sys, p.match);
    const value = best?.value ?? 0;
    return { label: p.label, name: best?.name ?? "", value, min: p.min, ok: !!best && value >= p.min };
  });
  const renowned = glory >= (rt.gloryHint ?? 8000);
  return { checks, renowned, courteous, noticed: renowned || courteous, passionsOk: checks.every(c => c.ok) };
}
