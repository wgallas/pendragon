/**
 * Document Objet du système. Les batailles sont visibles des joueurs (observateurs) :
 * ils suivent le déroulement et agissent par leurs boutons, le MJ seul écrit dans le document.
 */
import { itemIcon, itemIconUpdates } from "./icons.mjs";
import { PDVF } from "../config.mjs";
import { periodAvailable, gameYear } from "./period.mjs";

export class PendragonItem extends Item {

  /** Icône par défaut du type (et du genre d'une rencontre de bataille). */
  static getDefaultArtwork(itemData = {}) {
    const icon = itemIcon(itemData.type, itemData.system);
    return icon ? { img: icon } : super.getDefaultArtwork(itemData);
  }

  async _preCreate(data, options, user) {
    if ((await super._preCreate(data, options, user)) === false) return false;
    const updates = itemIconUpdates({ type: this.type, img: this._source.img, system: this._source.system });
    if (["bataille", "tournoi", "festin"].includes(this.type) && data.ownership?.default === undefined) {
      updates["ownership.default"] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
    }
    // Tournoi : joute à partir de la Période des Conquêtes, barrière à partir de celle des Tournois, année en cours.
    if (this.type === "tournoi") {
      const j = PDVF.tournament.joust;
      if (data.system?.joust?.enabled === undefined) updates["system.joust.enabled"] = periodAvailable(j.from);
      if (data.system?.joust?.barrier === undefined) updates["system.joust.barrier"] = periodAvailable(j.barrierFrom);
      if (data.system?.year === undefined) updates["system.year"] = gameYear() || null;
    }
    // Festin : année en cours.
    if (this.type === "festin" && data.system?.year === undefined) updates["system.year"] = gameYear() || null;
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
