import { PDVF, SYSTEM_ID } from "../config.mjs";
import * as R from "../rules/battle.mjs";
import { formatValue } from "../rules/resolution.mjs";
import { request, perform, knightActor, findEncounter, candidates, onField, summary, moralePassion, showToPlayers, isCommanderUser } from "../battle/engine.mjs";
import * as client from "../battle/client.mjs";
import { placeEnemies, removeEnemies } from "../battle/tokens.mjs";
import { bannerFor, pickImage } from "../battle/banner.mjs";
import { battleScene, defaultBattlefield } from "../battle/scene.mjs";
import { createNextDay, previousBattle } from "../battle/series.mjs";
import { rollEventTable } from "../battle/tables.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;
const L = (k) => game.i18n.localize(k);
const F = (k, d) => game.i18n.format(k, d);

const STEPS = ["define", "charge", "intensity", "battle", "select", "posture", "resolve", "squire"];
const STATUSES = ["field", "pending", "rear", "escort", "alone", "left", "dead", "captured"];
const ROLES = ["none", "conroi", "division", "army"];
const PREP_SECTIONS = ["general", "armies", "conroi", "deck", "rounds", "outcome"];
const PREP_ICONS = { general: "fa-scroll", armies: "fa-chess-rook", conroi: "fa-shield-halved", deck: "fa-layer-group", rounds: "fa-hourglass-half", outcome: "fa-crown" };

/** Valeurs par défaut d'une ligne ajoutée dans un éditeur de liste. */
function rowDefaults(kind, battle, dataset) {
  const s = battle.system;
  switch (kind) {
    case "effect": return { type: "battleMod", value: "", ids: [] };
    case "custom": return { label: "", value: 0 };
    case "condition": return { label: "", from: null, to: null, effects: [] };
    case "event": return {
      round: Number(dataset.round) || 1, title: "", text: "", gmNote: "", img: "", focus: PDVF.battle.bannerFocus,
      trigger: "intensity", condition: "", duration: "round", until: null, knights: [], effects: []
    };
    case "bonus": return { label: "", glory: 0, knights: [] };
    case "table": return { id: foundry.utils.randomID(), name: "", formula: "3D6", trigger: s.tables.some(t => t.trigger === "fumble") ? "manual" : "fumble", rows: [] };
    case "tableRow": {
      const table = s.tables[Number(dataset.table)];
      const last = table?.rows?.at(-1);
      const min = last ? Number(last.max) + 1 : 1;
      return { min, max: min, text: "", table: "", effects: [] };
    }
    default: return {};
  }
}

/** Champ du modèle de données au bout d'un chemin (« events.3.effects.0.value »), sans les indices. */
export function fieldAt(schema, parts) {
  let field = schema;
  for (const part of parts) {
    if (!field) return null;
    if (field instanceof foundry.data.fields.ArrayField) {
      field = field.element;
      if (/^\d+$/.test(part)) continue;
    }
    if (/^\d+$/.test(part)) continue;
    field = field.fields?.[part] ?? null;
  }
  return field;
}

/**
 * Fusionne les valeurs envoyées par le formulaire (tableaux reçus en objets indexés) avec la source,
 * à toute profondeur : un tableau reste un tableau, ses lignes non affichées sont conservées.
 */
export function mergeIndexed(source, incoming) {
  const plain = (v) => v && typeof v === "object" && !Array.isArray(v);
  if (Array.isArray(source) && plain(incoming)) {
    const out = foundry.utils.deepClone(source);
    for (const [k, v] of Object.entries(incoming)) {
      const i = Number(k);
      if (!Number.isInteger(i) || out[i] === undefined) continue;
      out[i] = mergeIndexed(out[i], v);
    }
    return out;
  }
  if (plain(source) && plain(incoming)) {
    const out = { ...source };
    for (const [k, v] of Object.entries(incoming)) out[k] = mergeIndexed(source[k], v);
    return out;
  }
  return incoming;
}

/** Premier tableau sur un chemin relatif à system (« events.3.effects » → « events »). */
export function arrayRoot(system, rel) {
  const parts = rel.split(".");
  for (let n = 1; n <= parts.length; n++) {
    const head = parts.slice(0, n).join(".");
    if (Array.isArray(foundry.utils.getProperty(system, head))) return { root: head, rest: parts.slice(n) };
  }
  return null;
}

/**
 * Fiche de bataille : préparation complète par le MJ, conduite pas à pas (MJ et joueurs), bilan.
 */
export class BatailleSheet extends HandlebarsApplicationMixin(ItemSheetV2) {

  _tab = null;
  _prep = "general";

