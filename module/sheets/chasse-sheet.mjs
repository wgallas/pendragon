import { PDVF, SYSTEM_ID } from "../config.mjs";
import { request, showToPlayers, actorOf, valueOf } from "../hunt/engine.mjs";
import * as client from "../hunt/client.mjs";
import { mergeIndexed } from "./bataille-sheet.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;
const L = (k) => game.i18n.localize(k);
const F = (k, d) => game.i18n.format(k, d);

/** Vue de la chasse, de la course ou de la poursuite. */
export function huntView(hunt) {
  const s = hunt.system;
  const cfg = PDVF.hunt;
  const isGM = !!game.user.isGM;
  const hunting = s.mode === "hunt";
  const parts = s.participants.map((p, index) => {
    const a = actorOf(p);
    const mine = !!a && (isGM || a.isOwner);
    return {
      ...p, index, name: a?.name ?? L("PDVF.Battle.MissingActor"), img: a?.img ?? "icons/svg/mystery-man.svg", mine, type: a?.type ?? "",
      hunting: valueOf(p, "skill.hunting"), move: valueOf(p, "move"), knight: a?.type === "chevalier",
      sideLabel: L(`PDVF.Hunt.Side.${p.side}`),
      sideChoices: (s.mode === "pursuit" ? ["pursuer", "quarry"] : [s.mode === "race" ? "runner" : "hunter"]).map(v => ({ value: v, label: L(`PDVF.Hunt.Side.${v}`), selected: v === p.side })),
      outLabel: p.out ? L(`PDVF.Hunt.Out.${p.outReason || "behind"}`) : p.escaped ? L("PDVF.Hunt.Out.escaped") : "",
      canStrike: mine && ((s.phase === "bay" && s.first.index === index && !s.first.done) || (s.phase === "rush" && s.rush.attackers.includes(index) && !s.rush.done.includes(index))),
      isFirst: s.phase === "bay" && s.first.index === index, inRush: s.rush.attackers.includes(index), atBay: hunting && !p.out && p.pos <= 1 && p.pos > 0,
      winner: s.winners.includes(index)
    };
  });
  // Piste : positions 1 (la proie) à 4 pour la chasse ; lignes 0 à N pour une course ou une poursuite.
  const track = hunting
    ? [1, 2, 3, 4].map(pos => ({ pos, label: pos === 1 ? L("PDVF.Hunt.PreyLine") : String(pos), prey: pos === 1 && !!s.prey.uuid, who: parts.filter(p => !p.out && p.pos === pos) }))
    : Array.from({ length: s.lines + 1 }, (_, pos) => ({ pos, label: pos === 0 ? L("PDVF.Hunt.Start") : pos === s.lines ? L("PDVF.Hunt.Finish") : String(pos), who: parts.filter(p => !p.out && Math.min(p.pos, s.lines) === pos) }));
  const out = parts.filter(p => p.out || p.escaped);
  return {
    hunt, system: s, isGM, hunting, editable: hunt.isEditable,
    modeChoices: ["hunt", "race", "pursuit"].map(v => ({ value: v, label: L(`PDVF.Hunt.Mode.${v}`), selected: v === s.mode })),
    seasonChoices: Object.keys(cfg.seasonRounds).map(v => ({ value: v, label: `${L(`PDVF.Hunt.Season.${v}`)} (${cfg.seasonRounds[v]})`, selected: v === s.season })),
    phaseLabel: L(`PDVF.Hunt.Phase.${s.phase}`), maxRounds: s.maxRounds,
    roundLabel: hunting ? F("PDVF.Hunt.RoundTitle", { round: s.round, rounds: s.maxRounds }) : F("PDVF.Hunt.ChaseTitle", { round: s.round }),
    prey: { ...s.prey, has: !!s.prey.uuid, hpLabel: `${Math.max(0, s.prey.hp)} / ${s.prey.hpMax}` },
    parts, hasParts: parts.length > 0, track, out,
    is: { [s.phase]: true },
    bayCandidates: parts.filter(p => p.atBay).map(p => ({ index: p.index, name: p.name, selected: p.index === s.first.index })),
    rushCandidates: parts.filter(p => p.side === "hunter" && !p.out).map(p => ({ index: p.index, name: p.name, checked: s.rush.attackers.includes(p.index) })),
    killerChoices: parts.filter(p => p.side === "hunter").map(p => ({ index: p.index, name: p.name })),
    caught: s.caught.map((c, i) => ({ i, quarry: parts[c.quarry]?.name ?? "?", pursuer: parts[c.pursuer]?.name ?? "?" })),
    opposedKeys: ["move", "skill.hunting", "skill.sword", "skill.spear", "char.dex"].map(k => ({ value: k, label: L(`PDVF.Hunt.Key.${k}`) })),
    winners: parts.filter(p => p.winner).map(p => p.name).join(", "),
    log: [...s.log].reverse()
  };
}

