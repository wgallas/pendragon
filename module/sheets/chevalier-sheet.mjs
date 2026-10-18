import { PDVF, SYSTEM_ID } from "../config.mjs";
import { traitPair, attributeLevel, formatValue, samePassion } from "../rules/resolution.mjs";
import { rollAttribute, promptTestOptions, signed } from "../dice/tests.mjs";
import { FamilyHistoryApp } from "../family/family-app.mjs";
import { familyView } from "../family/view.mjs";
import { getFamilyHistory } from "../family/apply.mjs";
import { CreationWizard } from "../creation/wizard.mjs";
import { addFollower, removeFollower, resolveFollowers, createSquire, addHorse, removeHorse, resolveHorses, knightHorseGlory, promptNewHorse } from "../documents/followers.mjs";
import { rollDamage } from "../dice/tests.mjs";
import { formatDenarii } from "../rules/horses.mjs";
import { openWinterWizard } from "../winter/wizard.mjs";
import { winterYear } from "../winter/engine.mjs";
import { gearView, attackNotes } from "./gear-view.mjs";
import { attackProfiles, conflictsWith } from "../rules/equipment.mjs";
import { giveStartingEquipment, hasGear, GEAR_TYPES } from "../documents/equipment.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

const TPL = `systems/${SYSTEM_ID}/templates/actor/chevalier`;
const TAB_IDS = ["chevalier", "traits", "combat", "suite", "lignee", "chronique"];
/** Chemins des tableaux du modèle, dont les lignes sont éditées dans le formulaire. */
const ARRAY_PATHS = ["system.passions", "system.inspirations", "system.horses", "system.extraSkills", "system.directedTraits", "system.chronicle", "system.family.parents", "system.family.children"];

const L = (k) => game.i18n.localize(k);

/** Champs qui acceptent d'être vides. */
const NULLABLE_KEYS = new Set(["born", "squired", "knighted", "landed", "roundTable", "ennobled", "died", "img"]);

function replaceNulls(obj) {
  if (!obj || typeof obj !== "object") return;
  for (const [k, v] of Object.entries(obj)) {
    if (v === null && !NULLABLE_KEYS.has(k)) obj[k] = 0;
    else if (typeof v === "object") replaceNulls(v);
  }
}

/**
 * Fiche du chevalier.
 */
export class ChevalierSheet extends HandlebarsApplicationMixin(ActorSheetV2) {

  /** Mode édition (champs modifiables) ou mode jeu (valeurs cliquables). */
  _editMode = false;
  /** Modificateur choisi pour le prochain jet. */
  _modifier = 0;

  /** Passion invoquée pour le prochain test (clé), choisie dans « Prochain test ». */
  _invoke = "";

  tabGroups = { primary: "chevalier" };

  static DEFAULT_OPTIONS = {
    classes: [SYSTEM_ID, "pdvf-sheet", "pdvf-chevalier"],
    position: { width: 980, height: 940 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      toggleEdit: ChevalierSheet.#onToggleEdit,
      roll: ChevalierSheet.#onRoll,
      setModifier: ChevalierSheet.#onSetModifier,
      addRow: ChevalierSheet.#onAddRow,
      deleteRow: ChevalierSheet.#onDeleteRow,
      recordSession: ChevalierSheet.#onRecordSession,
      editHeraldry: ChevalierSheet.#onEditHeraldry,
      endInspiration: ChevalierSheet.#onEndInspiration,
      newDay: ChevalierSheet.#onNewDay,
      step: ChevalierSheet.#onStep,
      openFamily: ChevalierSheet.#onOpenFamily,
      openWizard: ChevalierSheet.#onOpenWizard,
      newSquire: ChevalierSheet.#onNewSquire,
      openFollower: ChevalierSheet.#onOpenFollower,
      removeFollower: ChevalierSheet.#onRemoveFollower,
      rollFollower: ChevalierSheet.#onRollFollower,
      newHorse: ChevalierSheet.#onNewHorse,
      removeHorse: ChevalierSheet.#onRemoveHorse,
      setMainHorse: ChevalierSheet.#onSetMainHorse,
      horseCharge: ChevalierSheet.#onHorseCharge,
      openWinter: ChevalierSheet.#onOpenWinter,
      gearRoll: ChevalierSheet.#onGearRoll,
      gearDamage: ChevalierSheet.#onGearDamage,
      gearEquip: ChevalierSheet.#onGearEquip,
      gearOpen: ChevalierSheet.#onGearOpen,
      gearDelete: ChevalierSheet.#onGearDelete,
      startingGear: ChevalierSheet.#onStartingGear
    }
  };

