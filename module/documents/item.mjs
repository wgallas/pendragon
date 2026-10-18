/**
 * Document Objet du système. Les batailles sont visibles des joueurs (observateurs) :
 * ils suivent le déroulement et agissent par leurs boutons, le MJ seul écrit dans le document.
 */
export class PendragonItem extends Item {

  static DEFAULT_ICONS = {
    bataille: "icons/svg/combat.svg",
    rencontre: "icons/svg/sword.svg",
    arme: "systems/pendragon-vf/icons/gear/sword.svg",
    armure: "systems/pendragon-vf/icons/gear/mail.svg",
    bouclier: "systems/pendragon-vf/icons/gear/shield_norman.svg",
    domaine: "systems/pendragon-vf/icons/gear/domain.svg"
  };

  async _preCreate(data, options, user) {
    if ((await super._preCreate(data, options, user)) === false) return false;
    const updates = {};
    if (!data.img || data.img === Item.DEFAULT_ICON) {
      const icon = PendragonItem.DEFAULT_ICONS[this.type];
      if (icon) updates.img = icon;
    }
    if (this.type === "bataille" && data.ownership?.default === undefined) {
      updates["ownership.default"] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
    }
    if (Object.keys(updates).length) this.updateSource(updates);
  }
}
