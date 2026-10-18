/**
 * Suite du chevalier : rattacher un PNJ, créer un écuyer (Table 12.7), convertir un PNJ en chevalier.
 */
import { PDVF, SYSTEM_ID } from "../config.mjs";
import { CREATION } from "../creation/data.mjs";
import { formulaValue, defaultState } from "../creation/rules.mjs";
import { horseFromType, horsePassiveGlory } from "../rules/horses.mjs";
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
  const name = String(result.name || "").trim() || L("PDVF.Npc.Category.squire");
  const npc = await createSquireNpc(knight, { name, age, origin: origin.id, first: !!result.first });
  if (!npc) return null;

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

/**
 * Crée l'écuyer (PNJ) d'un chevalier avec un âge et une origine donnés, et le rattache à sa suite.
 * Sert au dialogue « Nouvel écuyer » et aux personnages prétirés (écuyer de 14 ans).
 */
export async function createSquireNpc(knight, { name, age, origin = "secondSon", first = true } = {}) {
  if (!game.user.can("ACTOR_CREATE")) { ui.notifications.warn(L("PDVF.Npc.NoCreatePermission")); return null; }
  const year = Number(game.settings.get(SYSTEM_ID, "currentYear")) || 508;
  const npc = await Actor.implementation.create({
    name: String(name || "").trim() || L("PDVF.Npc.Category.squire"),
    type: "pnj",
    folder: knight.folder?.id ?? null,
    ownership: foundry.utils.deepClone(knight.ownership),
    system: {
      category: "squire",
      tagline: F("PDVF.Npc.SquireOf", { name: knight.name }),
      squire: { born: year - age, origin: squireOrigin(origin).id, otherSkill: PDVF.squireDefaultOther, first: !!first },
      passions: [{ name: L("PDVF.DefaultPassion.homage"), value: PDVF.squireHomage }],
      armor: { value: 0, shield: 0, description: L("PDVF.Npc.SquireGear") }
    }
  });
  if (!npc) return null;
  await addFollower(knight, npc);
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
  // Base : valeurs de départ du chevalier (Livre du joueur, Table 3.5) tirées des caractéristiques
  const ch = Object.fromEntries(PDVF.characteristics.map(id => [id, Number(s.characteristics?.[id]?.value) || 10]));
  const C = PDVF.creation ?? CREATION;
  const skills = Object.fromEntries(Object.keys(PDVF.skills).map(id =>
    [id, { value: Math.max(0, formulaValue(C.startingSkills?.[id] ?? s.defaultSkill ?? PDVF.npcDefaultSkill, ch)), xp: false }]));
  const extraSkills = [];
  const setSkill = (id, value) => { skills[id].value = Math.max(skills[id].value, Number(value) || 0); };

  // Compétences de l'écuyer (âge − 9) si elles dépassent la base, puis compétences notées, puis celles des attaques
  const v = s.squireView;
  if (v && v.knightly !== null) for (const id of v.knightlyIds) if (id in skills) setSkill(id, v.knightly);
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

  const characteristics = Object.fromEntries(PDVF.characteristics.map(id => [id, { value: ch[id] }]));
  const age = v?.age ?? null;
  const knighthood = knighthoodFromSkills(skills, age, C);
  return {
    knighthood,
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
        knightClass: s.category === "squire" && !knighthood.eligible ? "squire" : (s.category === "squire" ? "household" : "")
      },
      notes
    }
  };
}

/** Conditions d'adoubement (Livre du joueur p. 53) d'après des compétences de chevalier. */
export function knighthoodFromSkills(skills, age, C = PDVF.creation ?? CREATION) {
  const k = C.knighthood;
  const val = (id) => Number(skills[id]?.value) || 0;
  const weapons = k.weapons.map(id => ({ id, value: val(id), ok: val(id) >= k.minValue }));
  const othersOk = k.others.filter(id => val(id) >= k.minValue).length >= k.othersNeeded;
  const ageOk = age === null || age >= k.minAge;
  return { age, ageOk, weapons, othersOk, eligible: ageOk && othersOk && weapons.every(w => w.ok) };
}