  static PARTS = {
    header: { template: `${TPL}/header.hbs` },
    tabs: { template: `${TPL}/tabs.hbs` },
    chevalier: { template: `${TPL}/tab-chevalier.hbs`, scrollable: [""] },
    traits: { template: `${TPL}/tab-traits.hbs`, scrollable: [""] },
    combat: { template: `${TPL}/tab-combat.hbs`, scrollable: [""] },
    suite: { template: `${TPL}/tab-suite.hbs`, scrollable: [""] },
    lignee: { template: `${TPL}/tab-lignee.hbs`, scrollable: [""] },
    chronique: { template: `${TPL}/tab-chronique.hbs`, scrollable: [""] },
    footer: { template: `${TPL}/footer.hbs` }
  };

  get title() {
    return this.document.name;
  }

  /* -------------------------------------------- */
  /*  Contexte                                     */
  /* -------------------------------------------- */

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.document;
    const system = actor.system;
    const editMode = this._editMode && this.isEditable;
    const year = game.settings.get(SYSTEM_ID, "currentYear");

    Object.assign(context, {
      actor, system, editMode, year,
      tabs: this.#getTabs()
    });

    // Bandeau
    const hp = system.health.hp;
    const max = Math.max(1, hp.max);
    const religion = system.biography.religion;
    context.header = {
      heraldryImg: system.heraldry.img,
      fullTitle: `${L(`PDVF.Title.${system.biography.title}`)} ${actor.name}`,
      line1: [
        this.#classLabel(system.biography.knightClass),
        system.biography.lord ? game.i18n.format("PDVF.Sheet.ServesLord", { lord: system.biography.lord }) : ""
      ].filter(Boolean).join(" · "),
      line2: [
        system.biography.born ? game.i18n.format("PDVF.Sheet.BornIn", { year: system.biography.born }) : "",
        system.age !== null && system.age >= 0 ? game.i18n.format("PDVF.Sheet.Age", { age: system.age }) : "",
        system.biography.culture,
        PDVF.religions[religion] ? L(PDVF.religions[religion].label ?? `PDVF.Religion.${religion}`) : religion,
        system.biography.heir ? L("PDVF.Sheet.Heir") : ""
      ].filter(Boolean).join(" · "),
      glory: system.gloryTotal.toLocaleString("fr-FR"),
      honor: formatValue(system.honor.value),
      honorLevel: L(`PDVF.Level.${system.honorLevel}`),
      hp: {
        value: hp.value, max: hp.max,
        pct: Math.max(0, Math.min(100, Math.round(100 * hp.value / max))),
        unconscious: system.derived.unconscious,
        unconsciousPct: Math.round(100 * system.derived.unconscious / max)
      },
      status: system.derived.status,
      statusLabel: L(`PDVF.Status.${system.derived.status}`),
      afflictions: [
        system.health.debilitated ? L("PDVF.Health.debilitated") : null,
        system.health.melancholy ? L("PDVF.Health.melancholy") : null,
        system.health.madness ? L("PDVF.Health.madness") : null
      ].filter(Boolean)
    };

    // Onglet Chevalier
    context.characteristics = PDVF.characteristics.map(id => ({
      id, key: `char.${id}`,
      abbr: L(`PDVF.Char.${id}.abbr`), long: L(`PDVF.Char.${id}.long`),
      value: system.characteristics[id].value,
      name: `system.characteristics.${id}.value`
    }));
    const d = system.derived;
    context.derived = [
      ["knockdown", d.knockdown], ["majorWound", d.majorWound], ["damage", d.damage],
      ["brawlDamage", d.brawlDamage], ["move", d.move], ["hpMax", d.hpMax],
      ["unconscious", d.unconscious], ["healRate", d.healRate]
    ].map(([id, value]) => ({ label: L(`PDVF.Derived.${id}.label`), formula: L(`PDVF.Derived.${id}.formula`), value }));

