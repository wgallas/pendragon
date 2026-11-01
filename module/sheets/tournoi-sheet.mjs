import { PDVF, SYSTEM_ID } from "../config.mjs";
import * as T from "../rules/tournament.mjs";
import { formatValue } from "../rules/resolution.mjs";
import { request, knightActor, showToPlayers } from "../tournament/engine.mjs";
import * as client from "../tournament/client.mjs";
import { mergeIndexed } from "./bataille-sheet.mjs";
import { currentPeriod, periodAvailable } from "../documents/period.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;
const L = (k) => game.i18n.localize(k);
const F = (k, d) => game.i18n.format(k, d);
const signed = (n) => (n > 0 ? `+${n}` : `${n}`);

/** Bonus au tirage de la taille selon la période (Table 3.13). */
function sizeBonus() {
  return PDVF.tournament.sizeRollBonus[currentPeriod()] ?? 0;
}

/**
 * Vue du tournoi pour la fiche.
 * @param {Item} tournament
 */
export function tournamentView(tournament) {
  const s = tournament.system;
  const cfg = PDVF.tournament;
  const isGM = !!game.user.isGM;
  const size = s.sizeData;
  const actors = s.knights.map(k => knightActor(k));
  const owns = (a) => !!a && (isGM || a.isOwner);

  const knights = s.knights.map((k, index) => {
    const a = actors[index];
    const romantic = (a?.system?.idealEffects?.met ?? []).includes("romantic");
    const g = T.knightTournamentGlory(k, size, { romantic });
    const ab = (ev) => {
      const r = k.abridged[ev];
      return r.row ? { done: true, row: L(`PDVF.Tournament.Row.${r.row}`), glory: r.glory, damage: r.damage, skill: r.skill ? L(`PDVF.Skill.${r.skill}`) : "" } : { done: false };
    };
    const left = k.court.allowed === null ? null : Math.max(0, k.court.allowed - k.court.tests.length);
    return {
      ...k, index, name: a?.name ?? L("PDVF.Battle.MissingActor"), img: a?.img ?? "icons/svg/mystery-man.svg", uuid: k.uuid,
      mine: owns(a), romantic,
      charge: formatValue(a?.system?.skills?.charge?.value ?? 0), horsemanship: formatValue(a?.system?.skills?.horsemanship?.value ?? 0),
      hp: a ? `${a.system.health.hp.value} / ${a.system.health.hp.max}` : "—",
      abMelee: ab("melee"), abJoust: ab("joust"),
      courtLeft: left, courtRolled: k.court.allowed !== null,
      courtTests: k.court.tests.map(t => ({ skill: L(`PDVF.Skill.${t.skill}`), outcome: L(`PDVF.Outcome.${t.outcome}`), glory: t.glory })),
      side: Object.keys(cfg.sideEvents).map(ev => ({
        id: ev, label: L(`PDVF.Tournament.Side.${ev}.label`), done: !!k.side[ev],
        doneLabel: k.side[ev] ? L(`PDVF.Tournament.Side.${ev}.${k.side[ev]}`) : "",
        yes: L(`PDVF.Tournament.Side.${ev}.yes`), no: L(`PDVF.Tournament.Side.${ev}.no`)
      })),
      joustStatus: k.joustOut ? L("PDVF.Tournament.Out") : k.champion.joust ? L("PDVF.Tournament.ChampionShort") : k.joust ? F("PDVF.Tournament.Wins", { n: k.joustWins }) : "—",
      glory: g, gloryDue: Math.max(0, g.total - (Number(k.inscribed) || 0))
    };
  });

  const rounds = size.joustRounds;
  const matches = s.joust.matches.map(m => {
    const sideView = (x) => {
      const a = x.kind === "pc" ? actors[x.index] : null;
      return { ...x, mine: x.kind === "pc" && owns(a), rolled: !!x.roll.outcome, rollLabel: x.roll.outcome ? `${x.roll.die} — ${L(`PDVF.Outcome.${x.roll.outcome}`)}` : "",
        canRoll: x.kind === "pc" && owns(a) && !x.roll.outcome && m.state === "open" };
    };
    return {
      ...m, a: sideView(m.a), b: sideView(m.b), open: m.state === "open", current: m.round === s.joust.round,
      winnerName: m.winner === "a" ? m.a.name : m.winner === "b" ? m.b.name : m.winner === "none" ? L("PDVF.Tournament.NoWinner") : "",
      ready: m.state === "open" && [m.a, m.b].every(x => x.kind === "npc" || x.roll.outcome)
    };
  });
  const joustPeriodOk = periodAvailable(cfg.joust.from);

  return {
    tournament, system: s, isGM, editable: tournament.isEditable,
    sizeLabel: L(`PDVF.Tournament.Size.${s.size}`), size,
    sizeChoices: Object.keys(cfg.sizes).map(id => ({ value: id, label: L(`PDVF.Tournament.Size.${id}`), selected: id === s.size })),
    stakesChoices: ["love", "war"].map(id => ({ value: id, label: L(`PDVF.Tournament.Stakes.${id}`), selected: id === s.stakes })),
    sizeBonus: sizeBonus(), sizeBonusLabel: sizeBonus() ? signed(sizeBonus()) : "",
    ndt: s.ndt, ndtBase: s.ndtBase, ndtLabel: s.ndt === null ? "—" : formatValue(s.ndt),
    causeLabel: s.difficulty.cause ? L(`PDVF.Tournament.Cause.${s.difficulty.cause}`) : "",
    knights, hasKnights: knights.length > 0, anyMine: knights.some(k => k.mine),
    joust: { enabled: s.joust.enabled, round: s.joust.round, rounds, periodOk: joustPeriodOk, over: s.joust.round >= rounds,
      currentMatches: matches.filter(m => m.current), pastMatches: matches.filter(m => !m.current).reverse(),
      anyOpen: matches.some(m => m.open) },
    melee: { battle: s.melee.battle, exists: !!s.melee.battle },
    feast: { exists: !!s.feast },
    courtSkillChoices: cfg.courtSkills.map(id => ({ value: id, label: L(`PDVF.Skill.${id}`) })),
    challenges: s.challenges.map(c => ({ ...c, skillLabel: L(`PDVF.Skill.${c.skill}`) })).reverse(),
    prizes: s.prizes.map(p => ({ ...p, label: L(`PDVF.Tournament.Prize.${p.r}`) })),
    prizeTargets: knights.map(k => ({ value: k.name, label: k.name })),
    totals: { due: knights.reduce((t, k) => t + k.gloryDue, 0) },
    log: [...s.log].reverse(),
    facts: [
      [L("PDVF.Tournament.Fact.knights"), size.knights], [L("PDVF.Tournament.Fact.glory"), size.glory],
      [L("PDVF.Tournament.Fact.champion"), size.champion], [L("PDVF.Tournament.Fact.trophy"), `${size.trophy} £`],
      [L("PDVF.Tournament.Fact.days"), size.days], [L("PDVF.Tournament.Fact.joustRounds"), size.joustRounds],
      [L("PDVF.Tournament.Fact.courtTests"), size.courtTests], [L("PDVF.Tournament.Fact.cost"), `${size.cost} £`],
      [L("PDVF.Tournament.Fact.barber"), size.barber]
    ].map(([label, value]) => ({ label, value }))
  };
}

