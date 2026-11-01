import { PDVF, SYSTEM_ID } from "../config.mjs";
import { request, guestActor, guestState, slightedGuests, feastGloryAll, showToPlayers } from "../feast/engine.mjs";
import * as client from "../feast/client.mjs";
import { mergeIndexed } from "./bataille-sheet.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;
const L = (k) => game.i18n.localize(k);
const F = (k, d) => game.i18n.format(k, d);
const signed = (n) => (n > 0 ? `+${n}` : `${n}`);

/** Nom d'un niveau de vie (vêtements), y compris les deux au-delà de Majestueux. */
function clothingLabel(id) {
  const key = PDVF.livingStandards.includes(id) ? `PDVF.Living.${id}` : `PDVF.Feast.Clothing.${id}`;
  return game.i18n.has(key) ? L(key) : id;
}

/**
 * Vue du festin pour la fiche.
 * @param {Item} feast
 */
export function feastView(feast) {
  const s = feast.system;
  const cfg = PDVF.feast;
  const isGM = !!game.user.isGM;
  const actors = s.guests.map(g => guestActor(g));
  const states = s.guests.map((g, i) => guestState(s, g, actors[i]));
  const slighted = slightedGuests(s, states);
  const glory = feastGloryAll(s);
  const owns = (a) => !!a && (isGM || a.isOwner);
  const outcome = (o) => (o ? L(`PDVF.Outcome.${o}`) : "");

  const guests = s.guests.map((g, index) => {
    const a = actors[index];
    const st = states[index];
    const mine = owns(a);
    const roundEntries = g.entries.filter(e => e.round === s.round && e.round > 0 && e.kind !== "seat");
    return {
      ...g, index, name: a?.name ?? L("PDVF.Battle.MissingActor"), img: a?.img ?? "icons/svg/mystery-man.svg", mine, st,
      startLabel: signed(st.start), engLabel: signed(st.engouement), accLabel: signed(st.acc),
      clothingChoices: [{ value: "", label: F("PDVF.Feast.ClothingDefault", { living: clothingLabel(a?.system?.economy?.living ?? "ordinary") }), selected: !g.clothing },
        ...Object.keys(cfg.clothing).map(id => ({ value: id, label: `${clothingLabel(id)} (${signed(cfg.clothing[id])})`, selected: id === g.clothing }))],
      seatChoices: [{ value: "", label: "—", selected: !g.seat }, ...Object.keys(cfg.seats).map(id => ({ value: id, label: L(`PDVF.Feast.Seat.${id}`), selected: id === g.seat }))],
      seatLabel: g.seat ? L(`PDVF.Feast.Seat.${g.seat}`) : "",
      seatMod: g.seat ? signed(cfg.seats[g.seat].mod) : "",
      seatTestLabel: g.seatTest.outcome ? outcome(g.seatTest.outcome) + (g.seatTest.second ? ` → ${outcome(g.seatTest.second)}` : "") : "",
      needSecond: g.seatTest.outcome === "fumble" && !g.seat,
      canSeat: mine && !g.seat,
      slighted: slighted.has(index), modestLabel: outcome(g.modest), canModest: mine && slighted.has(index) && !g.modest,
      yieldedLabel: outcome(g.yielded), canYield: mine && !!g.seat && !g.yielded && !st.proudFamous && !["floor", "floorFumble"].includes(g.seat),
      present: st.present,
      leftLabel: st.present ? "" : F(g.leftHow === "forced" ? "PDVF.Feast.LeftForced" : "PDVF.Feast.LeftAfter", { round: g.left }),
      canAct: mine && st.present && s.round > 0 && !st.acted && !!g.seat,
      canLeave: mine && st.present && s.round > 0 && st.acted && s.round < s.rounds,
      roundAction: roundEntries.map(e => e.kind === "activity" ? `${e.label} — ${outcome(e.outcome)}` : `${e.label} (${signed(e.mod)})${e.host ? ` ${L("PDVF.Feast.HostShort")}` : ""}`).join(" · "),
      entries: g.entries.map(e => ({ ...e, modLabel: signed(e.mod), kindLabel: L(`PDVF.Feast.Entry.${e.kind}`), outcomeLabel: outcome(e.outcome) })),
      gloryRows: g.glory,
      result: { ...glory[index], due: Math.max(0, glory[index].total - (Number(g.inscribed) || 0)) }
    };
  });

  return {
    feast, system: s, isGM, editable: feast.isEditable,
    sizeLabel: L(`PDVF.Feast.Size.${s.size}`), size: s.sizeData,
    sizeChoices: Object.keys(cfg.sizes).map(id => ({ value: id, label: `${L(`PDVF.Feast.Size.${id}`)} (${cfg.sizes[id].rounds})`, selected: id === s.size })),
    guests, hasGuests: guests.length > 0,
    round: s.round, rounds: s.rounds, started: s.round > 0, over: s.round >= s.rounds,
    roundLabel: s.round ? F("PDVF.Feast.RoundTitle", { round: s.round, rounds: s.rounds }) : L("PDVF.Feast.NotStarted"),
    dishes: [0, 1, 2].map(i => ({ index: i, value: s.dishes[i] ?? "", label: F("PDVF.Feast.Course", { n: i + 1 }) })),
    tournament: s.tournament,
    thresholdHint: F("PDVF.Feast.ThresholdHint", { threshold: s.sizeData.threshold, bonus: s.sizeData.bonus }),
    totals: { due: guests.reduce((t, g) => t + g.result.due, 0) },
    log: [...s.log].reverse()
  };
}