/** Crée un chevalier à partir d'un PNJ ; le PNJ est conservé. */
export async function convertNpcToKnight(npc) {
  if (npc?.type !== "pnj") return null;
  if (!game.user.can("ACTOR_CREATE")) return ui.notifications.warn(L("PDVF.Npc.NoCreatePermission"));
  const data = knightDataFromNpc(npc);
  const kh = data.knighthood;
  delete data.knighthood;
  let warning = "";
  if (!kh.eligible) {
    const C = PDVF.creation ?? CREATION;
    const missing = [
      kh.ageOk ? null : `${L("PDVF.Wizard.Knight.age")} ${kh.age} (${C.knighthood.minAge})`,
      ...kh.weapons.filter(w => !w.ok).map(w => `${L(`PDVF.Skill.${w.id}`)} ${w.value} (${C.knighthood.minValue})`),
      kh.othersOk ? null : L("PDVF.Wizard.Knight.others")
    ].filter(Boolean);
    warning = `<p class="pdvf-wiz-warning">${L("PDVF.Npc.ConvertNotEligible")}</p><ul>${missing.map(m => `<li>${m}</li>`).join("")}</ul>`;
  }
  // Un écuyer peut aussi devenir un vrai chevalier construit avec l'assistant (chap. 3).
  const isSquire = npc.system.category === "squire";
  const choice = await foundry.applications.api.DialogV2.wait({
    window: { title: L("PDVF.Npc.Convert") },
    classes: [SYSTEM_ID, "pdvf-dialog"],
    content: `<p>${F("PDVF.Npc.ConvertConfirm", { name: npc.name })}</p>${warning}${isSquire ? `<p class="hint">${L("PDVF.Npc.ConvertWizardHint")}</p>` : ""}`,
    rejectClose: false,
    buttons: [
      ...(isSquire ? [{ action: "wizard", label: L("PDVF.Npc.ConvertWizard"), icon: "fa-solid fa-wand-magic-sparkles", default: true }] : []),
      { action: "direct", label: L("PDVF.Npc.ConvertDirect"), icon: "fa-solid fa-chess-knight", default: !isSquire },
      { action: "cancel", label: L("PDVF.Dialog.Cancel") }
    ]
  });
  if (choice !== "wizard" && choice !== "direct") return null;

  const base = {
    folder: npc.folder?.id ?? null,
    ownership: foundry.utils.deepClone(npc.ownership),
    flags: { [SYSTEM_ID]: { convertedFrom: npc.uuid } }
  };
  if (choice === "wizard") {
    // Fiche vierge et brouillon de l'assistant prérempli (nom, années d'écuyer déjà faites) ;
    // l'assistant s'ouvre de lui-même pour un chevalier tout neuf.
    const draft = squireWizardDraft(npc, PDVF.creation ?? CREATION);
    const knight = await Actor.implementation.create({
      name: npc.name, type: "chevalier", img: npc.img, ...base,
      flags: { [SYSTEM_ID]: { convertedFrom: npc.uuid, creationDraft: draft } }
    });
    if (knight) ui.notifications.info(F("PDVF.Npc.ConvertedWizard", { name: knight.name }));
    return knight;
  }
  Object.assign(data, base);
  const knight = await Actor.implementation.create(data, { pdvfSkipWizard: true });
  if (knight) ui.notifications.info(F("PDVF.Npc.Converted", { name: knight.name }));
  return knight;
}

/**
 * Brouillon de l'assistant de création pour un écuyer : son nom, et ses années d'écuyer
 * (âge − 14, au plus le maximum de l'assistant), toutes placées par défaut en compétences.
 */
export function squireWizardDraft(npc, C) {
  const draft = defaultState(C);
  draft.origin.name = npc.name;
  const age = npc.system.squireView?.age;
  if (age !== null && age !== undefined) {
    const years = Math.max(0, Math.min(C.budgets.apprenticeYears, age - 14));
    draft.apprentice.years = years;
    draft.apprentice.alloc = { skills: years, traits: 0, chars: 0 };
  }
  return draft;
}

/* -------------------------------------------- */
/*  Écurie                                       */
/* -------------------------------------------- */

/** Rattache un cheval à l'écurie d'un chevalier (sans doublon). */
export async function addHorse(knight, horse, role = null) {
  if (knight?.type !== "chevalier" || horse?.type !== "cheval") return null;
  const rows = foundry.utils.deepClone(knight._source.system.horses ?? []);
  if (rows.some(r => r.uuid === horse.uuid)) return horse;
  const group = horse.system.typeGroup;
  rows.push({ uuid: horse.uuid, role: role ?? (group === "war" || group === "fae" ? "war" : group === "work" ? "pack" : "riding") });
  const update = { "system.horses": rows };
  // Premier cheval de guerre : cheval principal
  if (!knight.system.mainHorse && horse.system.warTrained) update["system.mainHorse"] = horse.uuid;
  await knight.update(update);
  return horse;
}

