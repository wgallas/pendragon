import { PDVF, SYSTEM_ID } from "../config.mjs";
import * as E from "./engine.mjs";
import { winterEvent } from "./events.mjs";
import { formatValue, traitPair } from "../rules/resolution.mjs";
import { formatDenarii } from "../rules/horses.mjs";
import { removeFollower, removeHorse, convertNpcToKnight, resolveFollowers, resolveHorses } from "../documents/followers.mjs";
import * as W from "../rules/winter.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const L = (k) => game.i18n.localize(k);
const F = (k, d) => game.i18n.format(k, d);

/**
 * Assistant de phase d'hiver d'un chevalier (Livre du joueur, chap. 14), en douze étapes.
 * Chaque joueur fait celui de son chevalier ; le MJ suit l'ensemble.
 */
export class WinterWizard extends HandlebarsApplicationMixin(ApplicationV2) {

  constructor(actor, options = {}) {
    super(options);
    this.actor = actor;
    this.wstate = E.getState(actor);
    this.ui = { training: "", key: "" };
  }

  static DEFAULT_OPTIONS = {
    classes: [SYSTEM_ID, "pdvf-wizard", "pdvf-winter"],
    window: { resizable: true, icon: "fa-solid fa-snowflake" },
    position: { width: 940, height: 820 },
    actions: {
      goto: WinterWizard.#onGoto,
      next: WinterWizard.#onNext,
      prev: WinterWizard.#onPrev,
      run: WinterWizard.#onRun,
      tstep: WinterWizard.#onTrainingStep,
      setTraining: WinterWizard.#onSetTraining
    }
  };

  static PARTS = {
    body: { template: `systems/${SYSTEM_ID}/templates/winter/wizard.hbs`, scrollable: [".pdvf-wiz-body"] }
  };

  get title() {
    return F("PDVF.Winter.TitleFor", { name: this.actor.name, year: this.wstate.year });
  }

