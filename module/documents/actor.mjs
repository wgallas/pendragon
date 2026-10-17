import { PDVF, SYSTEM_ID } from "../config.mjs";
import { traitPair, gloryTestValue, samePassion } from "../rules/resolution.mjs";
import { normalizeLabel } from "../rules/followers.mjs";

/**
 * Document Acteur du système.
 * Centralise l'accès aux Attributs testables, utilisé par la fiche et par les jets.
 */
export class PendragonActor extends Actor {

  /** Valeurs par défaut d'un nouveau chevalier. */
  async _preCreate(data, options, user) {
    if ((await super._preCreate(data, options, user)) === false) return false;
    if (this.type === "pnj") {
      // Écuyers et suivants sont des individus : jeton lié. Les autres PNJ restent génériques.
      const category = data.system?.category ?? "character";
      const c = foundry.utils.mergeObject({ siz: { value: 10 }, con: { value: 10 } }, data.system?.characteristics ?? {}, { inplace: false });
      const updates = { "prototypeToken.actorLink": ["squire", "follower"].includes(category) };
      if (data.system?.health?.hp?.value === undefined) updates["system.health.hp.value"] = (Number(c.siz.value) || 0) + (Number(c.con.value) || 0);
      this.updateSource(updates);
      return;
    }
    if (this.type === "cheval") {
      this.updateSource({ "prototypeToken.actorLink": true });
      return;
    }
    if (this.type !== "chevalier") return;
    const updates = { "prototypeToken.actorLink": true };
    if (!data.system?.passions?.length) {
      updates["system.passions"] = PDVF.defaultPassions.map(p => ({
        court: p.court,
        name: game.i18n.localize(`PDVF.DefaultPassion.${p.key}`),
        value: p.value,
        xp: false
      }));
    }
    if (data.system?.health?.hp?.value === undefined) {
      const c = foundry.utils.mergeObject(
        { siz: { value: 10 }, con: { value: 10 } },
        data.system?.characteristics ?? {},
        { inplace: false }
      );
      updates["system.health.hp.value"] = (Number(c.siz.value) || 0) + (Number(c.con.value) || 0);
    }
    this.updateSource(updates);
  }

  /**
   * Description d'un Attribut testable à partir de sa clé.
   * Clés : char.siz · skill.sword · extra.0 · trait.chaste.left · passion.2 · honor · glory
   * @returns {{key:string, kind:string, label:string, value:number, canXp:boolean, opposite?:string}|null}
   */
  getRollable(key) {
    if (!key) return null;
    if (this.type === "pnj") return this._npcRollable(key);
    if (this.type === "cheval") {
      const [kind, id] = key.split(".");
      if (kind !== "char" || !(id in (this.system.characteristics ?? {}))) return null;
      return { key, kind: "characteristic", label: game.i18n.localize(`PDVF.Char.${id}.long`), value: this.system.characteristics[id].value, canXp: false };
    }
    if (this.type !== "chevalier") return null;
    const s = this.system;
    const L = (k) => game.i18n.localize(k);
    const [kind, id, side] = key.split(".");
    switch (kind) {
      case "char": {
        if (!PDVF.characteristics.includes(id)) return null;
        return { key, kind: "characteristic", label: L(`PDVF.Char.${id}.long`), value: s.characteristics[id].value, canXp: false };
      }
      case "skill": {
        if (!(id in s.skills)) return null;
        let label = L(`PDVF.Skill.${id}`);
        const spec = s.skillSpecialties?.[id];
        if (spec) label += ` (${spec})`;
        return { key, kind: "skill", label, value: s.skills[id].value, canXp: true };
      }
      case "extra": {
        const row = s.extraSkills[Number(id)];
        if (!row) return null;
        return { key, kind: "skill", label: row.name || L("PDVF.Sheet.UnnamedSkill"), value: row.value, canXp: true };
      }
      case "trait": {
        if (!PDVF.traits.includes(id) || !["left", "right"].includes(side)) return null;
        const pair = traitPair(s.traits[id].value);
        const other = side === "left" ? "right" : "left";
        return {
          key, kind: "trait", label: L(`PDVF.Trait.${id}.${side}`), value: pair[side], canXp: true,
          opposite: `trait.${id}.${other}`
        };
      }
      case "passion": {
        const p = s.passions[Number(id)];
        if (!p) return null;
        return { key, kind: "passion", label: p.name || L("PDVF.Sheet.UnnamedPassion"), value: p.value, canXp: true, court: p.court };
      }
      case "honor":
        return { key, kind: "passion", label: L("PDVF.Honor"), value: s.honor.value, canXp: true };
      case "glory":
        return { key, kind: "glory", label: L("PDVF.GloryTest"), value: gloryTestValue(s.gloryTotal), canXp: false };
    }
    return null;
  }