  static DEFAULT_OPTIONS = {
    classes: [SYSTEM_ID, "pdvf-sheet", "pdvf-battle-sheet"],
    position: { width: 1020, height: 880 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      battleTab: BatailleSheet.#onTab,
      prepSection: BatailleSheet.#onPrepSection,
      gm: BatailleSheet.#onGm,
      player: BatailleSheet.#onPlayer,
      openActor: BatailleSheet.#onOpenActor,
      openDoc: BatailleSheet.#onOpenDoc,
      addRow: BatailleSheet.#onAddRow,
      removeRow: BatailleSheet.#onRemoveRow,
      pickImage: BatailleSheet.#onPickImage,
      clearValue: BatailleSheet.#onClearValue,
      nextDay: BatailleSheet.#onNextDay,
      rollTable: BatailleSheet.#onRollTable,
      place: BatailleSheet.#onPlace,
      unplace: BatailleSheet.#onUnplace,
      show: BatailleSheet.#onShow,
      missile: BatailleSheet.#onMissile,
      rollIntensity: BatailleSheet.#onRollIntensity
    }
  };

  static PARTS = {
    sheet: { template: `systems/${SYSTEM_ID}/templates/item/bataille/sheet.hbs`, scrollable: [".pdvf-battle-body", ".pdvf-prep-main"] }
  };