  /* -------------------------------------------- */
  /*  Contexte                                     */
  /* -------------------------------------------- */

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.actor;
    const st = this.wstate;
    const sys = actor.system;
    const stepId = E.STEPS[st.step];
    const done = this.#doneMap();
    Object.assign(context, {
      actor, st, editable: actor.isOwner,
      steps: E.STEPS.map((id, i) => ({ id, i, number: i + 1, label: L(`PDVF.Winter.Step.${id}`), current: i === st.step, done: done[id] })),
      step: { [stepId]: true }, stepId,
      intro: L(`PDVF.Winter.Intro.${stepId}`),
      isFirst: st.step === 0, isLast: st.step === E.STEPS.length - 1,
      treasury: formatDenarii(sys.economy?.treasury ?? 0), ageNext: E.nextAge(actor, st.year)
    });
    context[stepId] = await this.#stepContext(stepId);
    return context;
  }

  #doneMap() {
    const st = this.wstate;
    return {
      solo: st.step > 0, event: !!st.event?.outcome, xp: !!st.xp?.done, economy: !!st.economy?.done, aging: !!st.aging?.done,
      squire: !!st.followers?.done, horses: !!st.horses?.done, training: st.training.done || st.training.skip,
      glory: st.gloryDone, prestige: st.step > 9, family: !!st.family?.done, end: st.finished
    };
  }

  async #stepContext(id) {
    const actor = this.actor;
    const st = this.wstate;
    const sys = actor.system;
    switch (id) {
      case "event": {
        const e = st.event;
        const ev = e ? winterEvent(e.roll) : null;
        const opts = e ? E.eventOptions(actor, ev).map(k => {
          const real = E.resolveKey(actor, k);
          const r = actor.getRollable(real);
          return { key: k, label: `${r.label} ${formatValue(r.value)}`, selected: k === e.key };
        }) : [];
        const out = E.eventOutcome(e);
        return {
          rolled: !!e, roll: e?.roll, title: ev ? L(`PDVF.Winter.Event.${ev.roll}`) : "", options: opts, noOption: !!e && !opts.length,
          tested: !!e?.outcome, outcomeLabel: e?.outcome ? L(`PDVF.Outcome.${e.outcome}`) : "",
          testedLabel: e?.key ? actor.getRollable(E.resolveKey(actor, e.key))?.label : "",
          opposite: e?.opposite ? `${e.opposite.label} : ${L(`PDVF.Outcome.${e.opposite.outcome}`)}` : "",
          text: out?.text ?? "", active: e?.active !== false, notes: e?.notes ?? [],
          effects: (out?.effects ?? []).map((fx, i) => ({ i, label: effectLabel(actor, fx), applied: e.applied.includes(i), result: e.results[i] ?? "", auto: !fx.note }))
        };
      }
      case "xp": {
        const list = E.xpList(actor);
        return { done: !!st.xp?.done, list: list.map(r => ({ label: r.label, value: formatValue(r.value) })),
          rows: (st.xp?.rows ?? []).map(r => ({ ...r, value: formatValue(r.before) })) };
      }
      case "economy": {
        const info = E.economyInfo(actor);
        const e = st.economy;
        const col = PDVF.winter.upkeep[info.column];
        return {
          ...info, done: !!e?.done, e, levelLabel: e ? L(`PDVF.Living.${e.level}`) : "",
          columnLabel: L(`PDVF.Winter.Column.${info.column}`),
          table: PDVF.winter.upkeepLevels.map((lv, i) => ({ label: L(`PDVF.Living.${lv}`), min: String(col[i]).replace(".", ",") })),
          suggested: info.household ? 0 : info.ordinary,
          poor: e && ["poor", "destitute"].includes(e.level), destitute: e?.level === "destitute",
          effects: e?.effects ?? {}, conLabel: e?.effects?.con ? L(`PDVF.Outcome.${e.effects.con}`) : ""
        };
      }
      case "aging": {
        const a = st.aging;
        return { age: E.nextAge(actor, st.year), from: PDVF.winter.agingFrom, done: !!a?.done, a, unknown: !sys.biography.born,
          losses: a?.losses ? Object.entries(a.losses).map(([k, n]) => `${L(`PDVF.Char.${k}.long`)} −${n}`).join(", ") : "" };
      }
      case "squire": {
        const rows = E.followerRows(actor, st.year);
        const f = st.followers;
        return {
          has: rows.length > 0, done: !!f?.done,
          rows: rows.map(r => {
            const res = f?.rows?.find(x => x.uuid === r.uuid);
            return { ...r, res, decided: f?.decisions?.[r.uuid] ?? "",
              departureLabel: res?.departure ? L(`PDVF.Winter.DepartureResult.${res.departure}`) : "",
              leaves: res?.leaves || (res?.departure && res.departure !== "stays") };
          })
        };
      }
      case "horses": {
        const rows = E.horseRows(actor);
        const h = st.horses;
        return { has: rows.length > 0, done: !!h?.done,
          rows: rows.map(r => { const res = h?.rows?.find(x => x.uuid === r.uuid); return { ...r, res, effectLabel: res?.effect ? L(`PDVF.Winter.HorseEffect.${res.effect}`) : "", testLabel: res?.test ? L(`PDVF.Outcome.${res.test}`) : "" }; }) };
      }
      case "training": {
        const tr = st.training;
        const age = E.nextAge(actor, st.year);
        const choice = this.ui.training;
        const s = sys;
        const skillRows = Object.keys(PDVF.skills).map(id => ({ id, label: L(`PDVF.Skill.${id}`), value: s.skills[id].value,
          room15: Math.max(0, PDVF.winter.trainingSkillCap - s.skills[id].value), room20: Math.max(0, PDVF.winter.trainingSkillMax - s.skills[id].value) }))
          .sort((a, b) => a.label.localeCompare(b.label, "fr"));
        return {
          tr, skip: tr.skip, done: tr.done, bonus: tr.bonus, points: PDVF.winter.trainingSkillPoints,
          choices: ["trait", "passion", "char", "embonpoint", "skills", "skill20"].map(c => ({ id: c, label: L(`PDVF.Winter.Training.${c}`), selected: c === choice,
            disabled: (c === "char" && age !== null && age > PDVF.winter.trainingCharMaxAge) || (c === "embonpoint" && W.embonpointLevel(s.biography.distinctiveFeatures, PDVF.winter) >= 3) })),
          is: { [choice]: true }, hasChoice: !!choice,
          traitOptions: PDVF.traits.flatMap(id => ["left", "right"].map(side => {
            const key = `trait.${id}.${side}`; const r = actor.getRollable(key);
            return { key, label: `${r.label} ${formatValue(r.value)}`, disabled: traitPair(s.traits[id].value)[side] >= PDVF.winter.trainingTraitMax };
          })),
          passionOptions: s.passions.map((p, i) => ({ key: `passion.${i}`, label: `${p.name} ${formatValue(p.value)} (${L(`PDVF.Court.${p.court}`)})`, index: i })),
          charOptions: PDVF.winter.trainingChars.map(k => ({ key: k, label: `${L(`PDVF.Char.${k}.long`)} ${s.characteristics[k].value}` })),
          lowSkills: skillRows.filter(r => r.value < PDVF.winter.trainingSkillCap),
          highSkills: skillRows.filter(r => r.value >= PDVF.winter.trainingSkillCap && r.value < PDVF.winter.trainingSkillMax),
          allSkills: skillRows,
          embonpoint: PDVF.winter.embonpoint[W.embonpointLevel(s.biography.distinctiveFeatures, PDVF.winter)]?.feature ?? ""
        };
      }
      case "glory": {
        const rows = E.gloryRows(actor, st);
        return { rows, total: rows.reduce((a, r) => a + r.value, 0), done: st.gloryDone, current: sys.gloryTotal };
      }
      case "prestige": {
        return {
          available: E.prestigeAvailable(actor), uses: st.prestige.uses, guarantee: st.prestige.guarantee,
          raiseOptions: actor.listRollables().filter(r => r.kind !== "glory").map(r => ({ key: r.key, label: `${r.label} ${formatValue(r.value)}` })),
          lowerOptions: actor.listRollables().filter(r => r.kind === "passion").map(r => ({ key: r.key, label: `${r.label} ${formatValue(r.value)}` })),
          gloryFirst: !st.gloryDone
        };
      }
      case "family": {
        const info = E.familyInfo(actor, st);
        const f = st.family;
        return { ...info, done: !!f?.done, f, sure: st.conception.sure, guarantee: st.prestige.guarantee ? L(`PDVF.Winter.GuaranteeSex.${st.prestige.guarantee}`) : "",
          spouse: sys.family.spouse, children: sys.family.children.map(c => ({ ...c, sexLabel: L(`PDVF.Winter.Sex.${c.sex}`), age: c.born !== null ? st.year - c.born : null })) };
      }
      case "end": {
        const done = this.#doneMap();
        return { missing: E.STEPS.slice(1, -1).filter(id => !done[id] && !["prestige", "solo"].includes(id)).map(id => L(`PDVF.Winter.Step.${id}`)).join(", "), finished: st.finished };
      }
    }
    return {};
  }

  /* -------------------------------------------- */
  /*  Actions                                      */
  /* -------------------------------------------- */

  async #save() {
    if (this.actor.isOwner) await E.saveState(this.actor, this.wstate);
  }

  static async #onGoto(event, target) {
    this.wstate.step = Number(target.dataset.step);
    await this.#save();
    this.render();
  }

  static async #onNext() {
    this.wstate.step = Math.min(E.STEPS.length - 1, this.wstate.step + 1);
    await this.#save();
    this.render();
  }

  static async #onPrev() {
    this.wstate.step = Math.max(0, this.wstate.step - 1);
    this.render();
  }

  /** Boutons − et + des points de compétences : bornés par le budget restant et le plafond de chaque compétence. */
  static #onTrainingStep(event, target) {
    const input = target.parentElement.querySelector("input");
    const kind = "points" in input.dataset ? "points" : "bonus";
    const value = Math.max(0, Math.min(Number(input.dataset.cap) || 0, (Number(input.value) || 0) + Number(target.dataset.delta)));
    const others = this.#spent(kind) - (Number(input.value) || 0);
    const budget = Number(this.element.querySelector(`[data-remaining="${kind}"]`)?.dataset.budget) || 0;
    input.value = Math.min(value, Math.max(0, budget - others));
    this.#refreshTraining();
  }

  #spent(kind) {
    return [...this.element.querySelectorAll(`[data-${kind}]`)].filter(el => el.tagName === "INPUT").reduce((a, el) => a + (Number(el.value) || 0), 0);
  }

  /** Points restants affichés, boutons grisés aux limites. */
  #refreshTraining() {
    for (const kind of ["points", "bonus"]) {
      const box = this.element.querySelector(`[data-remaining="${kind}"]`);
      if (!box) continue;
      const left = (Number(box.dataset.budget) || 0) - this.#spent(kind);
      box.querySelector("strong").textContent = left;
      for (const input of this.element.querySelectorAll(`input[data-${kind}]`)) {
        const [minus, plus] = input.parentElement.querySelectorAll("button");
        const v = Number(input.value) || 0;
        minus.disabled = v <= 0;
        plus.disabled = left <= 0 || v >= (Number(input.dataset.cap) || 0);
      }
    }
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    this.#refreshTraining();
  }

  static #onSetTraining(event, target) {
    this.ui.training = target.dataset.value;
    this.render();
  }

  /** Une opération d'une étape. Les champs de la même zone (data-group) sont lus au moment du clic. */
  static async #onRun(event, target) {
    if (!this.actor.isOwner) return;
    const op = target.dataset.op;
    const group = target.closest("[data-group]") ?? this.element;
    const val = (name) => group.querySelector(`[name="${name}"]`)?.value ?? "";
    const actor = this.actor;
    const st = this.wstate;
    target.disabled = true;
    try {
      switch (op) {
        case "rollEvent": await E.rollEvent(actor, st); break;
        case "rerollEvent": st.event = null; await E.rollEvent(actor, st); break;
        case "testEvent": await E.testEvent(actor, st, target.dataset.key || val("key")); break;
        case "effect": await E.applyEventEffect(actor, st, Number(target.dataset.index)); break;
        case "xp": await E.rollExperience(actor, st); break;
        case "upkeep": await E.payUpkeep(actor, st, { spend: Number(String(val("spend")).replace(",", ".")), income: Number(String(val("income")).replace(",", ".")) }); break;
        case "poverty": await E.povertyEffect(actor, st, target.dataset.kind); break;
        case "aging": await E.rollAging(actor, st); break;
        case "followers": await E.rollFollowers(actor, st); break;
        case "decide": await this.#decide(target.dataset.uuid, target.dataset.decision); break;
        case "horses": await E.rollHorses(actor, st); break;
        case "removeHorse": {
          const h = resolveHorses(actor).find(x => x.uuid === target.dataset.uuid);
          if (h) await removeHorse(actor, h.index);
          break;
        }
        case "training": {
          const choice = this.ui.training;
          const data = { key: val("key"), delta: Number(val("delta")) || 1, lower: val("lower"), points: {}, bonus: {} };
          for (const el of group.querySelectorAll("[data-points]")) data.points[el.dataset.points] = Number(el.value) || 0;
          for (const el of group.querySelectorAll("[data-bonus]")) data.bonus[el.dataset.bonus] = Number(el.value) || 0;
          const err = await E.applyTraining(actor, st, choice, data);
          if (err) ui.notifications.warn(err);
          break;
        }
        case "glory": await E.recordGlory(actor, st); break;
        case "prestige": await E.usePrestige(actor, st, target.dataset.kind, { key: val("key"), sex: val("sex") }); break;
        case "family": await E.rollFamily(actor, st, { conceive: group.querySelector('[name="conceive"]')?.checked ?? true }); break;
        case "finish":
          st.finished = true;
          await postFinished(actor, st);
          break;
      }
      await this.#save();
    } finally {
      if (this.rendered) this.render();
    }
  }

  /** Écuyer de 21 ans : adoubé, gardé comme esquire ou laissé partir ; départ d'un suivant. */
  async #decide(uuid, decision) {
    const actor = this.actor;
    const npc = fromUuidSync(uuid);
    const f = resolveFollowers(actor).find(x => x.uuid === uuid);
    if (!npc || !f) return;
    this.wstate.followers.decisions ??= {};
    if (decision === "knight") await convertNpcToKnight(npc);
    if (decision === "esquire") await E.updateLinked(actor, npc, { "system.squire.esquire": true });
    if (decision === "leave" || decision === "knight") await removeFollower(actor, f.index);
    if (decision === "pay") {
      const t = Number(actor.system.economy.treasury) || 0;
      await actor.update({ "system.economy.treasury": t - PDVF.winter.esquireUpkeep * 240 });
    }
    this.wstate.followers.decisions[uuid] = decision;
  }
}

