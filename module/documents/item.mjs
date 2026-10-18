/**
 * Document Objet du système. Les batailles sont visibles des joueurs (observateurs) :
 * ils suivent le déroulement et agissent par leurs boutons, le MJ seul écrit dans le document.
 */
import { itemIcon, itemIconUpdates } from "./icons.mjs";

export class PendragonItem extends Item {

  /** Icône par défaut du type (et du genre d'une rencontre de bataille). */
  static getDefaultArtwork(itemData = {}) {
    const icon = itemIcon(itemData.type, itemData.system);
    return icon ? { img: icon } : super.getDefaultArtwork(itemData);
  }

  async _preCreate(data, options, user) {
    if ((await super._preCreate(data, options, user)) === false) return false;
    const updates = itemIconUpdates({ type: this.type, img: this._source.img, system: this._source.system });
    if (this.type === "bataille" && data.ownership?.default === undefined) {
      updates["ownership.default"] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
    }
    if (Object.keys(updates).length) this.updateSource(updates);
  }

  /** Une rencontre qui change de genre change aussi d'icône, si elle avait encore l'icône par défaut. */
  async _preUpdate(changed, options, user) {
    if ((await super._preUpdate(changed, options, user)) === false) return false;
    const kind = foundry.utils.getProperty(changed, "system.kind");
    if (this.type !== "rencontre" || kind === undefined || kind === this._source.system.kind) return;
    Object.assign(changed, itemIconUpdates({ type: this.type, img: changed.img ?? this._source.img, system: { kind } }));
  }
}