  /**
   * Attributs d'un PNJ. Clés : char.siz · attack.0 · nskill.0 · squire.skill · squire.sword ·
   * ntrait.0 · passion.0 · honor · skill.sword (compétence nommée, notée ou par défaut).
   */
  _npcRollable(key) {
    const s = this.system;
    const L = (k) => game.i18n.localize(k);
    const [kind, id] = key.split(".");
    const base = { key, canXp: false };
    switch (kind) {
      case "char":
        if (!PDVF.characteristics.includes(id)) return null;
        return { ...base, kind: "characteristic", label: L(`PDVF.Char.${id}.long`), value: s.characteristics[id].value };
      case "attack": {
        const a = s.attacks[Number(id)];
        if (!a) return null;
        const label = a.skill ? `${a.name || a.skill} (${a.skill})` : (a.name || L("PDVF.Npc.UnnamedAttack"));
        return { ...base, kind: "skill", label, value: a.value, damage: a.damage };
      }
      case "nskill": {
        const r = s.skills[Number(id)];
        if (!r) return null;
        return { ...base, kind: "skill", label: r.name || L("PDVF.Sheet.UnnamedSkill"), value: r.value };
      }
      case "squire": {
        const v = s.squireView;
        if (!v) return null;
        if (id === "skill") return { ...base, kind: "skill", label: L("PDVF.Npc.SquireSkill"), value: v.skill };
        if (!v.knightlyIds.includes(id) || v.knightly === null) return null;
        return { ...base, kind: "skill", label: L(`PDVF.Skill.${id}`), value: v.knightly };
      }
      case "skill": {
        // Compétence nommée : celle notée sur la fiche, sinon celle de l'écuyer, sinon la valeur par défaut.
        if (!(id in PDVF.skills)) return null;
        const label = L(`PDVF.Skill.${id}`);
        const noted = s.skills.find(r => normalizeLabel(r.name) === normalizeLabel(label));
        if (noted) return { ...base, kind: "skill", label, value: noted.value };
        const v = s.squireView;
        if (v?.knightlyIds.includes(id) && v.knightly !== null) return { ...base, kind: "skill", label, value: v.knightly };
        return { ...base, kind: "skill", label, value: s.defaultSkill };
      }
      case "ntrait": {
        const r = s.traits[Number(id)];
        if (!r) return null;
        return { ...base, kind: "npcTrait", label: r.name || L("PDVF.Npc.UnnamedTrait"), value: r.value };
      }
      case "passion": {
        const p = s.passions[Number(id)];
        if (!p) return null;
        return { ...base, kind: "passion", label: p.name || L("PDVF.Sheet.UnnamedPassion"), value: p.value };
      }
      case "honor":
        if (s.honor === null) return null;
        return { ...base, kind: "passion", label: L("PDVF.Honor"), value: s.honor };
    }
    return null;
  }

  /** Liste des Attributs testables (pour choisir l'Attribut d'un adversaire). */
  listRollables() {
    if (this.type === "pnj") {
      const s = this.system;
      const keys = [
        ...PDVF.characteristics.map(c => `char.${c}`),
        ...s.attacks.map((_, i) => `attack.${i}`),
        ...(s.squireView ? ["squire.skill", ...s.squireView.knightlyIds.map(id => `squire.${id}`)] : []),
        ...s.skills.map((_, i) => `nskill.${i}`),
        ...s.traits.map((_, i) => `ntrait.${i}`),
        "honor",
        ...s.passions.map((_, i) => `passion.${i}`)
      ];
      return keys.map(k => this.getRollable(k)).filter(Boolean);
    }
    if (this.type === "cheval") return ["siz", "dex", "str", "con"].map(c => this.getRollable(`char.${c}`)).filter(Boolean);
    if (this.type !== "chevalier") return [];
    const keys = [
      ...PDVF.characteristics.map(c => `char.${c}`),
      ...Object.keys(PDVF.skills).map(k => `skill.${k}`),
      ...this.system.extraSkills.map((_, i) => `extra.${i}`),
      ...PDVF.traits.flatMap(t => [`trait.${t}.left`, `trait.${t}.right`]),
      "honor",
      ...this.system.passions.map((_, i) => `passion.${i}`)
    ];
    return keys.map(k => this.getRollable(k)).filter(Boolean);
  }

  /* -------------------------------------------- */
  /*  Passions invoquées et inspirations           */
  /* -------------------------------------------- */
  // Le jour en cours est un compteur du monde (réglage « currentDay ») que le MJ avance avec
  // « Nouveau jour ». Chaque chevalier note le jour auquel se rapportent ses invocations
  // (system.passionDay) : un autre jour, elles ne comptent plus. Aucune liste n'a donc besoin
  // d'être vidée sur chaque acteur, jetons non liés compris.

  /** Jour en cours du monde. */
  static get currentDay() {
    try { return Number(game.settings.get(SYSTEM_ID, "currentDay")) || 1; } catch (err) { return 1; }
  }

  /** Les invocations notées sur la fiche se rapportent-elles au jour en cours ? */
  get passionDayCurrent() {
    return Number(this.system.passionDay) === PendragonActor.currentDay;
  }

  /** Inspirations en cours (avec leur rang dans la liste stockée). */
  activeInspirations() {
    if (!this.passionDayCurrent) return [];
    return (this.system.inspirations ?? []).map((x, index) => ({ ...x, index }));
  }