  get title() { return this.document.name; }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const view = battleView(this.document, game.user);
    const isGM = !!game.user.isGM;
    const tabs = isGM ? ["prep", "conduct", "results", "log"] : ["conduct", "results", "log"];
    if (!this._tab || !tabs.includes(this._tab)) {
      this._tab = isGM && view.phase === "prep" ? "prep" : view.phase === "done" ? "results" : "conduct";
    }
    view.tab = this._tab;
    view.tabIs = { [this._tab]: true };
    view.tabs = tabs.map(id => ({ id, label: L(`PDVF.Battle.Tab.${id}`), active: id === this._tab }));
    view.banner = bannerFor(this.document, view.phase === "active" ? view.round : null);
    if (isGM && this._tab === "prep") Object.assign(view, prepView(this.document, this._prep, view));
    return Object.assign(context, view);
  }

  async _onFirstRender(context, options) {
    await super._onFirstRender?.(context, options);
    this.element.addEventListener("dragover", (e) => e.preventDefault());
    this.element.addEventListener("drop", (e) => this.#onDrop(e));
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    // Fiche en lecture seule pour les joueurs : leurs boutons d'action restent utilisables.
    if (!this.isEditable) {
      for (const el of this.element.querySelectorAll("button[data-action]")) el.disabled = false;
    }
    // Hauteur de cadrage : l'aperçu suit le curseur sans attendre l'enregistrement.
    for (const range of this.element.querySelectorAll("input[type=range][data-focus-preview]")) {
      range.addEventListener("input", () => {
        const img = this.element.querySelector(range.dataset.focusPreview);
        if (img) img.style.objectPosition = `center ${range.value}%`;
      });
    }
  }

  async #onDrop(event) {
    if (!game.user.isGM) return;
    const TE = foundry.applications.ux.TextEditor.implementation;
    const data = TE.getDragEventData(event);
    if (!data?.uuid) return;
    const doc = await fromUuid(data.uuid);
    if (!doc) return;
    const zone = event.target.closest?.("[data-drop]");
    // Bataille de la veille
    if (zone?.dataset.drop === "previous" && doc.documentName === "Item" && doc.type === "bataille" && doc.uuid !== this.document.uuid) {
      return this.document.update({ "system.series.previous": doc.uuid, "system.series.name": this.document.system.series.name || doc.system.series.name || doc.name });
    }
    // Un PNJ nommé déposé sur une carte : il remplace l'adversaire générique de cette carte.
    if (zone?.dataset.drop === "card" && doc.documentName === "Actor" && doc.type === "pnj") {
      const rows = foundry.utils.deepClone(this.document._source.system.encounters);
      const card = rows.find(e => e.id === zone.dataset.id);
      if (!card) return;
      card.npc = doc.uuid;
      if (!card.glory) card.glory = doc.system.gloryReward ?? 0;
      return this.document.update({ "system.encounters": rows });
    }
    if (doc.documentName === "Actor" && doc.type === "chevalier") return request(this.document, "addKnight", { uuid: doc.uuid });
    if (doc.documentName === "Item" && doc.type === "rencontre") return request(this.document, "addEncounter", { data: doc.toObject(), source: doc.uuid });
    if (doc.documentName === "Actor" && doc.type === "pnj") {
      // Un PNJ glissé ailleurs : une rencontre simple contre lui (une par chevalier).
      const system = { kind: "opponent", npc: doc.uuid, glory: doc.system.gloryReward ?? 0, perKnight: 1, kv: 1, moraleLoss: "1D6", moraleMin: 10 };
      const full = new Item.implementation({ name: doc.name, type: "rencontre", img: doc.img, system }).toObject();
      return request(this.document, "addEncounter", { data: full, source: doc.uuid });
    }
  }

  _processFormData(event, form, formData) {
    const data = super._processFormData(event, form, formData);
    // Cases des circonstances (Table 6.2) → listes
    const mods = data.mods;
    delete data.mods;
    if (mods) {
      for (const side of ["allied", "enemy"]) {
        if (!mods[side]) continue;
        foundry.utils.setProperty(data, `system.${side}.mods`, Object.entries(mods[side]).filter(([, v]) => v).map(([id]) => id));
      }
    }
    // Nombres vides : null si le champ l'admet, sinon sa valeur initiale.
    const schema = this.document.system.schema;
    for (const [k, v] of Object.entries(foundry.utils.flattenObject(data))) {
      if (!k.startsWith("system.") || (v !== null && v !== "")) continue;
      const parts = k.split(".").slice(1);
      const field = fieldAt(schema, parts);
      if (!field || (v === "" && !(field instanceof foundry.data.fields.NumberField))) continue;
      if (field.nullable) { foundry.utils.setProperty(data, k, null); continue; }
      const initial = typeof field.initial === "function" ? field.initial() : field.initial;
      foundry.utils.setProperty(data, k, initial ?? 0);
    }
    if (data.system) data.system = mergeIndexed(foundry.utils.deepClone(this.document._source.system), data.system);
    return data;
  }

  /* -------------------------------------------- */
  /*  Actions                                      */
  /* -------------------------------------------- */

  static #onTab(event, target) {
    this._tab = target.dataset.tab;
    this.render();
  }

  static #onPrepSection(event, target) {
    this._prep = target.dataset.section;
    this.render();
  }

  /** Ajoute une ligne à une liste, à n'importe quelle profondeur (« system.events.2.effects »). */
  static async #onAddRow(event, target) {
    const { path, kind } = target.dataset;
    const system = foundry.utils.deepClone(this.document._source.system);
    const rel = path.replace(/^system\./, "");
    const found = arrayRoot(system, rel);
    if (!found) return;
    const list = foundry.utils.getProperty(system, rel);
    if (!Array.isArray(list)) return;
    list.push(rowDefaults(kind, this.document, target.dataset));
    return this.document.update({ [`system.${found.root}`]: foundry.utils.getProperty(system, found.root) });
  }

  /** Retire une ligne d'une liste (data-path, data-index). */
  static async #onRemoveRow(event, target) {
    const { path, index } = target.dataset;
    const system = foundry.utils.deepClone(this.document._source.system);
    const rel = path.replace(/^system\./, "");
    const found = arrayRoot(system, rel);
    const list = foundry.utils.getProperty(system, rel);
    if (!found || !Array.isArray(list)) return;
    list.splice(Number(index), 1);
    return this.document.update({ [`system.${found.root}`]: foundry.utils.getProperty(system, found.root) });
  }

  /** Choisit une image (bandeau de la bataille ou d'un tour) dans les fichiers de Foundry. */
  static async #onPickImage(event, target) {
    const path = target.dataset.path;
    const current = foundry.utils.getProperty(this.document, path) ?? "";
    const chosen = await pickImage(current);
    if (!chosen) return;
    const rel = path.replace(/^system\./, "");
    const system = foundry.utils.deepClone(this.document._source.system);
    const found = arrayRoot(system, rel);
    if (!found) return this.document.update({ [path]: chosen });
    foundry.utils.setProperty(system, rel, chosen);
    return this.document.update({ [`system.${found.root}`]: foundry.utils.getProperty(system, found.root) });
  }

  /** Vide un champ texte (image, bataille précédente, PNJ d'une carte…). */
  static async #onClearValue(event, target) {
    const path = target.dataset.path;
    const rel = path.replace(/^system\./, "");
    const system = foundry.utils.deepClone(this.document._source.system);
    const found = arrayRoot(system, rel);
    if (!found) return this.document.update({ [path]: "" });
    foundry.utils.setProperty(system, rel, "");
    return this.document.update({ [`system.${found.root}`]: foundry.utils.getProperty(system, found.root) });
  }

  static #onNextDay() { return createNextDay(this.document); }
  static #onRollTable(event, target) { return rollEventTable(this.document, target.dataset.id); }

  /** Action du MJ (ou du commandant) traitée par le moteur. */
  static async #onGm(event, target) {
    const { op, ...rest } = target.dataset;
    const payload = {};
    for (const [k, v] of Object.entries(rest)) if (k !== "action") payload[k] = v === "true" ? true : v === "false" ? false : v;
    const group = target.closest("[data-group]");
    if (group && payload.id === undefined) {
      const sel = group.querySelector("select");
      if (sel) payload.id = sel.value;
    }
    if (["conclude", "reset"].includes(op)) {
      const ok = await foundry.applications.api.DialogV2.confirm({
        window: { title: L(`PDVF.Battle.Op.${op}`) }, content: `<p>${L(`PDVF.Battle.Confirm.${op}`)}</p>`, classes: [SYSTEM_ID, "pdvf-dialog"]
      });
      if (!ok) return;
      if (op === "conclude") this._tab = "results";
      if (op === "reset") this._tab = "prep";
    }
    if (op === "start") this._tab = "conduct";
    return request(this.document, op, payload);
  }

  /** Action d'un joueur pour l'un de ses chevaliers (jets lancés chez lui). */
  static async #onPlayer(event, target) {
    const battle = this.document;
    const { op, value } = target.dataset;
    const index = target.dataset.index !== undefined ? Number(target.dataset.index) : null;
    switch (op) {
      case "battleTest": return client.battleTest(battle, index);
      case "posture": return client.setPosture(battle, index, value);
      case "invoke": return client.invoke(battle, index);
      case "squireTest": return client.squireTest(battle, index);
      case "extraRound": return client.extraRound(battle, index);
      case "chargeTest": case "rangedTest": case "lossesTest": return client.commanderTest(battle, op);
    }
  }

  static #onOpenActor(event, target) {
    fromUuidSync(target.dataset.uuid)?.sheet?.render(true);
  }

  static async #onOpenDoc(event, target) {
    const doc = await fromUuid(target.dataset.uuid);
    if (doc?.documentName === "Scene") return doc.view();
    doc?.sheet?.render(true);
  }

  static #onPlace() { return placeEnemies(this.document); }
  static #onUnplace() { return removeEnemies(this.document); }
  static #onShow() {
    showToPlayers(this.document);
    ui.notifications.info(L("PDVF.Battle.Notify.Shown"));
  }
  static #onMissile() { return client.missileHit(this.document); }
  static async #onRollIntensity() {
    const formula = PDVF.battle.sizes[this.document.system.size]?.intensity ?? "2D6";
    const roll = await new Roll(formula.replace(/D/g, "d")).evaluate();
    await roll.toMessage({ speaker: { alias: this.document.name }, flavor: L("PDVF.Battle.RollIntensity") });
    return this.document.update({ "system.intensity": roll.total });
  }
}

