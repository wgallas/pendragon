import { PDVF, SYSTEM_ID } from "../config.mjs";
import * as R from "./rules.mjs";
import { generateFamily } from "../family/generator.mjs";
import { familyView } from "../family/view.mjs";
import { applyFamilyHistory } from "../family/apply.mjs";
import { traitPair, formatValue } from "../rules/resolution.mjs";
import { signed } from "../dice/tests.mjs";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;
const DRAFT = "creationDraft";
const CHARS = ["siz", "dex", "str", "con", "app"];

const L = (k) => game.i18n.localize(k);
const opt = (value, label, selected) => ({ value, label: L(label), selected: value === selected });

/**
 * Assistant de création de personnage, en huit étapes, d'après le chapitre 3
 * du Livre du joueur. Le brouillon est conservé sur l'acteur entre deux ouvertures.
 */
export class CreationWizard extends HandlebarsApplicationMixin(ApplicationV2) {

  constructor(actor, options = {}) {
    super(options);
    this.actor = actor;
    const draft = actor.getFlag(SYSTEM_ID, DRAFT);
    this.state = draft?.version ? foundry.utils.deepClone(draft) : R.defaultState(this.C);
  }

  /** Données de création (extensibles par les suppléments). */
  get C() {
    return CONFIG.PDVF.creation;
  }

  get year() {
    return game.settings.get(SYSTEM_ID, "currentYear");
  }

  static DEFAULT_OPTIONS = {
    classes: [SYSTEM_ID, "pdvf-wizard"],
    window: { title: "PDVF.Wizard.Title", resizable: true, icon: "fa-solid fa-feather-pointed" },
    position: { width: 980, height: 860 },
    actions: {
      goto: CreationWizard.#onGoto,
      next: CreationWizard.#onNext,
      prev: CreationWizard.#onPrev,
      inc: CreationWizard.#onInc,
      roll: CreationWizard.#onRoll,
      setMethod: CreationWizard.#onSetMethod,
      addPassion: CreationWizard.#onAddPassion,
      removePassion: CreationWizard.#onRemovePassion,
      familyReroll: CreationWizard.#onFamilyReroll,
      familyChoose: CreationWizard.#onFamilyChoose,
      reset: CreationWizard.#onReset,
      finish: CreationWizard.#onFinish
    }
  };

  static PARTS = {
    body: { template: `systems/${SYSTEM_ID}/templates/creation/wizard.hbs`, scrollable: [".pdvf-wiz-body"] }
  };

  get title() {
    return game.i18n.format("PDVF.Wizard.TitleFor", { name: this.actor.name });
  }

  /* -------------------------------------------- */
  /*  Contexte                                     */
  /* -------------------------------------------- */

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const s = this.state;
    const C = this.C;
    const stepId = R.STEPS[s.step];
    const o = R.resolveOrigin(s, C);
    const validation = R.validateStep(stepId, s, C);

    // Les étapes précédentes doivent être valides pour avancer au-delà.
    let reachable = 0;
    while (reachable < R.STEPS.length - 1 && !R.validateStep(R.STEPS[reachable], s, C).errors.length) reachable++;

