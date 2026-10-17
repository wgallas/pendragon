/**
 * Suite du chevalier : rattacher un PNJ, créer un écuyer (Table 12.7), convertir un PNJ en chevalier.
 */
import { PDVF, SYSTEM_ID } from "../config.mjs";
import { squireAgeFromRoll, squireOriginFromRoll, squireOrigin, squireSkill, squireKnightly, normalizeLabel } from "../rules/followers.mjs";

const L = (k) => game.i18n.localize(k);
const F = (k, d) => game.i18n.format(k, d);

/** Rattache un PNJ à la suite d'un chevalier (sans doublon). */
export async function addFollower(knight, npc) {
  if (knight?.type !== "chevalier" || npc?.type !== "pnj") return null;
  const rows = foundry.utils.deepClone(knight._source.system.followers ?? []);
  if (rows.some(r => r.uuid === npc.uuid)) return npc;
  rows.push({ uuid: npc.uuid });
  await knight.update({ "system.followers": rows });
  return npc;
}

export async function removeFollower(knight, index) {
  const rows = foundry.utils.deepClone(knight._source.system.followers ?? []);
  rows.splice(index, 1);
  return knight.update({ "system.followers": rows });
}

/** Suivants d'un chevalier, résolus (les liens morts sont signalés). */
export function resolveFollowers(knight) {
  return (knight.system.followers ?? []).map((f, index) => {
    const actor = globalThis.fromUuidSync?.(f.uuid) ?? null;
    return { index, uuid: f.uuid, actor };
  });
}

/* -------------------------------------------- */
/*  Nouvel écuyer                                */
/* -------------------------------------------- */

/**
 * Crée un écuyer pour un chevalier : âge 1D20 (14 au moins), origine 1D20 sur la Table 12.7
 * (ou origine imposée par le MJ), puis le rattache à la suite.
 */
export async function createSquire(knight) {
  if (!game.user.can("ACTOR_CREATE")) return ui.notifications.warn(L("PDVF.Npc.NoCreatePermission"));
  const { DialogV2 } = foundry.applications.api;
  const names = PDVF.creation?.names?.male ?? [];
  const suggested = names.length ? names[Math.floor(Math.random() * names.length)] : "";
  const hasSquire = resolveFollowers(knight).some(f => f.actor?.system?.category === "squire");
  const origins = [`<option value="">${L("PDVF.Npc.RandomOrigin")}</option>`,
    ...PDVF.squireOrigins.map(o => `<option value="${o.id}">${L(`PDVF.Npc.SquireOrigin.${o.id}`)}${o.range ? ` (${o.range[0]}–${o.range[1]})` : ` (${L("PDVF.Npc.GMChoice")})`}</option>`)];
  const content = `
    <div class="form-group"><label>${L("PDVF.Npc.SquireName")}</label><input type="text" name="name" value="${suggested}"></div>
    <div class="form-group"><label>${L("PDVF.Npc.Origin")}</label><select name="origin">${origins.join("")}</select></div>
    <div class="form-group"><label>${L("PDVF.Npc.FirstSquire")}</label><input type="checkbox" name="first" ${hasSquire ? "" : "checked"}></div>
    <p class="hint">${L("PDVF.Npc.NewSquireHint")}</p>`;
  const result = await DialogV2.wait({
    window: { title: L("PDVF.Npc.NewSquire") },
    classes: [SYSTEM_ID, "pdvf-dialog"],
    content,
    rejectClose: false,
    buttons: [{
      action: "ok", label: L("PDVF.Npc.CreateSquire"), icon: "fa-solid fa-dice-d20", default: true,
      callback: (event, button) => new foundry.applications.ux.FormDataExtended(button.form).object
    }, { action: "cancel", label: L("PDVF.Dialog.Cancel") }]
  });
  if (!result || result === "cancel") return null;

  const ageRoll = await new Roll("1d20").evaluate();
  const age = squireAgeFromRoll(ageRoll.total);
  let originRoll = null;
  let origin;
  if (result.origin) origin = squireOrigin(result.origin);
  else {
    originRoll = await new Roll("1d20").evaluate();
    origin = squireOriginFromRoll(originRoll.total);
  }
  const year = Number(game.settings.get(SYSTEM_ID, "currentYear")) || 508;
  const name = String(result.name || "").trim() || L("PDVF.Npc.Category.squire");

  const npc = await Actor.implementation.create({
    name,
    type: "pnj",
    folder: knight.folder?.id ?? null,
    ownership: foundry.utils.deepClone(knight.ownership),
    system: {
      category: "squire",
      tagline: F("PDVF.Npc.SquireOf", { name: knight.name }),
      squire: { born: year - age, origin: origin.id, otherSkill: PDVF.squireDefaultOther, first: !!result.first },
      passions: [{ name: L("PDVF.DefaultPassion.homage"), value: PDVF.squireHomage }],
      armor: { value: 0, shield: 0, description: L("PDVF.Npc.SquireGear") }
    }
  });
  if (!npc) return null;
  await addFollower(knight, npc);

  const lines = [
    F("PDVF.Npc.SquireAgeLine", { age, roll: ageRoll.total }),
    originRoll ? F("PDVF.Npc.SquireOriginLine", { origin: L(`PDVF.Npc.SquireOrigin.${origin.id}`), roll: originRoll.total })
      : F("PDVF.Npc.SquireOriginChosen", { origin: L(`PDVF.Npc.SquireOrigin.${origin.id}`) }),
    F("PDVF.Npc.SquireValuesLine", { skill: squireSkill(origin.id), knightly: squireKnightly(age, origin.id) })
  ];
  await ChatMessage.implementation.create({
    speaker: ChatMessage.getSpeaker({ actor: knight }),
    content: `<div class="pdvf-card"><header class="pdvf-card-header"><h3 class="pdvf-card-title">${F("PDVF.Npc.NewSquireCard", { name })}</h3></header>
      <ul class="pdvf-card-notes">${lines.map(l => `<li>${l}</li>`).join("")}</ul></div>`,
    rolls: [ageRoll, originRoll].filter(Boolean)
  });
  return npc;
}