/* -------------------------------------------- */
/*  Contexte d'affichage                         */
/* -------------------------------------------- */

const opt = (ids, current, prefix) => ids.map(id => ({ value: id, label: L(`${prefix}.${id}`), selected: id === current }));

/** Tout ce que la fiche affiche, pour le MJ ou pour un joueur. */
export function battleView(battle, user) {
  const s = battle.system;
  const cfg = PDVF.battle;
  const st = s.state;
  const isGM = !!user.isGM;
  const owns = (uuid) => isGM || !!fromUuidSync(uuid)?.testUserPermission?.(user, "OWNER");
  const isCommander = isCommanderUser(s, user);
  const enc = findEncounter(s, st.selectedId);
  const def = findEncounter(s, st.defaultId);
  const field = onField(s);
  const sum = summary(s);
  const choices = R.postureChoices({ firstCharge: st.charge === "first", forbidPrudent: enc?.forbidPrudent });

  const encounterRow = (e) => ({
    ...e, kvLabel: kvLabel(e.kv), countLabel: e.fixedCount ? String(e.fixedCount) : `×${String(e.perKnight).replace(".", ",")}`,
    kindLabel: L(`PDVF.Battle.Kind.${e.kind}`), isDefault: e.id === st.defaultId, isSelected: e.id === st.selectedId
  });
  const opponents = s.encounters.filter(e => e.kind === "opponent").map(encounterRow);
  const opportunities = s.encounters.filter(e => e.kind === "opportunity").map(encounterRow);

  const knights = s.knights.map((k, index) => {
    const actor = knightActor(k);
    const hp = actor?.system?.health?.hp ?? { value: 0, max: 0 };
    const mine = !!actor && owns(k.uuid);
    const passions = (actor?.system?.passions ?? []).map((p, i) => ({ value: i, label: `${p.name} ${formatValue(p.value)}`, court: p.court, selected: i === k.passion }))
      .filter(p => p.court === s.conroi.court);
    const chosen = moralePassion(actor, s.conroi.court, k.passion);
    const roundKills = k.kills.filter(x => x.round === st.round);
    const sumRow = sum.knights[index];
    const posture = k.posture ? cfg.postures[k.posture] : null;
    const barrage = st.rangedRounds ?? 0;
    return {
      ...k, index, mine, name: actor?.name ?? L("PDVF.Battle.MissingActor"), img: actor?.img ?? "icons/svg/mystery-man.svg",
      battleSkill: formatValue(actor?.system?.skills?.battle?.value ?? 0),
      hp: `${hp.value} / ${hp.max}`, hpLow: hp.max && hp.value < hp.max / 2,
      isCommander: k.uuid === s.conroi.commander,
      roleChoices: opt(ROLES, k.role, "PDVF.Battle.Role"),
      statusChoices: opt(STATUSES, k.status, "PDVF.Battle.Status"),
      statusLabel: L(`PDVF.Battle.Status.${k.status}`),
      passionChoices: passions, passionLabel: chosen ? `${chosen.name} ${formatValue(chosen.value)}` : "—",
      postureLabel: k.posture ? L(`PDVF.Battle.Posture.${k.posture}`) : "",
      postureRounds: posture?.rounds ?? null,
      fightRounds: posture ? Math.max(0, posture.rounds - (enc?.ranged ? barrage : 0)) : null,
      battleRollLabel: k.battleRoll ? L(`PDVF.Outcome.${k.battleRoll}`) : "",
      proposalName: k.proposal ? findEncounter(s, k.proposal)?.name ?? "" : "",
      squireLabel: k.squire ? L(`PDVF.Battle.SquireResult.${k.squire}`) : "",
      roundKills: roundKills.length, roundCaptured: roundKills.filter(x => x.captured).length,
      totalKills: k.kills.length, glorySoFar: sumRow?.killsGlory ?? 0,
      canBattleTest: mine && st.step === "battle" && k.status === "field" && !k.battleRoll,
      canPosture: mine && st.step === "posture" && k.status === "field" && k.posture !== "cowardly",
      canInvoke: mine && ["posture", "resolve"].includes(st.step) && k.status === "field" && !k.invoked,
      canSquire: mine && st.step === "squire" && !k.squire && !k.squireLost,
      canExtra: mine && st.step === "resolve" && k.status === "field" && k.posture && k.posture !== "cowardly",
      postures: choices.map(p => ({ id: p, label: L(`PDVF.Battle.Posture.${p}`), active: p === k.posture, rounds: cfg.postures[p].rounds })),
      summary: sumRow ? { ...sumRow, lootLabel: R.formatPounds(sumRow.loot), roleLabel: L(`PDVF.Battle.Role.${sumRow.role}`) } : null
    };
  });

  const stepIndex = STEPS.indexOf(st.step);
  const cand = st.step === "select" ? candidates(s).map(id => findEncounter(s, id)).filter(Boolean).map(e => ({
    ...encounterRow(e), selected: e.id === st.selectedId,
    proposers: s.knights.filter(k => k.proposal === e.id).map(k => knightActor(k)?.name).filter(Boolean).join(", "),
    enough: s.conroi.morale >= e.moraleMin - st.moraleMinMod
  })) : [];

  const size = cfg.sizes[s.size];
  const moralePct = s.conroi.moraleStart ? Math.round(100 * s.conroi.morale / s.conroi.moraleStart) : 0;
  const minPct = enc && s.conroi.moraleStart ? Math.min(100, Math.round(100 * (enc.moraleMin - st.moraleMinMod) / s.conroi.moraleStart)) : null;

  return {
    battle, system: s, isGM, isCommander, editable: isGM,
    phase: st.phase, step: st.step, round: st.round, maxRounds: s.maxRounds,
    at: Object.fromEntries([...STEPS, "end", "over", "aftermath"].map(id => [id, st.step === id])),
    isPrep: st.phase === "prep", isActive: st.phase === "active", isDone: st.phase === "done",
    onFieldNow: st.position === "field",
    sizeChoices: opt(Object.keys(cfg.sizes), s.size, "PDVF.Battle.Size"),
    sizeLabel: L(`PDVF.Battle.Size.${s.size}`),
    sizeInfo: size ? F("PDVF.Battle.SizeInfo", { rounds: size.rounds, intensity: size.intensity }) : "",
    armyChoices: opt(Object.keys(cfg.armies), s.army, "PDVF.Battle.Army"),
    oddsChoices: opt(Object.keys(cfg.odds), s.odds, "PDVF.Battle.Odds"),
    favorsChoices: opt(["allied", "enemy"], s.favors, "PDVF.Battle.Favors"),
    courtChoices: opt(PDVF.passionCourts, s.conroi.court, "PDVF.Court"),
    resultChoices: [{ value: "", label: L("PDVF.Battle.ResultAuto"), selected: !s.result.override },
      ...cfg.results.map(r => ({ value: r.id, label: L(`PDVF.Battle.Result.${r.id}`), selected: r.id === s.result.override }))],
    commanderChoices: [{ value: "", label: L("PDVF.Battle.NpcCommander"), selected: !s.conroi.commander },
      ...knights.map(k => ({ value: k.uuid, label: k.name, selected: k.uuid === s.conroi.commander }))],
    armies: s.armyTests ? ["allied", "enemy"].map(side => ({
      side, label: L(`PDVF.Battle.Side.${side}`), data: s[side],
      modifier: R.commanderModifier(side, { odds: s.odds, favors: s.favors, alliedMods: s.allied.mods, enemyMods: s.enemy.mods }, cfg),
      outcomeLabel: s[side].outcome ? L(`PDVF.Outcome.${s[side].outcome}`) : "",
      effect: s[side].outcome ? L(`PDVF.Battle.ArmyResult.${side}.${s[side].outcome}`) : "",
      mods: Object.keys(cfg.commanderMods).map(id => ({ id, label: L(`PDVF.Battle.Mod.${id}`), checked: s[side].mods.includes(id),
        value: cfg.commanderMods[id].mod })) ,
      name: `mods.${side}`
    })) : [],
    knights, opponents, opportunities, hasEncounters: s.encounters.length > 0,
    events: s.events.map((e, index) => ({ ...e, index, current: e.round === st.round })),
    roundEvents: s.events.filter(e => e.round === st.round && (e.text || e.title)),
    intensityLabel: s.effectiveIntensity ?? "—",
    morale: { value: s.conroi.morale, start: s.conroi.moraleStart, pct: moralePct, minPct, low: moralePct < 34 },
    positionLabel: L(`PDVF.Battle.Position.${st.position}`),
    inRear: st.position === "rear",
    steps: STEPS.map((id, i) => ({ id, label: L(`PDVF.Battle.Step.${id}`), current: id === st.step, done: stepIndex > i,
      skipped: (id === "charge" && st.charge === "first") || (id === "battle" && st.step !== "battle" && stepIndex > i && !s.knights.some(k => k.battleRoll)) })),
    stepHelp: st.step ? L(`PDVF.Battle.Help.${st.step}${isGM ? "" : "Player"}`) : "",
    defaultChoices: s.encounters.filter(e => e.kind === "opponent" || !e.used).map(e => ({ value: e.id, label: `${e.name}${e.kind === "opportunity" ? ` (${L("PDVF.Battle.Kind.opportunity")})` : ""}`, selected: e.id === st.defaultId })),
    defaultName: def?.name ?? "",
    chargeLabel: st.charge ? L(`PDVF.Battle.Charge.${st.charge}`) : "",
    intensityResult: st.intensityOutcome ? L(`PDVF.Battle.IntensityResult.${st.intensityOutcome}`) : "",
    candidates: cand,
    imposable: isGM && st.enemyImposes && !st.enemyImposeUsed && st.step === "select",
    imposeChoices: s.encounters.filter(e => e.kind === "opponent" || !e.used).map(e => ({ value: e.id, label: e.name })),
    immunity: st.moraleImmunity && !st.moraleImmunityUsed && st.step === "select",
    encounter: enc ? {
      ...encounterRow(enc),
      count: R.enemyCount(enc, field.length, st.doubled),
      gloryEach: R.opponentGlory(enc.glory, s.tournament, cfg),
      minEffective: enc.moraleMin - st.moraleMinMod
    } : null,
    counterChargeLabel: st.counterCharge ? L(`PDVF.Battle.CounterCharge.${st.counterCharge}`) : "",
    rangedLabel: st.rangedRounds !== null ? F("PDVF.Battle.RangedResult", { n: st.rangedRounds }) : "",
    allPostured: field.every(k => k.posture),
    missingPostures: field.filter(k => !k.posture).map(k => knightActor(k)?.name).filter(Boolean).join(", "),
    log: groupLog(s.log),
    sum: {
      ...sum, ratioLabel: Number.isFinite(sum.ratio) ? String(Math.round(sum.ratio * 100) / 100).replace(".", ",") : "∞",
      enemyKVLabel: String(Math.round(sum.enemyKV * 100) / 100).replace(".", ","),
      ownKVLabel: String(Math.round(sum.ownKV * 100) / 100).replace(".", ","),
      multLabel: sum.mult === 1 ? "" : `×${String(sum.mult).replace(".", ",")}`,
      resultLabel: L(`PDVF.Battle.Result.${sum.resultId}`), computedLabel: L(`PDVF.Battle.Result.${sum.computedId}`)
    },
    lossLabel: s.result.lossOutcome ? L(`PDVF.Outcome.${s.result.lossOutcome}`) : "",
    hasNpcKnights: s.conroi.npcKnights > 0
  };
}