    Object.assign(context, {
      state: s,
      stepId,
      isRandom: s.method === "random",
      isBuilt: s.method === "built",
      steps: R.STEPS.map((id, i) => ({
        id, i, number: i + 1, label: L(`PDVF.Wizard.Step.${id}`),
        current: i === s.step, done: i < s.step, reachable: i <= reachable
      })),
      isFirst: s.step === 0,
      isLast: s.step === R.STEPS.length - 1,
      errors: validation.errors,
      warnings: validation.warnings,
      canNext: !validation.errors.length,
      step: { [stepId]: true }
    });
    Object.assign(context, this[`_ctx_${stepId}`](s, C, o));
    return context;
  }

  _ctx_origin(s, C, o) {
    const fnList = Object.entries(C.functions).map(([id, f]) => opt(id, f.label, s.origin.fn));
    const classList = o.fn.classes.map(id => opt(id, C.classes[id].label, o.klassId));
    const cultureList = Object.entries(C.cultures).map(([id, c]) => opt(id, c.label, s.origin.culture));
    const homelandList = (o.culture.homelands ?? []).map(id => opt(id, C.homelands[id].label, o.homelandId));
    const religionList = (o.culture.religions ?? []).map(r => opt(r.id, PDVF.religions[r.id]?.label ?? r.id, o.religionId));
    const titles = o.fn.title ?? { male: "sire", female: "dame" };
    return {
      fnList, classList, cultureList, homelandList, religionList,
      sexList: [
        { value: "male", label: L(`PDVF.Title.${titles.male}`), selected: s.origin.sex !== "female" },
        { value: "female", label: L(`PDVF.Title.${titles.female}`), selected: s.origin.sex === "female" }
      ],
      homelandInfo: o.homeland ? { lord: o.homeland.lord, home: o.homeland.home } : null
    };
  }

  _ctx_characteristics(s, C, o) {
    const b = C.budgets;
    const base = R.baseCharacteristics(s);
    const at14 = R.characteristicsAt14(s, C);
    const rows = CHARS.map(c => ({
      id: c, abbr: L(`PDVF.Char.${c}.abbr`), long: L(`PDVF.Char.${c}.long`),
      base: base?.[c] ?? "—",
      mod: o.culture.modifiers?.[c] ? signed(o.culture.modifiers[c]) : "",
      final: at14?.[c] ?? "—",
      max: o.culture.maxima?.[c],
      path: `chars.built.${c}`, min: b.characteristicMin, maxBuilt: b.characteristicMax,
      dice: o.culture.characteristics?.[c]
    }));
    const spent = Object.values(s.chars.built).reduce((a, v) => a + v, 0);
    const d = R.derivedFrom(at14);
    return {
      charRows: rows,
      charSpent: spent, charBudget: b.characteristics, charLeft: b.characteristics - spent,
      rolled: !!s.chars.rolled,
      derived: d ? [
        ["knockdown", d.knockdown], ["majorWound", d.majorWound], ["damage", d.damage], ["brawlDamage", d.brawl],
        ["move", d.move], ["hpMax", d.hp], ["unconscious", d.unconscious], ["healRate", d.healRate]
      ].map(([id, v]) => ({ label: L(`PDVF.Derived.${id}.label`), value: v })) : null
    };
  }

  _ctx_traits(s, C, o) {
    const virtues = new Set(o.religion.virtues ?? []);
    const after = R.traitsAfterCreation(s, C);
    const b = C.budgets;
    const side = (id, sideId, value) => ({
      key: `${id}.${sideId}`, label: L(`PDVF.Trait.${id}.${sideId}`), value,
      virtue: virtues.has(`${id}.${sideId}`),
      famous: s.traits.famous === `${id}.${sideId}`,
      points: s.traits.points[`${id}.${sideId}`] ?? 0,
      path: `traits.points.${id}.${sideId}`
    });
    const rows = PDVF.traits.map(id => {
      const pair = after ? traitPair(after[id]) : { left: "—", right: "—" };
      return { id, left: side(id, "left", pair.left), right: side(id, "right", pair.right) };
    });
    const spent = Object.values(s.traits.points).reduce((a, v) => a + (Number(v) || 0), 0);
    return {
      traitRows: rows, rolled: !!s.traits.rolled,
      traitSpent: spent, traitBudget: b.traitPoints, traitLeft: b.traitPoints - spent,
      religionLabel: L(o.religion.label ?? "")
    };
  }

  _ctx_passions(s, C) {
    const rows = R.passionRows(s, C).map(r => ({
      ...r,
      courtLabel: r.court ? L(`PDVF.Court.${r.court}`) : "",
      path: `passions.points.${r.key}`,
      index: r.extra ? Number(r.key.split(".")[1]) : null,
      courtChoices: PDVF.passionCourts.map(c => ({ value: c, label: L(`PDVF.Court.${c}`), selected: c === r.court }))
    }));
    const pool = R.passionPool(s, C);
    const spent = Object.values(s.passions.points).reduce((a, v) => a + (Number(v) || 0), 0);
    const courts = PDVF.passionCourts.map(c => {
      const total = rows.filter(r => r.court === c).reduce((a, r) => a + (r.afterCreation ?? 0), 0);
      return { label: L(`PDVF.Court.${c}`), total, over: total > PDVF.passionCourtMax };
    });
    return {
      passionRows: rows, rolled: !!s.passions.rolled,
      passionPool: pool, passionSpent: spent, passionLeft: pool - spent, passionMax: C.budgets.passionMax, courts
    };
  }

  _ctx_family(s, C, o) {
    const f = s.family;
    const allowHistory = !!o.homeland?.familyHistory;
    if (!allowHistory && f.mode === "history") f.mode = "quick";
    if (f.mode === "history" && !f.proposals) f.proposals = [generateFamily(), generateFamily(), generateFamily()];
    const age = R.ageOf(s);
    return {
      allowHistory,
      familyModes: [
        ...(allowHistory ? [{ value: "history", label: L("PDVF.Wizard.Family.history"), checked: f.mode === "history" }] : []),
        { value: "quick", label: L("PDVF.Wizard.Family.quick"), checked: f.mode === "quick" },
        { value: "manual", label: L("PDVF.Wizard.Family.manual"), checked: f.mode === "manual" }
      ],
      modeHistory: f.mode === "history", modeQuick: f.mode === "quick", modeManual: f.mode === "manual",
      proposals: f.mode === "history" ? f.proposals.map((r, i) => ({ ...familyView(r, i), chosen: f.chosen === i })) : [],
      ageMismatch: f.mode === "history" && this.year - age !== 487,
      quickParentGlory: f.quickParentGlory,
      inherited: R.inheritedGlory(s)
    };
  }

  _ctx_skills(s, C) {
    const rows = R.skillRows(s, C);
    const family = R.familyTraitResult(s, C);
    const mapRow = (r) => ({
      ...r, label: L(`PDVF.Skill.${r.id}`), path: `skills.points.${r.id}`,
      formulaLabel: typeof r.formula === "number" ? "" : L(`PDVF.Wizard.Formula.${r.formula}`),
      locked: r.start === 0
    });
    const spent = Object.values(s.skills.points).reduce((a, v) => a + (Number(v) || 0), 0);
    const byLabel = (a, b) => a.label.localeCompare(b.label, "fr");
    return {
      skillTables: [
        { title: L("PDVF.Section.Skills"), rows: rows.filter(r => r.group === "general").map(mapRow).sort(byLabel) },
        { title: L("PDVF.Section.CombatSkills"), rows: rows.filter(r => r.group === "combat").map(mapRow).sort(byLabel) }
      ],
      familyChoices: C.familyTraits.filter(t => !t.gifted).map(t => ({
        value: String(t.r), label: `${t.label} (+${C.familyTraitBonus} ${L(`PDVF.Skill.${t.skill}`)})`, selected: String(s.familyTrait.id) === String(t.r)
      })),
      familyResult: family ? `${family.label}${family.skills.length ? ` : +${C.familyTraitBonus} en ${family.skills.map(id => L(`PDVF.Skill.${id}`)).join(" et ")}` : ""}` : "",
      skillSpent: spent, skillBudget: C.budgets.skillPoints, skillLeft: C.budgets.skillPoints - spent,
      skillMax: C.budgets.skillMax
    };
  }

  _ctx_apprentice(s, C, o) {
    const a = s.apprentice;
    const b = C.budgets;
    const skills = R.skillRows(s, C).map(r => ({
      id: r.id, label: L(`PDVF.Skill.${r.id}`), value: r.final, points: a.skills[r.id] ?? 0,
      path: `apprentice.skills.${r.id}`, locked: r.start === 0, knight: r.knight
    })).sort((x, y) => (y.knight - x.knight) || x.label.localeCompare(y.label, "fr"));
    const traits = R.finalTraits(s, C);
    const traitItems = PDVF.traits.flatMap(id => ["left", "right"].map(side => ({
      label: L(`PDVF.Trait.${id}.${side}`), value: traits ? traitPair(traits[id])[side] : "—",
      points: a.traits[`trait.${id}.${side}`] ?? 0, path: `apprentice.traits.trait.${id}.${side}`
    })));
    const passionItems = R.passionRows(s, C).map(r => ({
      label: r.name, value: r.final ?? "—", points: r.apprentice, path: `apprentice.traits.passion.${r.key}`
    }));
    const finalCh = R.finalCharacteristics(s, C);
    const charItems = CHARS.map(c => ({
      label: L(`PDVF.Char.${c}.long`), value: finalCh?.[c] ?? "—", max: o.culture.maxima?.[c],
      points: a.chars[c] ?? 0, path: `apprentice.chars.${c}`
    }));
    const k = R.knighthoodCheck(s, C);
    const used = (obj) => Object.values(obj).reduce((x, v) => x + (Number(v) || 0), 0);
    return {
      yearChoices: Array.from({ length: b.apprenticeYears + 1 }, (_, i) => ({ value: i, label: `${i} (${14 + i} ans)`, selected: Number(a.years) === i })),
      alloc: a.alloc,
      allocated: used(a.alloc), years: Number(a.years) || 0,
      skillPool: (Number(a.alloc.skills) || 0) * b.apprenticeSkillPoints, skillUsed: used(a.skills),
      traitPool: Number(a.alloc.traits) || 0, traitUsed: used(a.traits),
      charPool: Number(a.alloc.chars) || 0, charUsed: used(a.chars),
      appSkills: skills, appTraits: traitItems, appPassions: passionItems, appChars: charItems,
      knight: {
        ...k,
        weapons: k.weapons.map(w => ({ ...w, label: L(`PDVF.Skill.${w.id}`) })),
        others: k.others.map(w => ({ ...w, label: L(`PDVF.Skill.${w.id}`) }))
      }
    };
  }

  _ctx_details(s, C, o) {
    const need = R.featureNeeds(s, C);
    const count = need ? need.positive + need.negative : 0;
    const features = Array.from({ length: count }, (_, i) => ({
      index: i, value: s.details.features?.[i] ?? "",
      kind: i < need.positive ? "positive" : "negative",
      kindLabel: L(i < need.positive ? "PDVF.Wizard.Details.positive" : "PDVF.Wizard.Details.negative")
    }));
    const k = R.knighthoodCheck(s, C);
    const kg = R.knightingGlory(s, C);
    const ideals = R.eligibleIdeals(s, C);
    const luck = s.details.luck ? C.luck.find(l => l.r === s.details.luck) : null;
    const age = R.ageOf(s);
    const jump = s.details.jump;
    return {
      featureNeed: need, features, featureExamples: C.featureExamples,
      eligible: k.eligible,
      knighted: s.details.knighted && k.eligible,
      kg,
      ideals: [{ value: "", label: L("PDVF.Wizard.Details.noIdeal"), selected: !s.details.ideal },
        ...ideals.map(i => ({ value: i.label, label: i.label, selected: s.details.ideal === i.label }))],
      jump: jump ? { ...jump, outcomeLabel: L(`PDVF.Outcome.${jump.outcome}`) } : null,
      luck,
      summary: {
        name: `${L(`PDVF.Title.${s.origin.sex === "female" ? (o.fn.title?.female ?? "dame") : (o.fn.title?.male ?? "sire")}`)} ${s.origin.name}`,
        age, born: this.year - age,
        klass: k.eligible && s.details.knighted ? L(o.klass.label) : L("PDVF.Class.squire"),
        inherited: R.inheritedGlory(s)
      }
    };
  }

  /* -------------------------------------------- */
  /*  Liaison des champs                           */
  /* -------------------------------------------- */

  _onRender(context, options) {
    super._onRender?.(context, options);
    for (const el of this.element.querySelectorAll("[data-bind]")) {
      const typed = el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && ["text", "number"].includes(el.type));
      if (typed) {
        // Saisie au clavier : on met à jour l'état sans redessiner (sinon le clic suivant serait perdu),
        // puis on redessine peu après la fin de la saisie.
        el.addEventListener("input", (event) => this.#onBind(event, { render: false }));
        el.addEventListener("change", () => setTimeout(() => this.rendered && this.render({ parts: ["body"] }), 250));
      } else {
        el.addEventListener("change", (event) => this.#onBind(event));
      }
    }
  }

  #onBind(event, { render = true } = {}) {
    const el = event.currentTarget;
    const path = el.dataset.bind;
    let value = el.type === "checkbox" ? el.checked : el.value;
    if (el.dataset.type === "number") value = Number(value) || 0;
    if (el.type === "radio" && !el.checked) return;
    foundry.utils.setProperty(this.state, path, value);

    // Changer d'origine remet à zéro ce qui en dépend.
    if (path.startsWith("origin.") && path !== "origin.name") {
      const o = R.resolveOrigin(this.state, this.C);
      Object.assign(this.state.origin, { klass: o.klassId, homeland: o.homelandId ?? "", religion: o.religionId });
      if (path === "origin.religion" || path === "origin.culture") {
        this.state.traits.rolled = null;
        this.state.traits.famous = "";
        this.state.traits.points = {};
      }
    }
    if (path === "apprentice.years") {
      const y = Number(value) || 0;
      this.state.apprentice.alloc = { skills: y, traits: 0, chars: 0 };
      this.state.apprentice.skills = {};
      this.state.apprentice.traits = {};
      this.state.apprentice.chars = {};
    }
    if (path === "family.mode") this.state.family.chosen = null;
    if (render) this.render({ parts: ["body"] });
  }

  async #saveDraft() {
    if (this.actor.isOwner) await this.actor.setFlag(SYSTEM_ID, DRAFT, this.state);
  }

  async close(options) {
    if (!this._finished) await this.#saveDraft();
    return super.close(options);
  }

  /* -------------------------------------------- */
  /*  Actions                                      */
  /* -------------------------------------------- */

  static async #onGoto(event, target) {
    this.state.step = Number(target.dataset.step);
    await this.#saveDraft();
    this.render({ parts: ["body"] });
  }

  static async #onNext() {
    if (R.validateStep(R.STEPS[this.state.step], this.state, this.C).errors.length) return;
    this.state.step = Math.min(R.STEPS.length - 1, this.state.step + 1);
    await this.#saveDraft();
    this.render({ parts: ["body"] });
  }

  static async #onPrev() {
    this.state.step = Math.max(0, this.state.step - 1);
    this.render({ parts: ["body"] });
  }

  static #onInc(event, target) {
    const { path } = target.dataset;
    const delta = Number(target.dataset.delta) || 0;
    const min = target.dataset.min !== undefined ? Number(target.dataset.min) : 0;
    const max = target.dataset.max !== undefined ? Number(target.dataset.max) : Infinity;
    const current = Number(foundry.utils.getProperty(this.state, path)) || 0;
    const next = Math.max(min, Math.min(max, current + delta));
    // Les points de trait sont rangés par « id.côté » : on évite de créer un sous-objet.
    if (path.startsWith("traits.points.")) this.state.traits.points[path.slice("traits.points.".length)] = next;
    else if (path.startsWith("apprentice.traits.")) this.state.apprentice.traits[path.slice("apprentice.traits.".length)] = next;
    else if (path.startsWith("passions.points.")) this.state.passions.points[path.slice("passions.points.".length)] = next;
    else foundry.utils.setProperty(this.state, path, next);
    this.render({ parts: ["body"] });
  }

  static #onSetMethod(event, target) {
    const method = target.dataset.value;
    if (method === this.state.method) return;
    const fresh = R.defaultState(this.C);
    fresh.origin = this.state.origin;
    fresh.method = method;
    this.state = fresh;
    this.render({ parts: ["body"] });
  }

  static #onRoll(event, target) {
    const s = this.state;
    const C = this.C;
    switch (target.dataset.what) {
      case "name": R.randomName(s, C); break;
      case "religion": R.rollReligion(s, C); break;
      case "chars": if (!s.chars.rolled) R.rollCharacteristics(s, C); break;
      case "traits": if (!s.traits.rolled) R.rollTraits(s, C); break;
      case "passions": if (!s.passions.rolled) R.rollPassions(s, C); break;
      case "familyTrait": if (!s.familyTrait.rolls) R.rollFamilyTrait(s, C); break;
      case "quickGlory": if (s.family.quickParentGlory === null) {
        // Gloire du parent inconnue : 6D6 × 100 + 2000
        let total = 0;
        for (let i = 0; i < 6; i++) total += 1 + Math.floor(Math.random() * 6);
        s.family.quickParentGlory = total * 100 + 2000;
      } break;
      case "jump": if (!s.details.jump) R.rollJump(s, C); break;
      case "luck": if (!s.details.luck) R.rollLuck(s, C); break;
    }
    this.render({ parts: ["body"] });
  }

  static #onAddPassion() {
    this.state.passions.extra.push({ name: "", court: "fervor" });
    this.render({ parts: ["body"] });
  }

  static #onRemovePassion(event, target) {
    const i = Number(target.dataset.index);
    const s = this.state;
    s.passions.extra.splice(i, 1);
    // Renuméroter les points des passions ajoutées
    const points = {};
    for (const [k, v] of Object.entries(s.passions.points)) {
      const m = k.match(/^extra\.(\d+)$/);
      if (!m) points[k] = v;
      else if (Number(m[1]) < i) points[k] = v;
      else if (Number(m[1]) > i) points[`extra.${Number(m[1]) - 1}`] = v;
    }
    s.passions.points = points;
    this.render({ parts: ["body"] });
  }

  static #onFamilyReroll(event, target) {
    const i = Number(target.dataset.index);
    this.state.family.proposals[i] = generateFamily();
    if (this.state.family.chosen === i) this.state.family.chosen = null;
    this.render({ parts: ["body"] });
  }

  static #onFamilyChoose(event, target) {
    const i = Number(target.dataset.index);
    const column = this.element.querySelector(`[data-proposal="${i}"]`);
    const checked = (kind) => [...column.querySelectorAll(`input[data-kind="${kind}"]:checked`)].map(el => el.value);
    this.state.family.chosen = i;
    this.state.family.selection = { passions: checked("passion"), traits: checked("trait") };
    this.render({ parts: ["body"] });
  }

  static async #onReset() {
    const ok = await DialogV2.confirm({
      window: { title: L("PDVF.Wizard.ResetTitle") },
      content: `<p>${L("PDVF.Wizard.ResetText")}</p>`,
      rejectClose: false
    });
    if (!ok) return;
    this.state = R.defaultState(this.C);
    await this.#saveDraft();
    this.render({ parts: ["body"] });
  }

  static async #onFinish() {
    const s = this.state;
    for (const step of R.STEPS) {
      if (R.validateStep(step, s, this.C).errors.length) {
        s.step = R.STEPS.indexOf(step);
        return this.render({ parts: ["body"] });
      }
    }
    const ok = await DialogV2.confirm({
      window: { title: L("PDVF.Wizard.FinishTitle") },
      content: `<p>${L("PDVF.Wizard.FinishText")}</p>`,
      rejectClose: false
    });
    if (!ok) return;

    const out = R.buildCharacter(s, this.year, this.C, { skillLabel: (id) => L(`PDVF.Skill.${id}`) });
    const parentGlory = s.family.mode === "quick" ? s.family.quickParentGlory
      : s.family.mode === "manual" ? Number(s.family.manualGlory) || 0 : 0;
    const system = {
      ...out.system,
      extraSkills: [],
      directedTraits: [],
      inspiration: { source: "", bonus: 0, target: "" },
      family: { ...out.system.family, parents: [{ name: "", glory: parentGlory }, { name: "", glory: 0 }] }
    };

    await this.actor.update({
      name: out.name,
      "prototypeToken.name": out.name,
      system,
      [`flags.${SYSTEM_ID}.family`]: null,
      [`flags.${SYSTEM_ID}.creation`]: { done: true, method: s.method, at: Date.now() }
    });
    if (s.family.mode === "history" && s.family.chosen !== null) {
      await applyFamilyHistory(this.actor, s.family.proposals[s.family.chosen], s.family.selection ?? { passions: [], traits: [] });
    }
    await this.actor.unsetFlag(SYSTEM_ID, DRAFT);
    ui.notifications.info(game.i18n.format("PDVF.Wizard.Done", { name: out.name }));
    // Fermer sans réenregistrer le brouillon
    this._finished = true;
    return this.close();
  }
}

/** Ouvre l'assistant pour un acteur. */
export function openCreationWizard(actor) {
  return new CreationWizard(actor).render({ force: true });
}