    context.quickModifiers = PDVF.quickModifiers.map(v => ({ value: v, label: signed(v), selected: v === this._modifier }));
    context.modifierHint = L(`PDVF.ModifierHint.${this._modifier}`);

    // Passion à invoquer pour le prochain test, et inspirations en cours
    const invokable = actor.listInvokable();
    if (this._invoke && !invokable.some(p => p.key === this._invoke && !p.invoked)) this._invoke = "";
    context.invoke = {
      value: this._invoke,
      choices: invokable.map(p => ({
        key: p.key, label: `${p.label} ${formatValue(p.value)}${p.invoked ? ` — ${L("PDVF.Invoke.UsedToday")}` : ""}`,
        disabled: p.invoked, selected: p.key === this._invoke
      }))
    };
    const targets = actor.listRollables().filter(r => PDVF.inspirableKinds.includes(r.kind));
    context.inspirations = actor.activeInspirations().map((x) => ({
      ...x,
      text: `${x.source} : ${L(`PDVF.Passion.${x.state}Short`)} ${signed(x.bonus)}`,
      targets: targets.map(r => ({ key: r.key, label: r.label, selected: r.key === x.target }))
    }));
    context.isGM = game.user.isGM;

    const skills = Object.entries(PDVF.skills).map(([id, cfg]) => {
      const label = L(`PDVF.Skill.${id}`);
      return {
        id, key: `skill.${id}`, group: cfg.group, label, inspired: actor.inspirationBonus(`skill.${id}`) ? signed(actor.inspirationBonus(`skill.${id}`)) : "",
        value: system.skills[id].value, display: formatValue(system.skills[id].value), xp: system.skills[id].xp,
        hasSpecialty: id in system.skillSpecialties, specialty: system.skillSpecialties[id] ?? ""
      };
    }).sort((a, b) => a.label.localeCompare(b.label, "fr"));
    const general = skills.filter(s => s.group === "general");
    const combat = skills.filter(s => s.group === "combat");
    context.skillsGeneral = this.#splitColumns(general);
    context.skillsCombat = this.#splitColumns(combat);
    context.extraSkills = system.extraSkills.map((s, i) => ({
      ...s, index: i, key: `extra.${i}`, display: formatValue(s.value)
    }));

    // Onglet Traits & passions
    const virtues = new Set(PDVF.religions[religion]?.virtues ?? []);
    context.traits = PDVF.traits.map(id => {
      const pair = traitPair(system.traits[id].value);
      return {
        id,
        left: this.#traitSide(id, "left", pair.left, system.traits[id].xpLeft, virtues),
        right: this.#traitSide(id, "right", pair.right, system.traits[id].xpRight, virtues)
      };
    });
    context.directedTraits = system.directedTraits.map((t, i) => ({ ...t, index: i }));
    const invokedNames = actor.invokedToday();
    context.honor = {
      invoked: invokedNames.some(n => samePassion(n, L("PDVF.Honor"))),
      value: system.honor.value, display: formatValue(system.honor.value), xp: system.honor.xp,
      level: system.honorLevel, levelLabel: L(`PDVF.Level.${system.honorLevel}`)
    };
    context.courts = PDVF.passionCourts.map(court => ({
      court,
      label: L(`PDVF.Court.${court}`),
      total: system.courtTotals[court],
      max: PDVF.passionCourtMax,
      over: system.courtTotals[court] > PDVF.passionCourtMax,
      passions: system.passions
        .map((p, index) => ({ ...p, index, key: `passion.${index}`, display: formatValue(p.value), level: attributeLevel(p.value),
          invoked: invokedNames.some(n => samePassion(n, p.name)) }))
        .filter(p => p.court === court)
    }));
    context.courtChoices = PDVF.passionCourts.map(c => ({ value: c, label: L(`PDVF.Court.${c}`) }));