function kvLabel(kv) {
  const v = Number(kv) || 0;
  const table = { 0.0625: "1/16", 0.125: "1/8", 0.25: "1/4", 0.5: "1/2", 0.75: "3/4" };
  return table[v] ?? String(v).replace(".", ",");
}

function groupLog(log) {
  const rounds = new Map();
  for (const row of log) {
    if (!rounds.has(row.round)) rounds.set(row.round, []);
    rounds.get(row.round).push(row.text);
  }
  return [...rounds.entries()].map(([round, lines]) => ({ round, label: round ? F("PDVF.Battle.RoundN", { round }) : L("PDVF.Battle.Tab.prep"), lines }));
}


/* -------------------------------------------- */
/*  Préparation (MJ)                             */
/* -------------------------------------------- */

const signedLabel = (v) => (v > 0 ? `+${v}` : String(v));

/** Choix d'une liste (valeurs, étiquettes traduites). */
function choices(ids, current, prefix, { empty = null } = {}) {
  const out = ids.map(id => ({ value: id, label: L(`${prefix}.${id}`), selected: id === current }));
  if (empty !== null) out.unshift({ value: "", label: empty, selected: !current });
  return out;
}

/** Libellé d'une plage de tours. */
function rangeLabel(item) {
  return R.roundRange(item, {
    one: L("PDVF.Battle.Range.one"), range: L("PDVF.Battle.Range.range"),
    from: L("PDVF.Battle.Range.from"), to: L("PDVF.Battle.Range.to"), all: L("PDVF.Battle.Range.all")
  });
}