/** Texte d'un bouton d'effet. */
function effectLabel(actor, fx) {
  if (fx.glory !== undefined) return F("PDVF.Winter.Fx.Glory", { value: E.gloryValue(actor, fx.glory) });
  if (fx.pounds !== undefined) return F(fx.pounds > 0 ? "PDVF.Winter.Fx.Gain" : "PDVF.Winter.Fx.Pay", { value: Math.abs(fx.pounds) });
  if (fx.honor !== undefined) return F("PDVF.Winter.Fx.Honor", { value: fx.honor });
  if (fx.passion) return F("PDVF.Winter.Fx.Passion", { value: fx.passion.delta > 0 ? `+${fx.passion.delta}` : fx.passion.delta, name: L(`PDVF.Winter.PassionName.${fx.passion.match}`) });
  if (fx.check) return L("PDVF.Winter.Fx.Check");
  if (fx.duel) return L("PDVF.Winter.Fx.Duel");
  if (fx.test) return F("PDVF.Winter.Fx.Test", { label: actor.getRollable(fx.test.key)?.label ?? "", mod: fx.test.mod ? ` ${fx.test.mod > 0 ? "+" : "−"}${Math.abs(fx.test.mod)}` : "" });
  if (fx.wound) return F("PDVF.Winter.Fx.WoundLabel", { value: fx.wound });
  if (fx.training) return F("PDVF.Winter.Fx.Training", { value: fx.training });
  if (fx.skipTraining) return L("PDVF.Winter.Fx.Skip");
  if (fx.conception !== undefined) return L("PDVF.Winter.Fx.Conception");
  if (fx.pair) return L("PDVF.Winter.Fx.Pair");
  if (fx.note) return L(`PDVF.Winter.Note.${fx.note}`);
  return "";
}

async function postFinished(actor, st) {
  await E.postLines(actor, F("PDVF.Winter.FinishedTitle", { year: st.year }), [F("PDVF.Winter.FinishedLine", { name: actor.name })]);
}

/** Ouvre l'assistant d'hiver d'un chevalier (un seul par chevalier). */
export function openWinterWizard(actor) {
  if (!E.winterYear()) return ui.notifications.warn(L("PDVF.Winter.Notify.NoWinter"));
  for (const app of foundry.applications.instances?.values?.() ?? []) {
    if (app instanceof WinterWizard && app.actor === actor) { app.render({ force: true }); app.bringToFront?.(); return app; }
  }
  const w = new WinterWizard(actor);
  w.render({ force: true });
  return w;
}
