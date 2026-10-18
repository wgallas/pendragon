/**
 * États de combat portés par les jetons (effets d'état de Foundry) : à cheval, désarmé,
 * plus les états du cœur de Foundry (au sol, inconscient, mort).
 */
import { SYSTEM_ID } from "../config.mjs";

export const STATUS = {
  mounted: "pdvf-mounted",
  disarmed: "pdvf-disarmed",
  prone: "prone",
  unconscious: "unconscious",
  dead: "dead"
};

/** Ajoute les états du système à la liste de Foundry (hook « init »). */
export function registerStatuses() {
  const list = CONFIG.statusEffects;
  const add = (id, name, img) => { if (!list.some(e => e.id === id)) list.push({ id, name, img }); };
  add(STATUS.mounted, "PDVF.Status.mounted", `systems/${SYSTEM_ID}/icons/status/mounted.svg`);
  add(STATUS.disarmed, "PDVF.Status.disarmed", `systems/${SYSTEM_ID}/icons/status/disarmed.svg`);
}

export function hasStatus(actor, id) {
  return !!actor?.statuses?.has?.(id);
}

/** Met un état à la valeur voulue ; renvoie true s'il a changé. */
export async function setStatus(actor, id, active) {
  if (!actor || hasStatus(actor, id) === !!active) return false;
  if (typeof actor.toggleStatusEffect !== "function") return false;
  // La mort se pose en grand sur le jeton (tête de mort de Foundry).
  await actor.toggleStatusEffect(id, { active: !!active, overlay: id === STATUS.dead && !!active });
  return true;
}
