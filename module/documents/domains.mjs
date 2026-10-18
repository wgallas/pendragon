/**
 * Domaines tenus par un chevalier : rang et Gloire du titre, transmission, aide du seigneur, faveurs.
 */
import { PDVF, SYSTEM_ID } from "../config.mjs";
import * as R from "../rules/domains.mjs";

const L = (k) => game.i18n.localize(k);
const F = (k, d) => game.i18n.format(k, d);

export function domainsOf(actor) {
  return actor?.items?.filter?.(i => i.type === "domaine") ?? [];
}

/** Gloire passive des domaines (Table A.2). */
export function domainGlory(actor) {
  return R.totalPassive(domainsOf(actor).map(d => d.system));
}

/** Revenu annuel des domaines (£). */
export function domainIncome(actor) {
  return R.totalIncome(domainsOf(actor).map(d => d.system));
}

/** Données d'un nouveau domaine d'un rang donné (valeurs typiques de la Table A.2). */
export function newDomainData(rank = "vassal", name = null) {
  const info = R.rankInfo(rank, PDVF.domainRanks);
  return {
    name: name ?? L("PDVF.Domain.NewName"), type: "domaine", img: `systems/${SYSTEM_ID}/icons/gear/domain.svg`,
    system: { rank, income: info.income, passiveGlory: info.passive, since: Number(game.settings.get(SYSTEM_ID, "currentYear")) || null }
  };
}

/**
 * Un chevalier reçoit (ou voit monter) un domaine : il prend la classe du rang (sans jamais
 * descendre) et la Gloire du titre, une seule fois par titre, est inscrite dans la chronique.
 */
export async function applyDomainRank(actor, domain) {
  if (actor?.type !== "chevalier" || domain?.type !== "domaine") return null;
  const titles = actor.getFlag(SYSTEM_ID, "titles") ?? [];
  const ch = R.rankChange({ rank: domain.system.rank, currentClass: actor.system.biography.knightClass, titles }, PDVF);
  const update = {};
  const lines = [];
  if (ch.knightClass) {
    update["system.biography.knightClass"] = ch.knightClass;
    lines.push(F("PDVF.Domain.ClassChanged", { name: actor.name, klass: L(`PDVF.Class.${ch.knightClass}`) }));
  }
  if (domain.system.lord && !actor.system.biography.lord) update["system.biography.lord"] = domain.system.lord;
  if (ch.title) {
    const year = Number(game.settings.get(SYSTEM_ID, "currentYear")) || null;
    const chronicle = foundry.utils.deepClone(actor._source.system.chronicle ?? []);
    chronicle.push({ year, event: F("PDVF.Domain.TitleEvent", { title: L(`PDVF.Domain.Title.${ch.title}`), domain: domain.name }), living: "", glory: ch.glory });
    update["system.chronicle"] = chronicle;
    update[`flags.${SYSTEM_ID}.titles`] = [...titles, ch.title];
    lines.push(F("PDVF.Domain.TitleGlory", { title: L(`PDVF.Domain.Title.${ch.title}`), glory: ch.glory }));
  }
  if (!Object.keys(update).length) return null;
  await actor.update(update);
  if (lines.length) {
    await ChatMessage.implementation.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="pdvf-card"><header class="pdvf-card-header"><h3 class="pdvf-card-title">${F("PDVF.Domain.GainedTitle", { name: actor.name, domain: domain.name })}</h3></header><ul class="pdvf-card-notes">${lines.map(l => `<li>${l}</li>`).join("")}</ul></div>`
    });
  }
  return ch;
}

/** Hooks : création ou changement de rang d'un domaine sur la fiche d'un chevalier. */
export function onDomainCreated(item, options, userId) {
  if (userId !== game.user.id || item.type !== "domaine" || item.parent?.type !== "chevalier") return;
  applyDomainRank(item.parent, item);
}
export function onDomainUpdated(item, changes, options, userId) {
  if (userId !== game.user.id || item.type !== "domaine" || item.parent?.type !== "chevalier") return;
  if (foundry.utils.hasProperty(changes, "system.rank")) applyDomainRank(item.parent, item);
}

/** Ajoute une faveur au registre du chevalier. */
export async function addFavor(actor, { direction = "owed", who = "", value = 1, reason = "" }) {
  const favors = foundry.utils.deepClone(actor._source.system.favors ?? []);
  favors.push({ direction, who, value, reason, year: Number(game.settings.get(SYSTEM_ID, "currentYear")) || null, settled: false });
  return actor.update({ "system.favors": favors });
}

/** Transmet un fief à un autre chevalier (l'héritier) ; le don retourne au seigneur. */
export async function transferDomain(domain, heir) {
  const holder = domain.parent;
  if (!holder || !heir || heir.type !== "chevalier") return null;
  const data = domain.toObject();
  delete data._id;
  const year = Number(game.settings.get(SYSTEM_ID, "currentYear")) || null;
  data.system.ledger = [...(data.system.ledger ?? []), { year, income: 0, note: F("PDVF.Domain.Inherited", { from: holder.name }) }];
  data.system.since = year;
  const [created] = await heir.createEmbeddedDocuments("Item", [data]);
  await domain.delete();
  return created;
}

/** Rend un don au seigneur : le domaine quitte la fiche (une copie reste dans les objets du monde si le MJ le fait). */
export async function returnDomain(domain) {
  const holder = domain.parent;
  if (!holder) return null;
  if (game.user.isGM) {
    const data = domain.toObject();
    delete data._id;
    data.system.ledger = [...(data.system.ledger ?? []), { year: Number(game.settings.get(SYSTEM_ID, "currentYear")) || null, income: 0, note: F("PDVF.Domain.Returned", { from: holder.name }) }];
    await Item.implementation.create(data);
  }
  await domain.delete();
  return true;
}

/** Note le revenu de l'année dans le registre de chaque domaine (phase d'hiver). */
export async function recordIncome(actor, year, rows) {
  for (const r of rows) {
    const d = actor.items.get(r.id);
    if (!d) continue;
    const ledger = foundry.utils.deepClone(d._source.system.ledger ?? []);
    if (ledger.some(l => l.year === year && l.note === "")) continue;
    ledger.push({ year, income: Number(r.income) || 0, note: "" });
    await d.update({ "system.ledger": ledger });
  }
}