    // Onglet Suite & domaine : suivants rattachés
    context.followers = resolveFollowers(actor).map(f => {
      const a = f.actor;
      if (!a) return { index: f.index, missing: true, name: L("PDVF.Suite.Missing") };
      const s = a.system;
      const v = s.squireView;
      return {
        index: f.index, id: a.id, uuid: a.uuid, name: a.name, img: a.img,
        category: L(`PDVF.Npc.Category.${s.category}`),
        first: v && s.squire.first,
        age: v?.age ?? null,
        squireSkill: v ? formatValue(v.skill) : null,
        tagline: s.tagline,
        hp: `${s.health.hp.value} / ${s.health.hp.max}`,
        tooOld: v?.tooOld
      };
    });
    context.canCreateActors = game.user.can?.("ACTOR_CREATE") ?? false;

    // Écurie
    const roles = ["war", "riding", "squire", "pack"];
    context.horses = resolveHorses(actor).map(h => {
      const a = h.actor;
      if (!a) return { index: h.index, missing: true, name: L("PDVF.Suite.MissingHorse") };
      const s = a.system;
      return {
        index: h.index, uuid: a.uuid, name: a.name, img: a.img,
        main: a.uuid === system.mainHorse,
        type: L(`PDVF.Horse.Type.${s.horseType}`), sex: L(`PDVF.Horse.Sex.${s.sex}`), color: L(`PDVF.Horse.Color.${s.color}`),
        age: s.age, hp: `${s.health.hp.value} / ${s.health.hp.max}`, armor: s.derived.armor, move: s.derived.move,
        charge: s.charge, warTrained: s.warTrained, weakened: s.weakened, exhausted: s.exhausted,
        roleLabel: L(`PDVF.Horse.Role.${h.role}`),
        roleChoices: roles.map(r => ({ value: r, label: L(`PDVF.Horse.Role.${r}`), selected: r === h.role }))
      };
    });

    // Onglet Lignée
    context.titleChoices = ["sire", "dame"].map(v => ({ value: v, label: L(`PDVF.Title.${v}`) }));
    context.religionChoices = Object.entries(PDVF.religions).map(([v, r]) => ({ value: v, label: L(r.label ?? `PDVF.Religion.${v}`) }));
    context.classChoices = PDVF.knightClasses.map(v => ({ value: v, label: L(`PDVF.Class.${v}`) }));
    context.dates = ["squired", "knighted", "landed", "roundTable", "ennobled", "died"].map(id => ({
      id, label: L(`PDVF.Dates.${id}`), value: system.dates[id] || "", name: `system.dates.${id}`
    }));
    context.parents = system.family.parents.map((p, i) => ({ ...p, index: i }));
    const curYear = game.settings.get(SYSTEM_ID, "currentYear");
    context.spouse = system.family.spouse;
    context.children = (system.family.children ?? []).map((c, i) => ({
      ...c, index: i, age: c.born ? (c.alive ? curYear - c.born : (c.died ?? curYear) - c.born) : null,
      sexChoices: ["m", "f"].map(v => ({ value: v, label: L(`PDVF.Winter.Sex.${v}`), selected: v === c.sex }))
    }));
    const history = getFamilyHistory(actor);
    context.familyHistory = history?.result ? familyView(history.result) : null;

    // Trésor et niveau de vie (onglet Suite & domaine)
    context.treasury = { label: formatDenarii(system.economy?.treasury ?? 0), pounds: Math.round((system.economy?.treasury ?? 0) / 240 * 100) / 100 };
    context.livingChoicesEco = PDVF.livingStandards.map(v => ({ value: v, label: L(`PDVF.Living.${v}`), selected: v === system.economy?.living }));
    context.winterYear = winterYear();

    // Onglet Chronique
    context.chronicle = system.chronicleRows;
    context.livingChoices = PDVF.livingStandards.map(v => ({ value: L(`PDVF.Living.${v}`), label: L(`PDVF.Living.${v}`) }));
    // Gloire passive : celle des chevaux est calculée à partir de l'écurie
    const horseGlory = knightHorseGlory(actor);
    context.passive = { ...system.passive, horses: horseGlory.total, horsesDetail: horseGlory, total: system.passive.total + horseGlory.total };
    context.prestige = {
      earned: system.prestigeEarned,
      used: system.glory.prestigeUsed,
      available: Math.max(0, system.prestigeEarned - system.glory.prestigeUsed)
    };