/** Éditeur d'effets : une ligne par effet, avec le bon champ de valeur selon le type. */
function effectRows(list, base, s) {
  const cfg = PDVF.battle.effects;
  return (list ?? []).map((e, i) => {
    const def = cfg[e.type] ?? cfg.note;
    const cards = def.cards ? s.encounters.filter(c => c.kind === def.cards) : [];
    return {
      path: `${base}.${i}`, index: i, base, value: e.value,
      typeChoices: Object.keys(cfg).map(id => ({ value: id, label: L(`PDVF.Battle.Effect.${id}`), selected: id === e.type })),
      isNumber: def.input === "number", isFormula: def.input === "formula", isChoice: def.input === "choice", isText: def.input === "text",
      valueChoices: def.choices ? def.choices.map(c => ({ value: c, label: L(`PDVF.Battle.EffectChoice.${e.type}.${c}`), selected: c === e.value })) : [],
      hasCards: !!def.cards,
      cardChoices: cards.map(c => ({ value: c.id, label: c.name, selected: e.ids.includes(c.id) })),
      hint: L(`PDVF.Battle.EffectHint.${e.type}`)
    };
  });
}

/** Tout ce que la préparation affiche. */
export function prepView(battle, section, view) {
  const s = battle.system;
  const cfg = PDVF.battle;
  const sec = PREP_SECTIONS.includes(section) ? section : "general";
  const knightOptions = (selected = []) => s.knights.map(k => ({ value: k.uuid, label: knightActor(k)?.name ?? L("PDVF.Battle.MissingActor"), selected: selected.includes(k.uuid) }));
  const out = {
    prep: sec,
    prepIs: { [sec]: true },
    prepSections: PREP_SECTIONS.map(id => ({ id, icon: PREP_ICONS[id], label: L(`PDVF.Battle.Prep.${id}`), active: id === sec })),
    prepHint: L(`PDVF.Battle.PrepHint.${sec}`)
  };

  if (sec === "general") {
    const previous = previousBattle(battle);
    const scene = battleScene(battle);
    const fallback = defaultBattlefield();
    Object.assign(out, {
      kindChoices: choices(["battle", "offsystem"], s.kind, "PDVF.Battle.BattleKind"),
      previous: previous ? { uuid: previous.uuid, name: previous.name } : (s.series.previous ? { uuid: "", name: L("PDVF.Battle.MissingBattle") } : null),
      sceneChoices: [
        { value: "", label: F("PDVF.Battle.DefaultSceneChoice", { name: fallback?.name ?? L("PDVF.Battle.DefaultScene") }), selected: !s.scene },
        ...(game.scenes?.contents ?? []).filter(sc => sc.id !== fallback?.id).map(sc => ({ value: sc.uuid, label: sc.name, selected: sc.uuid === s.scene }))
      ],
      sceneDoc: scene ? { uuid: scene.uuid, name: scene.name } : null,
      ownBanner: !!s.banner.img
    });
  }

  if (sec === "armies") {
    const b = { odds: s.odds, favors: s.favors, alliedMods: s.allied.mods, enemyMods: s.enemy.mods, alliedCustom: s.allied.custom, enemyCustom: s.enemy.custom };
    Object.assign(out, {
      firstChargeChoices: choices(cfg.firstChargeModes, s.firstCharge, "PDVF.Battle.FirstCharge"),
      sides: ["allied", "enemy"].map(side => {
        const a = s[side];
        const modifier = R.commanderModifier(side, b, cfg);
        return {
          side, label: L(`PDVF.Battle.Side.${side}`), data: a,
          battleLabel: a.battle === null ? "2D6+10" : formatValue(a.battle),
          modifier: signedLabel(modifier),
          effective: a.battle === null ? "" : formatValue(a.battle + modifier),
          mods: Object.keys(cfg.commanderMods).map(id => ({ id, label: L(`PDVF.Battle.Mod.${id}`), checked: a.mods.includes(id), value: signedLabel(cfg.commanderMods[id].mod) })),
          modsName: `mods.${side}`,
          custom: a.custom.map((c, i) => ({ ...c, index: i, path: `system.${side}.custom.${i}` })),
          customPath: `system.${side}.custom`,
          forcedChoices: choices(cfg.outcomes, a.forced, "PDVF.Outcome", { empty: L("PDVF.Battle.RollIt") }),
          forcedEffect: a.forced ? L(`PDVF.Battle.ArmyResult.${side}.${a.forced}`) : ""
        };
      }),
      conditions: s.conditions.map((c, i) => ({
        ...c, index: i, path: `system.conditions.${i}`, range: rangeLabel(c),
        effectRows: effectRows(c.effects, `system.conditions.${i}.effects`, s)
      }))
    });
  }

  if (sec === "conroi") {
    const users = (game.users?.contents ?? []).filter(u => !u.isGM);
    Object.assign(out, {
      playerChoices: [{ value: "", label: L("PDVF.Battle.GmPlays"), selected: !s.conroi.commanderPlayer },
        ...users.map(u => ({ value: u.id, label: u.name, selected: u.id === s.conroi.commanderPlayer }))]
    });
  }

  if (sec === "deck") {
    const card = (e, i) => {
      let npc = null;
      try { npc = e.npc ? fromUuidSync(e.npc) : null; } catch (err) { npc = null; }
      return {
        ...e, index: i, path: `system.encounters.${i}`,
        img: e.img || (e.kind === "opportunity" ? "systems/pendragon-vf/icons/types/opportunity.svg" : "systems/pendragon-vf/icons/types/encounter.svg"),
        range: rangeLabel(e), limited: !!(e.from || e.to),
        npcName: npc?.name ?? (e.npc ? L("PDVF.Battle.MissingActor") : ""), npcUuid: e.npc,
        kvLabel: kvLabel(e.kv), countLabel: e.fixedCount ? String(e.fixedCount) : `×${String(e.perKnight).replace(".", ",")}`
      };
    };
    const rows = s.encounters.map(card);
    Object.assign(out, {
      deckOpponents: rows.filter(e => e.kind === "opponent"),
      deckOpportunities: rows.filter(e => e.kind === "opportunity")
    });
  }

  if (sec === "rounds") {
    const max = s.maxRounds;
    const eventAt = (r) => s.events.findIndex(e => e.round === r);
    const eventView = (e, i) => ({
      ...e, index: i, path: `system.events.${i}`,
      triggerChoices: choices(cfg.eventTriggers, e.trigger, "PDVF.Battle.Trigger"),
      durationChoices: choices(cfg.eventDurations, e.duration, "PDVF.Battle.Duration"),
      isCustom: e.trigger === "custom", isUntil: e.duration === "until",
      knightChoices: knightOptions(e.knights), hasKnights: s.knights.length > 0,
      effectRows: effectRows(e.effects, `system.events.${i}.effects`, s),
      previewId: `pdvf-ev-${i}`
    });
    out.roundCards = Array.from({ length: max }, (_, n) => {
      const round = n + 1;
      const i = eventAt(round);
      const conds = s.conditions.filter(c => R.activeAt(c, round)).map(c => c.label).filter(Boolean);
      const cards = s.encounters.filter(e => (e.from || e.to) && R.activeAt(e, round)).map(e => e.name);
      return { round, event: i >= 0 ? eventView(s.events[i], i) : null, conditions: conds.join(" · "), limitedCards: cards.join(" · ") };
    });
    out.extraEvents = s.events.map((e, i) => ({ e, i })).filter(({ e }) => e.round > max).map(({ e, i }) => eventView(e, i));
    out.tables = s.tables.map((t, ti) => ({
      ...t, index: ti, path: `system.tables.${ti}`,
      triggerChoices: choices(cfg.tableTriggers, t.trigger, "PDVF.Battle.TableTrigger"),
      rows: t.rows.map((r, ri) => ({
        ...r, index: ri, path: `system.tables.${ti}.rows.${ri}`,
        subChoices: [{ value: "", label: "—", selected: !r.table },
          ...s.tables.filter(x => x.id !== t.id).map(x => ({ value: x.id, label: x.name || L("PDVF.Battle.Table"), selected: x.id === r.table }))],
        effectRows: effectRows(r.effects, `system.tables.${ti}.rows.${ri}.effects`, s)
      }))
    }));
  }

  if (sec === "outcome") {
    const o = s.outcome;
    Object.assign(out, {
      resultChoices: choices(cfg.results.map(r => r.id), o.result, "PDVF.Battle.Result", { empty: L("PDVF.Battle.ResultAuto") }),
      lootChoices: choices(cfg.lootModes, o.loot.mode, "PDVF.Battle.LootMode"),
      lootFixed: o.loot.mode === "fixed",
      bonuses: o.bonuses.map((b, i) => ({ ...b, index: i, path: `system.outcome.bonuses.${i}`, knightChoices: knightOptions(b.knights) })),
      hasKnights: s.knights.length > 0
    });
  }
  return out;
}

export { request, perform };