export async function removeHorse(knight, index) {
  const rows = foundry.utils.deepClone(knight._source.system.horses ?? []);
  const [gone] = rows.splice(index, 1);
  const update = { "system.horses": rows };
  if (gone && gone.uuid === knight.system.mainHorse) update["system.mainHorse"] = "";
  return knight.update(update);
}

/** Chevaux d'un chevalier, résolus. */
export function resolveHorses(knight) {
  return (knight.system.horses ?? []).map((h, index) => ({ index, uuid: h.uuid, role: h.role, actor: globalThis.fromUuidSync?.(h.uuid) ?? null }));
}

/** Gloire passive annuelle des chevaux d'un chevalier. */
export function knightHorseGlory(knight) {
  const horses = resolveHorses(knight).map(h => h.actor).filter(a => a?.type === "cheval");
  const main = horses.find(a => a.uuid === knight.system.mainHorse) ?? null;
  return horsePassiveGlory(horses, main, knight.system.skills?.horsemanship?.value);
}

/** Crée un cheval d'un type donné et le rattache au chevalier. */
export async function createHorse(knight, { type, name, sex, color = "bay", role = null } = {}) {
  if (!game.user.can("ACTOR_CREATE")) { ui.notifications.warn(L("PDVF.Npc.NoCreatePermission")); return null; }
  const year = Number(game.settings.get(SYSTEM_ID, "currentYear")) || 508;
  const system = horseFromType(type, { sex: sex ?? "gelding", color, born: year - 6 });
  const horse = await Actor.implementation.create({
    name: name || L(`PDVF.Horse.Type.${type}`),
    type: "cheval",
    folder: knight.folder?.id ?? null,
    ownership: foundry.utils.deepClone(knight.ownership),
    system
  });
  if (horse) await addHorse(knight, horse, role);
  return horse;
}

/** Les quatre chevaux de départ (Livre du joueur p. 54), si le chevalier n'a pas encore d'écurie. */
export async function createStartingHorses(knight) {
  if ((knight.system.horses ?? []).length) return [];
  if (!game.user.can("ACTOR_CREATE")) { ui.notifications.warn(L("PDVF.Horse.NoStartingHorses")); return []; }
  const out = [];
  for (const h of PDVF.startingHorses) {
    const name = F(`PDVF.Horse.StartingName.${h.role}`, { name: knight.name });
    out.push(await createHorse(knight, { type: h.type, name, sex: h.sex, role: h.role }));
  }
  return out.filter(Boolean);
}

/** Fenêtre « Nouveau cheval » : type, nom, sexe, robe. */
export async function promptNewHorse(knight) {
  const { DialogV2 } = foundry.applications.api;
  const groups = ["war", "riding", "work", "fae"].map(g => `<optgroup label="${L(`PDVF.Horse.Group.${g}`)}">` +
    Object.entries(PDVF.horseTypes).filter(([, t]) => t.group === g).map(([id]) => `<option value="${id}" ${id === "destrier" ? "selected" : ""}>${L(`PDVF.Horse.Type.${id}`)}</option>`).join("") + "</optgroup>").join("");
  const sexes = PDVF.horseSexes.map(id => `<option value="${id}" ${id === "gelding" ? "selected" : ""}>${L(`PDVF.Horse.Sex.${id}`)}</option>`).join("");
  const colors = Object.keys(PDVF.horseColors).map(id => `<option value="${id}">${L(`PDVF.Horse.Color.${id}`)}</option>`).join("");
  const result = await DialogV2.wait({
    window: { title: L("PDVF.Horse.New") },
    classes: [SYSTEM_ID, "pdvf-dialog"],
    content: `<div class="form-group"><label>${L("PDVF.Horse.TypeLabel")}</label><select name="type">${groups}</select></div>
      <div class="form-group"><label>${L("PDVF.Bio.name")}</label><input type="text" name="name" placeholder="${L("PDVF.Horse.NamePlaceholder")}"></div>
      <div class="form-group"><label>${L("PDVF.Horse.SexLabel")}</label><select name="sex">${sexes}</select></div>
      <div class="form-group"><label>${L("PDVF.Horse.ColorLabel")}</label><select name="color">${colors}</select></div>`,
    rejectClose: false,
    buttons: [{ action: "ok", label: L("PDVF.Horse.Create"), icon: "fa-solid fa-horse", default: true,
      callback: (event, button) => new foundry.applications.ux.FormDataExtended(button.form).object },
    { action: "cancel", label: L("PDVF.Dialog.Cancel") }]
  });
  if (!result || result === "cancel") return null;
  return createHorse(knight, { type: result.type, name: String(result.name || "").trim(), sex: result.sex, color: result.color });
}