    // Onglet Combat : armes, armure, bouclier
    context.gear = gearView(actor, this.#gearStats());
    return context;
  }

  /** Valeurs du chevalier utiles au calcul des attaques. */
  #gearStats() {
    const system = this.document.system;
    let horseCharge = "";
    try { horseCharge = system.mainHorse ? (globalThis.fromUuidSync?.(system.mainHorse)?.system?.charge ?? "") : ""; } catch (e) { horseCharge = ""; }
    return {
      damageDice: system.derived.damageDice,
      brawl: system.derived.brawlDamage,
      horseCharge,
      skills: Object.fromEntries(Object.entries(system.skills).map(([k, v]) => [k, v.value]))
    };
  }

  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    if (TAB_IDS.includes(partId)) context.tab = context.tabs[partId];
    return context;
  }

  #getTabs() {
    const active = this.tabGroups.primary ?? "chevalier";
    return Object.fromEntries(TAB_IDS.map(id => [id, {
      id, group: "primary", active: id === active, cssClass: id === active ? "active" : "",
      label: L(`PDVF.Tab.${id}`)
    }]));
  }

  #splitColumns(list) {
    const half = Math.ceil(list.length / 2);
    return [list.slice(0, half), list.slice(half)];
  }

  #traitSide(id, side, value, xp, virtues) {
    const level = attributeLevel(value);
    return {
      key: `trait.${id}.${side}`,
      label: L(`PDVF.Trait.${id}.${side}`),
      value, display: formatValue(value), xp,
      xpName: `system.traits.${id}.${side === "left" ? "xpLeft" : "xpRight"}`,
      inputName: side === "left" ? `system.traits.${id}.value` : `traitsRight.${id}`,
      virtue: virtues.has(`${id}.${side}`),
      level, famous: level === "famous" || level === "exalted"
    };
  }

  #classLabel(value) {
    return PDVF.knightClasses.includes(value) ? L(`PDVF.Class.${value}`) : value;
  }

  /* -------------------------------------------- */
  /*  Formulaire                                   */
  /* -------------------------------------------- */

  /** Convertit les lignes de tableaux et la saisie du côté droit des traits. */
  _processFormData(event, form, formData) {
    const data = super._processFormData(event, form, formData);

    // Saisie du trait de droite : la valeur stockée est celle de gauche (somme 20).
    const changed = event?.target?.name ?? "";
    if (data.traitsRight) {
      if (changed.startsWith("traitsRight.")) {
        const id = changed.split(".")[1];
        foundry.utils.setProperty(data, `system.traits.${id}.value`, 20 - Number(data.traitsRight[id] || 0));
      }
      delete data.traitsRight;
    }

    // Choix de la passion du prochain test : état de la fiche, pas une donnée de l'acteur.
    // Trésor saisi en livres, gardé en deniers
    if ("pdvfTreasury" in data) {
      const pounds = Number(String(data.pdvfTreasury ?? 0).replace(",", ".")) || 0;
      foundry.utils.setProperty(data, "system.economy.treasury", Math.round(pounds * 240));
      delete data.pdvfTreasury;
    }
    if ("pdvfInvoke" in data) {
      this._invoke = data.pdvfInvoke ?? "";
      delete data.pdvfInvoke;
    }

    // Un champ numérique vidé arrive à null : on le ramène à 0, sauf pour les années.
    replaceNulls(data.system);

    // Les lignes des tableaux arrivent sous forme d'objets indexés : on les fusionne.
    for (const path of ARRAY_PATHS) {
      const incoming = foundry.utils.getProperty(data, path);
      if (!incoming || Array.isArray(incoming)) continue;
      const rows = foundry.utils.deepClone(foundry.utils.getProperty(this.document._source, path) ?? []);
      for (const [i, row] of Object.entries(incoming)) {
        // Une inspiration close entre-temps (nouveau jour, « Fin ») ne doit pas renaître d'un formulaire périmé.
        if ((path === "system.inspirations" || path === "system.horses") && !rows[Number(i)]) continue;
        rows[Number(i)] = foundry.utils.mergeObject(rows[Number(i)] ?? {}, row, { inplace: false });
      }
      foundry.utils.setProperty(data, path, rows);
    }
    return data;
  }

  /* -------------------------------------------- */
  /*  Actions                                      */
  /* -------------------------------------------- */

  static #onToggleEdit() {
    this._editMode = !this._editMode;
    this.render();
  }

  static async #onRoll(event, target) {
    const key = target.dataset.key;
    const rollable = this.document.getRollable(key);
    if (!rollable) return;
    const canInvoke = PDVF.inspirableKinds.includes(rollable.kind);
    let options = { modifier: this._modifier, invoke: canInvoke ? this._invoke : "" };
    if (event.shiftKey) {
      options = await promptTestOptions(this.document, rollable, this._modifier, options.invoke);
      if (!options) return;
    }
    await rollAttribute(this.document, key, options);
    // Le modificateur et la passion choisis ne valent que pour un test.
    if (this._modifier !== 0 || (options.invoke && this._invoke)) {
      this._modifier = 0;
      if (options.invoke) this._invoke = "";
      this.render();
    }
  }

  static #onSetModifier(event, target) {
    this._modifier = Number(target.dataset.value) || 0;
    this.render({ parts: ["chevalier"] });
  }

  static async #onAddRow(event, target) {
    const path = target.dataset.path;
    const rows = foundry.utils.deepClone(foundry.utils.getProperty(this.document._source, path) ?? []);
    const defaults = {
      "system.passions": { court: target.dataset.court ?? "fervor", name: L("PDVF.Sheet.NewPassion"), value: 10, xp: false },
      "system.extraSkills": { name: L("PDVF.Sheet.NewSkill"), group: "general", value: 0, xp: false },
      "system.directedTraits": { name: "", value: 1 },
      "system.chronicle": { year: game.settings.get(SYSTEM_ID, "currentYear"), event: "", living: "", glory: 0 },
      "system.family.children": { name: "", sex: "m", born: game.settings.get(SYSTEM_ID, "currentYear"), blessing: "", alive: true, died: null, notes: "" }
    };
    if (!(path in defaults)) return;
    rows.push(defaults[path]);
    await this.document.update({ [path]: rows });
  }

  static async #onDeleteRow(event, target) {
    const { path, index } = target.dataset;
    const rows = foundry.utils.deepClone(foundry.utils.getProperty(this.document._source, path) ?? []);
    rows.splice(Number(index), 1);
    await this.document.update({ [path]: rows });
  }

  static #onOpenWinter() {
    openWinterWizard(this.document);
  }

  static async #onRecordSession() {
    const system = this.document.system;
    const glory = system.glory.session;
    if (!glory) return ui.notifications.info(L("PDVF.Notify.NoSessionGlory"));
    const rows = foundry.utils.deepClone(this.document._source.system.chronicle);
    rows.push({ year: game.settings.get(SYSTEM_ID, "currentYear"), event: L("PDVF.Chronicle.SessionEvent"), living: "", glory });
    await this.document.update({ "system.chronicle": rows, "system.glory.session": 0 });
  }

  static async #onEditHeraldry() {
    if (!this.isEditable) return;
    const FP = foundry.applications.apps.FilePicker.implementation ?? foundry.applications.apps.FilePicker;
    const picker = new FP({
      type: "image",
      current: this.document.system.heraldry.img ?? "",
      callback: (path) => this.document.update({ "system.heraldry.img": path })
    });
    return picker.browse();
  }

  /**
   * Boutons − et + du mode édition : modifient le champ voisin puis
   * déclenchent l'enregistrement normal du formulaire.
   */
  static #onStep(event, target) {
    const input = target.closest(".pdvf-stepper")?.querySelector("input");
    if (!input) return;
    let value = (Number(input.value) || 0) + (Number(target.dataset.step) || 0);
    if (input.min !== "") value = Math.max(Number(input.min), value);
    if (input.max !== "") value = Math.min(Number(input.max), value);
    input.value = value;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  /** Seuls les objets d'équipement se rangent sur la fiche (pas les batailles ni les rencontres). */
  async _onDropItem(event, item) {
    if (!this.isEditable || !GEAR_TYPES.includes(item?.type)) return null;
    // Objet déjà sur la fiche : rien à créer
    if (item.parent?.uuid === this.document.uuid) return item;
    const data = item.toObject();
    delete data._id;
    delete data.folder;
    if (item.pack) foundry.utils.setProperty(data, "_stats.compendiumSource", item.uuid);
    // Porté d'office, sauf s'il prend la place d'une pièce déjà portée ou ne se cumule pas avec elle
    data.system.equipped = item.type === "arme" || !conflictsWith(item, this.document.items.contents).length;
    const [created] = await this.document.createEmbeddedDocuments("Item", [data]);
    if (created) { this.tabGroups.primary = "combat"; this.render(); }
    return created ?? null;
  }

  /* -------------------------------------------- */
  /*  Équipement                                   */
  /* -------------------------------------------- */

  /** Test de la compétence d'une arme (mêmes options que les autres tests : modificateur, passion). */
  static async #onGearRoll(event, target) {
    const item = this.document.items.get(target.dataset.id);
    if (!item) return;
    const mode = target.dataset.mode ?? "main";
    const skill = mode === "thrown" ? (item.system.thrown.skill || "thrown") : item.system.skill;
    const key = `skill.${skill}`;
    const rollable = this.document.getRollable(key);
    if (!rollable) return;
    let options = { modifier: this._modifier, invoke: this._invoke };
    if (event.shiftKey) {
      options = await promptTestOptions(this.document, rollable, this._modifier, options.invoke);
      if (!options) return;
    }
    const profile = attackProfiles(item.system, this.#gearStats()).find(p => p.mode === mode);
    options.title = item.name;
    options.subtitle = `${rollable.label}${profile?.label ? ` · ${game.i18n.format("PDVF.Gear.DamageShort", { damage: profile.label })}` : ""}`;
    options.notes = [...(options.notes ?? []), ...attackNotes(this.document, item, mode)];
    await rollAttribute(this.document, key, options);
    if (this._modifier !== 0 || (options.invoke && this._invoke)) {
      this._modifier = 0;
      if (options.invoke) this._invoke = "";
      this.render();
    }
  }

  /** Jet de dégâts d'une arme (profil principal, variante ou lancer). */
  static async #onGearDamage(event, target) {
    const item = this.document.items.get(target.dataset.id);
    if (!item) return;
    const profile = attackProfiles(item.system, this.#gearStats()).find(p => p.mode === (target.dataset.mode ?? "main"));
    if (!profile) return;
    const alt = target.dataset.alt !== undefined ? profile.alts[Number(target.dataset.alt)] : null;
    const formula = alt ? alt.formula : profile.formula;
    if (!formula) return ui.notifications.warn(game.i18n.localize(item.system.damage.base === "horse" ? "PDVF.Gear.NoHorse" : "PDVF.Gear.NoDamage"));
    const label = [item.name, profile.mode === "thrown" ? L("PDVF.Gear.ThrownShort") : "", alt?.label ?? ""].filter(Boolean).join(", ");
    await rollDamage(this.document, formula, label);
  }

  static async #onGearEquip(event, target) {
    const item = this.document.items.get(target.dataset.id);
    if (!item) return;
    if (item.system.equipped) return item.update({ "system.equipped": false });
    // Porter une pièce range celles qu'elle remplace ou avec lesquelles elle ne se cumule pas.
    const off = conflictsWith(item, this.document.items.contents);
    const updates = [{ _id: item.id, "system.equipped": true }, ...off.map(i => ({ _id: i.id, "system.equipped": false }))];
    await this.document.updateEmbeddedDocuments("Item", updates);
    if (off.length) ui.notifications.info(game.i18n.format("PDVF.Gear.Stowed", { names: off.map(i => i.name).join(", ") }));
  }

  static #onGearOpen(event, target) {
    this.document.items.get(target.dataset.id)?.sheet?.render(true);
  }

  static async #onGearDelete(event, target) {
    const item = this.document.items.get(target.dataset.id);
    if (!item) return;
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: L("PDVF.Gear.DeleteTitle") },
      content: `<p>${game.i18n.format("PDVF.Gear.DeleteText", { name: item.name })}</p>`,
      rejectClose: false
    });
    if (ok) await item.delete();
  }

  /** Équipement de départ : celui du chevalier adoubé, ou celui de l'écuyer. */
  static async #onStartingGear() {
    if (hasGear(this.document)) return;
    const kind = this.document.system.biography.knightClass === "squire" ? "squire" : "knight";
    const created = await giveStartingEquipment(this.document, kind);
    if (created.length) ui.notifications.info(game.i18n.format("PDVF.Gear.StartingCreated", { count: created.length }));
  }

  /** Un PNJ déposé sur la fiche rejoint la suite du chevalier. */
  async _onDropActor(event, actor) {
    if (this.isEditable && actor?.type === "cheval") {
      await addHorse(this.document, actor);
      this.tabGroups.primary = "suite";
      this.render();
      return actor;
    }
    if (!this.isEditable || actor?.type !== "pnj") return super._onDropActor?.(event, actor) ?? null;
    await addFollower(this.document, actor);
    this.tabGroups.primary = "suite";
    this.render();
    return actor;
  }

  static async #onNewSquire() {
    const npc = await createSquire(this.document);
    if (npc) { this.tabGroups.primary = "suite"; this.render(); }
  }

  static async #onNewHorse() {
    const horse = await promptNewHorse(this.document);
    if (horse) { this.tabGroups.primary = "suite"; this.render(); }
  }

  static async #onRemoveHorse(event, target) {
    await removeHorse(this.document, Number(target.dataset.index));
  }

  static async #onSetMainHorse(event, target) {
    const uuid = target.dataset.uuid;
    await this.document.update({ "system.mainHorse": this.document.system.mainHorse === uuid ? "" : uuid });
  }

  static async #onHorseCharge(event, target) {
    const horse = globalThis.fromUuidSync?.(target.dataset.uuid);
    if (horse) await rollDamage(this.document, horse.system.charge, game.i18n.format("PDVF.Horse.ChargeOf", { name: horse.name }));
  }

  static #onOpenFollower(event, target) {
    const actor = globalThis.fromUuidSync?.(target.dataset.uuid);
    actor?.sheet?.render(true);
  }

  static async #onRemoveFollower(event, target) {
    await removeFollower(this.document, Number(target.dataset.index));
  }

  static async #onRollFollower(event, target) {
    const actor = globalThis.fromUuidSync?.(target.dataset.uuid);
    if (!actor) return;
    const key = target.dataset.key;
    let options = { modifier: 0 };
    if (event.shiftKey) {
      options = await promptTestOptions(actor, actor.getRollable(key), 0);
      if (!options) return;
    }
    await rollAttribute(actor, key, options);
  }

  static #onOpenWizard() {
    new CreationWizard(this.document).render({ force: true });
  }

  static #onOpenFamily() {
    new FamilyHistoryApp(this.document).render({ force: true });
  }

  static async #onEndInspiration(event, target) {
    await this.document.endInspiration(Number(target.dataset.index));
  }

  static async #onNewDay() {
    const actor = this.document;
    console.log(`${SYSTEM_ID} | Nouveau jour (fiche)`, { actor: actor.name, isGM: game.user.isGM,
      day: PendragonActorDay(), passionDay: actor.system.passionDay, invokedToday: [...(actor.system.invokedToday ?? [])] });
    if (!game.user.isGM) return ui.notifications.warn(game.i18n.localize("PDVF.Invoke.GMOnly"));
    try {
      await actor.newDay();
      this.render();
      console.log(`${SYSTEM_ID} | Nouveau jour appliqué`, { passionDay: actor.system.passionDay, invokedToday: [...(actor.system.invokedToday ?? [])] });
      ui.notifications.info(game.i18n.format("PDVF.Invoke.NewDayOne", { name: actor.name }));
    } catch (err) {
      console.error(`${SYSTEM_ID} | Nouveau jour impossible`, err);
      ui.notifications.error(`${game.i18n.localize("PDVF.Invoke.NewDay")} : ${err.message}`);
    }
  }
}

/** Jour en cours du monde (pour le journal de la console). */
function PendragonActorDay() {
  try { return game.settings.get(SYSTEM_ID, "currentDay"); } catch (err) { return `réglage illisible : ${err.message}`; }
}