/* -------------------------------------------- */
/*  Conversion en chevalier                      */
/* -------------------------------------------- */

/** Cour probable d'une passion d'après son nom. */
export function guessCourt(name) {
  const first = normalizeLabel(name).split(/[\s(]/)[0];
  for (const [court, words] of Object.entries(PDVF.passionCourtKeywords)) {
    if (words.includes(first)) return court;
  }
  return "fervor";
}

/**
 * Données d'un chevalier tirées d'un PNJ (module pur hormis la traduction des libellés).
 * @param {object} npcSource  { name, img, system } — system préparé (squireView) ou brut
 * @param {(key:string)=>string} localize
 */
export function knightDataFromNpc(npc, localize = L) {
  const s = npc.system;
  const byLabel = new Map(Object.keys(PDVF.skills).map(id => [normalizeLabel(localize(`PDVF.Skill.${id}`)), id]));
  const skills = Object.fromEntries(Object.keys(PDVF.skills).map(id => [id, { value: Number(s.defaultSkill ?? PDVF.npcDefaultSkill), xp: false }]));
  const extraSkills = [];
  const setSkill = (id, value) => { skills[id].value = Math.max(skills[id].value, Number(value) || 0); };

  // Compétences de l'écuyer (âge − 9), puis compétences notées, puis compétences des attaques
  const v = s.squireView;
  if (v && v.knightly !== null) for (const id of v.knightlyIds) if (id in skills) skills[id].value = v.knightly;
  for (const r of s.skills ?? []) {
    const id = byLabel.get(normalizeLabel(r.name));
    if (id) skills[id].value = Number(r.value) || 0;
    else if (r.name?.trim()) extraSkills.push({ name: r.name.trim(), group: "general", value: Number(r.value) || 0, xp: false });
  }
  for (const a of s.attacks ?? []) {
    const id = byLabel.get(normalizeLabel(a.skill));
    if (id) setSkill(id, a.value);
  }

  // Traits : les traits nommés comme ceux de la fiche prennent leur valeur, les autres deviennent des traits dirigés
  const traits = Object.fromEntries(PDVF.traits.map(id => [id, { value: 10, xpLeft: false, xpRight: false }]));
  const sides = new Map();
  for (const id of PDVF.traits) {
    sides.set(normalizeLabel(localize(`PDVF.Trait.${id}.left`)), [id, "left"]);
    sides.set(normalizeLabel(localize(`PDVF.Trait.${id}.right`)), [id, "right"]);
  }
  const directedTraits = [];
  for (const r of s.traits ?? []) {
    const hit = sides.get(normalizeLabel(r.name));
    const value = Number(r.value) || 0;
    if (hit) traits[hit[0]].value = hit[1] === "left" ? value : 20 - value;
    else if (r.name?.trim()) directedTraits.push({ name: r.name.trim(), value });
  }

  const passions = (s.passions ?? []).filter(p => p.name?.trim()).map(p => ({
    court: guessCourt(p.name), name: p.name.trim(), value: Number(p.value) || 0, xp: false
  }));

  const notes = [
    s.tagline, s.notes,
    s.armor?.description ? `${localize("PDVF.Npc.Armor")} : ${s.armor.description}` : "",
    s.possessions ? `${localize("PDVF.Npc.Possessions")} : ${s.possessions}` : ""
  ].filter(Boolean).join("\n\n");

  const characteristics = Object.fromEntries(PDVF.characteristics.map(id => [id, { value: Number(s.characteristics?.[id]?.value) || 10 }]));
  return {
    name: npc.name,
    type: "chevalier",
    img: npc.img,
    system: {
      characteristics,
      health: { hp: { value: Number(s.health?.hp?.value) || 0 } },
      skills, extraSkills, traits, directedTraits, passions,
      honor: { value: s.honor === null || s.honor === undefined ? 15 : Number(s.honor), xp: false },
      biography: {
        born: s.category === "squire" ? (s.squire?.born ?? null) : null,
        knightClass: s.category === "squire" ? "squire" : ""
      },
      notes
    }
  };
}

/** Crée un chevalier à partir d'un PNJ ; le PNJ est conservé. */
export async function convertNpcToKnight(npc) {
  if (npc?.type !== "pnj") return null;
  if (!game.user.can("ACTOR_CREATE")) return ui.notifications.warn(L("PDVF.Npc.NoCreatePermission"));
  const ok = await foundry.applications.api.DialogV2.confirm({
    window: { title: L("PDVF.Npc.Convert") },
    content: `<p>${F("PDVF.Npc.ConvertConfirm", { name: npc.name })}</p>`,
    rejectClose: false
  });
  if (!ok) return null;
  const data = knightDataFromNpc(npc);
  data.folder = npc.folder?.id ?? null;
  data.ownership = foundry.utils.deepClone(npc.ownership);
  data.flags = { [SYSTEM_ID]: { convertedFrom: npc.uuid } };
  const knight = await Actor.implementation.create(data, { pdvfSkipWizard: true });
  if (knight) ui.notifications.info(F("PDVF.Npc.Converted", { name: knight.name }));
  return knight;
}