/**
 * Fiche du tournoi : préparation par le MJ, épreuves (abrégées, joute, mêlée), à-côtés, bilan.
 */
export class TournoiSheet extends HandlebarsApplicationMixin(ItemSheetV2) {

  _tab = null;

  static DEFAULT_OPTIONS = {
    classes: [SYSTEM_ID, "pdvf-sheet", "pdvf-battle-sheet", "pdvf-tournament-sheet"],
    position: { width: 980, height: 860 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      tournamentTab: TournoiSheet.#onTab,
      gm: TournoiSheet.#onGm,
      player: TournoiSheet.#onPlayer,
      openActor: TournoiSheet.#onOpenActor,
      openMelee: TournoiSheet.#onOpenMelee,
      openFeast: TournoiSheet.#onOpenFeast,
      show: TournoiSheet.#onShow
    }
  };

  static PARTS = {
    sheet: { template: `systems/${SYSTEM_ID}/templates/item/tournoi/sheet.hbs`, scrollable: [".pdvf-battle-body"] }
  };

  get title() { return this.document.name; }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const view = tournamentView(this.document);
    const tabs = view.isGM ? ["prep", "events", "court", "results"] : ["events", "court", "results"];
    if (!this._tab || !tabs.includes(this._tab)) this._tab = view.isGM && !view.hasKnights ? "prep" : "events";
    view.tabs = tabs.map(id => ({ id, label: L(`PDVF.Tournament.Tab.${id}`), active: id === this._tab }));
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
    // Lecture seule pour les joueurs : leurs boutons restent utilisables.
    if (!this.isEditable) for (const el of this.element.querySelectorAll("button[data-action]")) el.disabled = false;
  }

  async #onDrop(event) {
    if (!game.user.isGM) return;
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    if (!data?.uuid) return;
    const doc = await fromUuid(data.uuid);
    if (doc?.documentName === "Actor" && doc.type === "chevalier") return request(this.document, "addKnight", { uuid: doc.uuid });
  }

  _processFormData(event, form, formData) {
    const data = super._processFormData(event, form, formData);
    // Champs de travail des boutons (data-group) : pas des données du document.
    for (const k of Object.keys(data)) if (!["name", "img", "system"].includes(k)) delete data[k];
    // Nombres vides : null (NDT imposé, année)
    for (const k of ["system.difficulty.override", "system.year"]) {
      if (foundry.utils.getProperty(data, k) === "") foundry.utils.setProperty(data, k, null);
    }
    if (data.system) data.system = mergeIndexed(foundry.utils.deepClone(this.document._source.system), data.system);
    return data;
  }

  static #onTab(event, target) {
    this._tab = target.dataset.tab;
    this.render();
  }

  /** Actions du MJ, traitées par le moteur. */
  static async #onGm(event, target) {
    const { op } = target.dataset;
    const payload = { ...target.dataset };
    delete payload.action; delete payload.op;
    const group = target.closest("[data-group]");
    if (group) for (const el of group.querySelectorAll("select[name], input[name]")) payload[el.name] = el.value;
    if (op === "rollSize") payload.bonus = sizeBonus();
    if (op === "inscribe") {
      const ok = await foundry.applications.api.DialogV2.confirm({
        window: { title: L("PDVF.Tournament.Inscribe") }, content: `<p>${L("PDVF.Tournament.InscribeConfirm")}</p>`, classes: [SYSTEM_ID, "pdvf-dialog"]
      });
      if (!ok) return;
    }
    return request(this.document, op, payload);
  }

  /** Actions d'un joueur pour l'un de ses chevaliers (jets lancés chez lui). */
  static async #onPlayer(event, target) {
    const t = this.document;
    const { op, event: ev, choice } = target.dataset;
    const index = target.dataset.index !== undefined ? Number(target.dataset.index) : null;
    switch (op) {
      case "abridged": return client.abridged(t, index, ev);
      case "charge": return client.charge(t, index);
      case "court": return client.court(t, index);
      case "side": return client.sideEvent(t, index, ev, choice);
    }
  }

  static #onOpenActor(event, target) { fromUuid(target.dataset.uuid).then(a => a?.sheet?.render(true)); }
  static #onOpenMelee() { if (this.document.system.melee.battle) fromUuid(this.document.system.melee.battle).then(b => b?.sheet?.render(true)); }
  static #onOpenFeast() { if (this.document.system.feast) fromUuid(this.document.system.feast).then(f => f?.sheet?.render(true)); }
  static #onShow() { showToPlayers(this.document); }
}
