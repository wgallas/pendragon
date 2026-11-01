/**
 * Idéaux et Table Ronde côté documents : test de protection contre la magie, idéal retiré par le MJ,
 * admission à la Table Ronde, et suivi des idéaux gagnés ou perdus (PV du chevalier chrétien).
 */
import { PDVF, SYSTEM_ID } from "../config.mjs";
import { bestPassion, idealsChange } from "../rules/ideals.mjs";
import { rollPlain } from "../dice/tests.mjs";

const { DialogV2 } = foundry.applications.api;
const L = (k) => game.i18n.localize(k);
const F = (k, d) => game.i18n.format(k, d);

/** Nom traduit d'un idéal. */
export function idealName(id) {
  return L(`PDVF.Ideal.${id}.name`);
}

/**
 * Protection contre la magie et les miracles (Livre du joueur, p. 127–128 ; Livre du maître, p. 113–114) :
 * test de la passion de l'idéal ; un succès ou un critique donne l'immunité.
 */
export async function protectionTest(actor, id) {
  const def = PDVF.ideals[id];
  const status = actor.system.idealsStatus?.find(s => s.id === id);
  if (!def?.protection || !status?.met) return;
  const passion = bestPassion(actor.system, def.protection);
  if (!passion) return ui.notifications.warn(F("PDVF.Ideal.NoPassion", { ideal: idealName(id) }));
  return rollPlain({
    actor, name: actor.name, label: passion.name, value: passion.value,
    title: L("PDVF.Ideal.ProtectionTitle"), subtitle: idealName(id),
    notes: [L(`PDVF.Ideal.${id}.protectionNote`)],
    verdict: (outcome) => ["critical", "success"].includes(outcome)
      ? { text: L("PDVF.Ideal.Immune"), cls: "victory" }
      : { text: L("PDVF.Ideal.NotImmune"), cls: "defeat" }
  });
}

/** Le MJ retire un idéal (Code de la Chevalerie enfreint…) ou le rend. */
export async function toggleRevoked(actor, id) {
  if (!game.user.isGM) return ui.notifications.warn(L("PDVF.Ideal.GMOnly"));
  const revoked = new Set(actor.system.idealGM?.revoked ?? []);
  if (revoked.has(id)) revoked.delete(id); else revoked.add(id);
  return actor.update({ "system.idealGM.revoked": [...revoked] });
}

/**
 * Admission à la Table Ronde (Livre du joueur, p. 128) : année du siège, +5 Honneur,
 * 1000 points de Gloire inscrits dans la chronique.
 */
export async function admitRoundTable(actor) {
  if (!game.user.isGM) return ui.notifications.warn(L("PDVF.Ideal.GMOnly"));
  if (actor.system.dates?.roundTable) return;
  const rt = PDVF.roundTable;
  const year = Number(game.settings.get(SYSTEM_ID, "currentYear")) || null;
  const ok = await DialogV2.confirm({
    window: { title: L("PDVF.RoundTable.Admit") }, classes: [SYSTEM_ID, "pdvf-dialog"],
    content: `<p>${F("PDVF.RoundTable.AdmitConfirm", { name: actor.name, year, honor: rt.honor, glory: rt.glory })}</p>`,
    rejectClose: false
  });
  if (!ok) return;
  const chronicle = foundry.utils.deepClone(actor._source.system.chronicle);
  chronicle.push({ year, event: L("PDVF.RoundTable.ChronicleEvent"), living: "", glory: rt.glory });
  await actor.update({
    "system.dates.roundTable": year,
    "system.honor.value": (Number(actor.system.honor.value) || 0) + rt.honor,
    "system.chronicle": chronicle
  });
  const content = await foundry.applications.handlebars.renderTemplate(`systems/${SYSTEM_ID}/templates/chat/battle-card.hbs`, {
    title: L("PDVF.RoundTable.Admit"), subtitle: String(year ?? ""),
    lines: [F("PDVF.RoundTable.AdmitDone", { name: actor.name, honor: rt.honor, glory: rt.glory })], buttons: []
  });
  await ChatMessage.implementation.create({ speaker: ChatMessage.getSpeaker({ actor }), content });
}

/* -------------------------------------------- */
/*  Idéaux gagnés et perdus                      */
/* -------------------------------------------- */

/** État à noter avant une mise à jour du chevalier (appelé par l'acteur). */
export function idealsSnapshot(actor) {
  return { met: [...(actor.system.idealEffects?.met ?? [])], hpMax: Number(actor.system.health?.hp?.max) || 0 };
}

/**
 * Après une mise à jour faite par cet utilisateur : signale les idéaux gagnés ou perdus, et suit
 * les PV quand l'idéal change le total (le chevalier Religieux chrétien gagne 4 PV, ou les perd).
 * @param {Actor} actor
 * @param {{met:string[], hpMax:number}} before
 * @param {object} changed  données de la mise à jour (on ne touche pas aux PV si elle les fixait)
 */
export async function afterIdealsUpdate(actor, before, changed) {
  if (!before || actor.type !== "chevalier") return;
  const { gained, lost } = idealsChange(before.met, actor.system.idealEffects?.met ?? []);
  if (!gained.length && !lost.length) return;
  for (const id of gained) ui.notifications.info(F("PDVF.Ideal.Gained", { name: actor.name, ideal: idealName(id) }));
  for (const id of lost) ui.notifications.warn(F("PDVF.Ideal.Lost", { name: actor.name, ideal: idealName(id) }));
  const hpMax = Number(actor.system.health.hp.max) || 0;
  const delta = hpMax - before.hpMax;
  const hpSet = foundry.utils.hasProperty(changed, "system.health.hp.value") || foundry.utils.hasProperty(changed, "system.health");
  if (!delta || hpSet) return;
  const hp = Number(actor.system.health.hp.value) || 0;
  // Gagnés : les PV montent d'autant. Perdus : ils ne dépassent pas le nouveau total.
  const next = delta > 0 ? hp + delta : Math.min(hp, hpMax);
  if (next !== hp) await actor.update({ "system.health.hp.value": next });
}

/**
 * Compagnons du roi Arthur (The Boy King, p. 147) : serment prêté à la Pentecôte, 100 points de Gloire une fois.
 */
export async function admitCompanions(actor) {
  if (!game.user.isGM) return ui.notifications.warn(L("PDVF.Ideal.GMOnly"));
  if (actor.system.dates?.companions) return;
  const cfg = PDVF.companions;
  const year = Number(game.settings.get(SYSTEM_ID, "currentYear")) || null;
  const ok = await DialogV2.confirm({
    window: { title: L("PDVF.Companions.Admit") }, classes: [SYSTEM_ID, "pdvf-dialog"],
    content: `<p>${F("PDVF.Companions.AdmitConfirm", { name: actor.name, year, glory: cfg.glory })}</p>`, rejectClose: false
  });
  if (!ok) return;
  const chronicle = foundry.utils.deepClone(actor._source.system.chronicle);
  chronicle.push({ year, event: L("PDVF.Companions.ChronicleEvent"), living: "", glory: cfg.glory });
  await actor.update({ "system.dates.companions": year, "system.chronicle": chronicle });
  const content = await foundry.applications.handlebars.renderTemplate(`systems/${SYSTEM_ID}/templates/chat/battle-card.hbs`, {
    title: L("PDVF.Companions.Title"), subtitle: String(year ?? ""), lines: [F("PDVF.Companions.AdmitDone", { name: actor.name, glory: cfg.glory })], buttons: []
  });
  await ChatMessage.implementation.create({ speaker: ChatMessage.getSpeaker({ actor }), content });
}
