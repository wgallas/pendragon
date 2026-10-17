/**
 * Document Objet du système. Les batailles sont visibles des joueurs (observateurs) :
 * ils suivent le déroulement et agissent par leurs boutons, le MJ seul écrit dans le document.
 */
export class PendragonItem extends Item {

  static DEFAULT_ICONS = {
    bataille: "icons/svg/combat.svg",
    rencontre: "icons/svg/sword.svg"
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