/**
 * Fiche de la chasse : préparation par le MJ (proie, chasseurs), piste, levée, tours de chasse, aboi, ruée ;
 * ou course et poursuite (lignes, tests de Mouvement).
 */
export class ChasseSheet extends HandlebarsApplicationMixin(ItemSheetV2) {

  static DEFAULT_OPTIONS = {
    classes: [SYSTEM_ID, "pdvf-sheet", "pdvf-battle-sheet", "pdvf-tournament-sheet", "pdvf-hunt-sheet"],
    position: { width: 940, height: 820 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      gm: ChasseSheet.#onGm,
      strike: ChasseSheet.#onStrike,
      openActor: ChasseSheet.#onOpenActor,
      show: ChasseSheet.#onShow
    }
  };

  static PARTS = {
    sheet: { template: `systems/${SYSTEM_ID}/templates/item/chasse/sheet.hbs`, scrollable: [".pdvf-battle-body"] }
  };

  get title() { return this.document.name; }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    return Object.assign(context, huntView(this.document));
  }

  async _onFirstRender(context, options) {
    await super._onFirstRender?.(context, options);
    this.element.addEventListener("dragover", (e) => e.preventDefault());
    this.element.addEventListener("drop", (e) => this.#onDrop(e));
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    if (!this.isEditable) for (const el of this.element.querySelectorAll("button[data-action]")) el.disabled = false;
  }

  async #onDrop(event) {
    if (!game.user.isGM) return;
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    if (!data?.uuid) return;
    const doc = await fromUuid(data.uuid);
    if (doc?.documentName !== "Actor") return;
    const zone = event.target.closest?.("[data-drop]")?.dataset.drop;
    if (zone === "prey" && doc.type === "pnj") return request(this.document, "setPrey", { uuid: doc.uuid });
    return request(this.document, "addParticipant", { uuid: doc.uuid });
  }

  _processFormData(event, form, formData) {
    const data = super._processFormData(event, form, formData);
    for (const k of Object.keys(data)) if (!["name", "img", "system"].includes(k)) delete data[k];
    if (foundry.utils.getProperty(data, "system.year") === "") foundry.utils.setProperty(data, "system.year", null);
    if (data.system) data.system = mergeIndexed(foundry.utils.deepClone(this.document._source.system), data.system);
    return data;
  }

  static async #onGm(event, target) {
    const { op } = target.dataset;
    const payload = { ...target.dataset };
    delete payload.action; delete payload.op;
    const group = target.closest("[data-group]");
    if (group) for (const el of group.querySelectorAll("select[name], input[name]")) {
      if (el.type === "checkbox") { if (el.checked) (payload[el.name] ??= []).push(el.value); }
      else payload[el.name] = el.value;
    }
    return request(this.document, op, payload);
  }

  static #onStrike(event, target) { return client.strike(this.document, Number(target.dataset.index)); }
  static #onOpenActor(event, target) { fromUuid(target.dataset.uuid).then(a => a?.sheet?.render(true)); }
  static #onShow() { showToPlayers(this.document); }
}
