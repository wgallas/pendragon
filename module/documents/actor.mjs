import { PDVF, SYSTEM_ID } from "../config.mjs";
import { traitPair, gloryTestValue } from "../rules/resolution.mjs";

/**
 * Document Acteur du système.
 * Centralise l'accès aux Attributs testables, utilisé par la fiche et par les jets.
 */
export class PendragonActor extends Actor {

  /** Valeurs par défaut d'un nouveau chevalier. */
  async _preCreate(data, options, user) {
    if ((await super._preCreate(data, options, user)) === false) return false;
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
    if (!key || this.type !== "chevalier") return null;
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

  /** Liste des Attributs testables (pour choisir l'Attribut d'un adversaire). */
  listRollables() {
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

  /** Bonus d'Inspiration applicable à un Attribut donné. */
  inspirationBonus(key) {
    const insp = this.system.inspiration;
    if (!insp?.bonus || !insp.target) return 0;
    return insp.target === key ? insp.bonus : 0;
  }

  /** Coche la croix d'expérience d'un Attribut. */
  async markExperience(key) {
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