/**
 * Fiche du festin : préparation par le MJ, placement, tours (cartes et activités), Gloire.
 */
export class FestinSheet extends HandlebarsApplicationMixin(ItemSheetV2) {

  _tab = null;

  static DEFAULT_OPTIONS = {
    classes: [SYSTEM_ID, "pdvf-sheet", "pdvf-battle-sheet", "pdvf-tournament-sheet", "pdvf-feast-sheet"],
    position: { width: 940, height: 820 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      feastTab: FestinSheet.#onTab,
      gm: FestinSheet.#onGm,
      player: FestinSheet.#onPlayer,
      openActor: FestinSheet.#onOpenActor,
      openTournament: FestinSheet.#onOpenTournament,
      show: FestinSheet.#onShow
    }
  };

  static PARTS = {
    sheet: { template: `systems/${SYSTEM_ID}/templates/item/festin/sheet.hbs`, scrollable: [".pdvf-battle-body"] }
  };

  get title() { return this.document.name; }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const view = feastView(this.document);
    const tabs = view.isGM ? ["prep", "seating", "rounds", "results"] : ["seating", "rounds", "results"];
    if (!this._tab || !tabs.includes(this._tab)) this._tab = view.isGM && !view.hasGuests ? "prep" : (view.started ? "rounds" : "seating");
    view.tabs = tabs.map(id => ({ id, label: L(`PDVF.Feast.Tab.${id}`), active: id === this._tab }));
    view.tabIs = { [this._tab]: true };
    return Object.assign(context, view);
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
    if (doc?.documentName === "Actor" && doc.type === "chevalier") return request(this.document, "addGuest", { uuid: doc.uuid });
  }

  _processFormData(event, form, formData) {
    const data = super._processFormData(event, form, formData);
    // Champs de travail des boutons (data-group) : pas des données du document.
    for (const k of Object.keys(data)) if (!["name", "img", "system"].includes(k)) delete data[k];
    if (foundry.utils.getProperty(data, "system.year") === "") foundry.utils.setProperty(data, "system.year", null);
    if (data.system) data.system = mergeIndexed(foundry.utils.deepClone(this.document._source.system), data.system);
    return data;
  }

  static #onTab(event, target) {
    this._tab = target.dataset.tab;
    this.render();
  }

  static async #onGm(event, target) {
    const { op } = target.dataset;
    const payload = { ...target.dataset };
    delete payload.action; delete payload.op;
    const group = target.closest("[data-group]");
    if (group) for (const el of group.querySelectorAll("select[name], input[name]")) payload[el.name] = el.value;
    if (op === "inscribe") {
      const ok = await foundry.applications.api.DialogV2.confirm({
        window: { title: L("PDVF.Feast.Inscribe") }, content: `<p>${L("PDVF.Feast.InscribeConfirm")}</p>`, classes: [SYSTEM_ID, "pdvf-dialog"]
      });
      if (!ok) return;
    }
    return request(this.document, op, payload);
  }

  static async #onPlayer(event, target) {
    const f = this.document;
    const index = Number(target.dataset.index);
    switch (target.dataset.op) {
      case "seat": return client.seat(f, index);
      case "modest": return client.modest(f, index);
      case "yield": return client.yieldSeat(f, index);
      case "card": return client.card(f, index);
      case "activity": return client.activity(f, index);
      case "courtTest": return client.courtTest(f, index);
      case "leave": return client.leave(f, index);
    }
  }

  static #onOpenActor(event, target) { fromUuid(target.dataset.uuid).then(a => a?.sheet?.render(true)); }
  static #onOpenTournament() { if (this.document.system.tournament) fromUuid(this.document.system.tournament).then(t => t?.sheet?.render(true)); }
  static #onShow() { showToPlayers(this.document); }
}
