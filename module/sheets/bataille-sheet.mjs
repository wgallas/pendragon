import { PDVF, SYSTEM_ID } from "../config.mjs";
import * as R from "../rules/battle.mjs";
import { formatValue } from "../rules/resolution.mjs";
import { request, perform, knightActor, findEncounter, candidates, onField, summary, moralePassion, showToPlayers } from "../battle/engine.mjs";
import * as client from "../battle/client.mjs";
import { placeEnemies, removeEnemies } from "../battle/tokens.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;
const L = (k) => game.i18n.localize(k);
const F = (k, d) => game.i18n.format(k, d);

const ARRAY_PATHS = ["system.knights", "system.events"];
const NULLABLE = ["system.intensity", "system.rounds", "system.allied.battle", "system.enemy.battle", "system.conroi.commanderBattle"];
const STEPS = ["define", "charge", "intensity", "battle", "select", "posture", "resolve", "squire"];
const STATUSES = ["field", "rear", "escort", "alone", "left", "dead", "captured"];
const ROLES = ["none", "conroi", "division", "army"];

/**
 * Fiche de bataille : préparation (MJ), conduite pas à pas (MJ et joueurs), bilan.
 */
export class BatailleSheet extends HandlebarsApplicationMixin(ItemSheetV2) {

  _tab = null;

  static DEFAULT_OPTIONS = {
    classes: [SYSTEM_ID, "pdvf-sheet", "pdvf-battle-sheet"],
    position: { width: 980, height: 860 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      tab: BatailleSheet.#onTab,
      gm: BatailleSheet.#onGm,
      player: BatailleSheet.#onPlayer,
      openActor: BatailleSheet.#onOpenActor,
      addEvent: BatailleSheet.#onAddEvent,
      deleteEvent: BatailleSheet.#onDeleteEvent,
      place: BatailleSheet.#onPlace,
      unplace: BatailleSheet.#onUnplace,
      show: BatailleSheet.#onShow,
      missile: BatailleSheet.#onMissile,
      rollIntensity: BatailleSheet.#onRollIntensity
    }
  };

  static PARTS = {
    sheet: { template: `systems/${SYSTEM_ID}/templates/item/bataille/sheet.hbs`, scrollable: [".pdvf-battle-body"] }
  };

  get title() { return this.document.name; }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const view = battleView(this.document, game.user);
    if (!this._tab) this._tab = view.phase === "prep" ? "prep" : view.phase === "done" ? "results" : "conduct";
    view.tab = this._tab;
    view.tabIs = { [this._tab]: true };
    view.tabs = ["prep", "conduct", "results", "log"].map(id => ({ id, label: L(`PDVF.Battle.Tab.${id}`), active: id === this._tab }));
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
  }

  async #onDrop(event) {
    if (!game.user.isGM) return;
    const TE = foundry.applications.ux.TextEditor.implementation;
    const data = TE.getDragEventData(event);
    if (!data?.uuid) return;
    const doc = await fromUuid(data.uuid);
    if (!doc) return;
    if (doc.documentName === "Actor" && doc.type === "chevalier") return request(this.document, "addKnight", { uuid: doc.uuid });
    if (doc.documentName === "Item" && doc.type === "rencontre") return request(this.document, "addEncounter", { data: doc.toObject(), source: doc.uuid });
    if (doc.documentName === "Actor" && doc.type === "pnj") {
      // Un PNJ glissé : une rencontre simple contre lui (une par chevalier).
      const data2 = { name: doc.name, system: { kind: "opponent", npc: doc.uuid, glory: doc.system.gloryReward ?? 0, perKnight: 1, kv: 1, moraleLoss: "1D6", moraleMin: 10 } };
      const full = new Item.implementation({ name: doc.name, type: "rencontre", system: data2.system }).toObject();
      return request(this.document, "addEncounter", { data: full, source: doc.uuid });
    }
  }

  _processFormData(event, form, formData) {
    const data = super._processFormData(event, form, formData);
    const flat = foundry.utils.flattenObject(data);
    for (const [k, v] of Object.entries(flat)) {
      if (v === null && !NULLABLE.includes(k) && !/^system\.knights\.\d+\.passion$/.test(k) && k !== "img") foundry.utils.setProperty(data, k, 0);
    }
    // Cases des circonstances (Table 6.2) → listes
    const mods = data.mods;
    delete data.mods;
    if (mods) {
      for (const side of ["allied", "enemy"]) {
        if (!mods[side]) continue;
        foundry.utils.setProperty(data, `system.${side}.mods`, Object.entries(mods[side]).filter(([, v]) => v).map(([id]) => id));
      }
    }
    for (const path of ARRAY_PATHS) {
      const incoming = foundry.utils.getProperty(data, path);
      if (!incoming || Array.isArray(incoming)) continue;
      const rows = foundry.utils.deepClone(foundry.utils.getProperty(this.document._source, path) ?? []);
      for (const [i, row] of Object.entries(incoming)) {
        if (!rows[Number(i)]) continue;
        if ("passion" in row && (row.passion === "" || row.passion === null)) row.passion = null;
        else if ("passion" in row) row.passion = Number(row.passion);
        rows[Number(i)] = foundry.utils.mergeObject(rows[Number(i)], row, { inplace: false });
      }
      foundry.utils.setProperty(data, path, rows);
    }
    return data;
  }

  /* -------------------------------------------- */
  /*  Actions                                      */
  /* -------------------------------------------- */

  static #onTab(event, target) {
    this._tab = target.dataset.tab;
    this.render();
  }

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

  static async #onAddEvent() {
    const rows = foundry.utils.deepClone(this.document._source.system.events);
    rows.push({ round: Math.max(1, this.document.system.state.round || 1), text: "" });
    return this.document.update({ "system.events": rows });
  }

  static async #onDeleteEvent(event, target) {
    const rows = foundry.utils.deepClone(this.document._source.system.events);
    rows.splice(Number(target.dataset.index), 1);
    return this.document.update({ "system.events": rows });
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
  const isCommander = isGM || (!!s.conroi.commander && owns(s.conroi.commander));
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
    roundEvents: s.events.filter(e => e.round === st.round && e.text),
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

export { request, perform };