  /** Noms des passions déjà invoquées aujourd'hui. */
  invokedToday() {
    return this.passionDayCurrent ? (this.system.invokedToday ?? []) : [];
  }

  /** Bonus d'Inspiration applicable à un Attribut donné (le plus fort s'il y en a plusieurs). */
  inspirationBonus(key) {
    return this.activeInspirations().filter(i => i.target && i.target === key)
      .reduce((m, i) => Math.max(m, Number(i.bonus) || 0), 0);
  }

  /** Inspiration en cours sur un Attribut, s'il y en a une. */
  inspirationFor(key) {
    return this.activeInspirations().find(i => i.target === key) ?? null;
  }

  /** Passions pouvant être invoquées : Honneur et passions de la fiche, avec l'usage du jour. */
  listInvokable() {
    if (this.type !== "chevalier") return [];
    const used = this.invokedToday();
    const keys = ["honor", ...this.system.passions.map((_, i) => `passion.${i}`)];
    return keys.map(k => this.getRollable(k)).filter(Boolean)
      .map(r => ({ ...r, invoked: used.some(n => samePassion(n, r.label)) }));
  }

  /** Note qu'une passion a servi aujourd'hui et ajoute le bonus obtenu. */
  async addInspiration({ source, state, bonus, target = "" }) {
    const inspirations = this.activeInspirations().map(({ index, ...x }) => x);
    // Une nouvelle invocation sur le même Attribut remplace l'ancienne si elle est plus forte.
    const same = target ? inspirations.findIndex(i => i.target === target) : -1;
    const row = { source, state, bonus, target };
    if (same >= 0) { if (bonus >= inspirations[same].bonus) inspirations[same] = row; }
    else inspirations.push(row);
    const invokedToday = [...this.invokedToday()];
    if (!invokedToday.some(n => samePassion(n, source))) invokedToday.push(source);
    return this.update({
      "system.passionDay": PendragonActor.currentDay,
      "system.inspirations": inspirations,
      "system.invokedToday": invokedToday
    });
  }

  /** Note l'usage du jour sans bonus (passion invoquée mais ratée). */
  async markInvoked(source) {
    const invokedToday = [...this.invokedToday()];
    if (invokedToday.some(n => samePassion(n, source))) return;
    invokedToday.push(source);
    return this.update({
      "system.passionDay": PendragonActor.currentDay,
      "system.inspirations": this.activeInspirations().map(({ index, ...x }) => x),
      "system.invokedToday": invokedToday
    });
  }

  /** Fin de la situation qui avait invoqué la passion. */
  async endInspiration(index) {
    const inspirations = [...(this.system.inspirations ?? [])];
    inspirations.splice(index, 1);
    return this.update({ "system.inspirations": inspirations });
  }

  /** Nouveau jour pour ce seul chevalier : ses invocations passées ne comptent plus. */
  async newDay() {
    if (this.type !== "chevalier") return;
    return this.update({ "system.passionDay": 0, "system.invokedToday": [], "system.inspirations": [] });
  }

  /** Coche la croix d'expérience d'un Attribut. */
  async markExperience(key) {
    if (this.type !== "chevalier") return;
    const [kind, id, side] = key.split(".");
    const s = this.system;
    switch (kind) {
      case "skill": return this.update({ [`system.skills.${id}.xp`]: true });
      case "extra": return this.#updateArrayRow("extraSkills", Number(id), { xp: true });
      case "trait": return this.update({ [`system.traits.${id}.${side === "left" ? "xpLeft" : "xpRight"}`]: true });
      case "passion": return this.#updateArrayRow("passions", Number(id), { xp: true });
      case "honor": return this.update({ "system.honor.xp": true });
    }
  }

  /** Modifie la valeur d'une passion (ou de l'Honneur) d'un certain nombre de points. */
  async adjustPassion(key, delta) {
    const [kind, id] = key.split(".");
    if (this.type === "pnj") {
      if (kind === "honor" && this.system.honor !== null) return this.update({ "system.honor": Math.max(0, this.system.honor + delta) });
      const row = kind === "passion" ? this.system.passions[Number(id)] : null;
      if (row) return this.#updateArrayRow("passions", Number(id), { value: Math.max(0, row.value + delta) });
      return;
    }
    if (kind === "honor") return this.update({ "system.honor.value": Math.max(0, this.system.honor.value + delta) });
    if (kind === "passion") {
      const row = this.system.passions[Number(id)];
      if (!row) return;
      return this.#updateArrayRow("passions", Number(id), { value: Math.max(0, row.value + delta) });
    }
  }

  async #updateArrayRow(path, index, changes) {
    const rows = foundry.utils.deepClone(this._source.system[path]);
    if (!rows[index]) return;
    Object.assign(rows[index], changes);
    return this.update({ [`system.${path}`]: rows });
  }

  /** Raccourci : année de jeu en cours. */
  static get currentYear() {
    return game.settings.get(SYSTEM_ID, "currentYear");
  }
}
