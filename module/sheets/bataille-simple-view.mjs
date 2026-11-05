/**
 * Fiche de bataille, mode simplifié (passe d'armes) : ce que le panneau du tour affiche.
 */
import { PDVF } from "../config.mjs";
import * as S from "../rules/battle-simple.mjs";
import { formatValue } from "../rules/resolution.mjs";
import { knightActor, findEncounter, isCommanderUser } from "../battle/engine.mjs";
import {
  noOrderTest, firstChargeRound, simplePostureChoices, affordable, passSkills, profileOfSync, availableOpportunities, activeOpponents, canFight
} from "../battle/simple.mjs";

const L = (k) => game.i18n.localize(k);
const F = (k, d) => game.i18n.format(k, d);
const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0");

export const SIMPLE_STEPS = ["order", "choose", "pass", "squire"];

/** Panneau du tour en mode simplifié. */
export function simpleView(battle, user) {
  const s = battle.system;
  const st = s.state;
  const cfg = PDVF.battle.simple;
  const isGM = !!user.isGM;
  const isCommander = isCommanderUser(s, user);
  const owns = (uuid) => isGM || !!fromUuidSync(uuid)?.testUserPermission?.(user, "OWNER");
  const first = firstChargeRound(st);
  const skipTest = noOrderTest(st);
  const seen = st.intentionSeen || isGM;
  const order = st.order;

  const cardView = (id) => {
    const c = findEncounter(s, id);
    if (!c) return null;
    const p = profileOfSync(c, order);
    const takers = s.knights.filter(k => k.card === id).map(k => knightActor(k)?.name).filter(Boolean);
    return {
      id, name: c.name, teaser: c.teaser, kind: c.kind, opportunity: c.kind === "opportunity",
      img: c.img || (c.kind === "opportunity" ? "systems/pendragon-vf/icons/types/opportunity.svg" : "systems/pendragon-vf/icons/types/encounter.svg"),
      value: formatValue(p.value), danger: p.danger, attack: p.attack,
      moraleMin: c.moraleMin - st.moraleMinMod, moraleLoss: c.moraleLoss, glory: c.glory,
      perKnight: c.fixedCount ? String(c.fixedCount) : `×${String(c.perKnight).replace(".", ",")}`,
      affordable: affordable(s, c), takers: takers.join(", "), imposed: st.imposed && st.selectedId === id,
      canSwap: isCommander && st.step === "choose" && !st.imposed && c.kind === "opponent"
    };
  };
  const open = st.open.map(cardView).filter(Boolean);

  const knights = s.knights.map((k, index) => {
    const actor = knightActor(k);
    const mine = !!actor && owns(k.uuid);
    const active = canFight(k);
    const card = findEncounter(s, k.card);
    const skills = active && mine && st.step === "choose" ? passSkills(actor, order) : [];
    const postures = active && st.step === "choose" ? simplePostureChoices(s, k) : [];
    return {
      index, name: actor?.name ?? L("PDVF.Battle.MissingActor"), mine, active, status: k.status,
      statusLabel: L(`PDVF.Battle.Status.${k.status}`),
      cardName: card?.name ?? "", isDuel: k.pass === "duel", participated: k.participated,
      postureLabel: k.posture ? L(`PDVF.Battle.Posture.${k.posture}`) : "",
      passLabel: k.pass && k.pass !== "duel" ? L(`PDVF.Battle.Simple.OutcomeShort.${k.pass}`) : "",
      passCls: k.pass && k.pass !== "duel" ? `pass-${k.pass}` : "",
      roundKills: k.kills.filter(x => x.round === st.round).length,
      reinforced: k.reinforced, invoked: k.invoked,
      canChoose: mine && active && st.step === "choose",
      cardChoices: open.filter(c => c.affordable && (!st.imposed || c.imposed)).map(c => ({ value: c.id, label: c.opportunity ? `${c.name} (${L("PDVF.Battle.Kind.opportunity")})` : c.name, selected: c.id === k.card })),
      weaponChoices: skills.map(x => ({ value: x.key, label: `${x.label} ${formatValue(x.value)}`, selected: x.key === k.weapon })),
      weaponLabel: k.weapon ? actor?.getRollable(k.weapon)?.label ?? "" : "",
      postures: postures.map(p => ({ id: p, label: L(`PDVF.Battle.Posture.${p}`), active: p === k.posture, tip: L(`PDVF.Battle.Simple.PostureTip.${p}`) })),
      canInvoke: mine && active && ["choose", "pass"].includes(st.step) && !k.invoked && !k.pass,
      canPass: mine && st.step === "pass" && k.participated && !k.pass && active,
      canReset: isGM && st.step === "pass" && !!k.pass && k.pass !== "duel"
    };
  });

  return {
    simple: true,
    simpleSteps: SIMPLE_STEPS,
    first, skipTest,
    intentionLabel: st.intention && seen ? L(`PDVF.Battle.Simple.Order.${st.intention}`) : "",
    intentionHidden: !!st.intention && !seen,
    intentionChoices: S.ORDERS.map(o => ({ value: o, label: L(`PDVF.Battle.Simple.Order.${o}`), selected: o === st.intention })),
    canSetIntention: isGM && st.step === "order" && !st.order && !st.orderOutcome && st.position === "field",
    orderOutcomeLabel: st.orderOutcome ? L(`PDVF.Battle.Simple.OrderResult.${st.orderOutcome}`) : "",
    canOrderTest: isCommander && st.step === "order" && !st.orderOutcome && !st.order && !skipTest && st.position === "field",
    canGiveOrder: isCommander && st.step === "order" && !st.order && (!!st.orderOutcome || skipTest) && st.position === "field",
    orders: (first ? ["charge"] : S.ORDERS).map(o => ({ id: o, label: L(`PDVF.Battle.Simple.Order.${o}`), tip: L(`PDVF.Battle.Simple.OrderTip.${o}`) })),
    orderLabel: order ? L(`PDVF.Battle.Simple.Order.${order}`) : "",
    orderBonus: signed(Number(st.orderBonus) || 0),
    open, passKnights: knights,
    imposeNeeded: st.imposed && !st.selectedId,
    imposeChoices: isGM && st.imposed ? activeOpponents(s).map(c => ({ value: c.id, label: c.name, selected: c.id === st.selectedId })) : [],
    opportunityChoices: isGM && ["order", "choose"].includes(st.step) ? availableOpportunities(s).filter(c => !st.open.includes(c.id)).map(c => ({ value: c.id, label: c.name })) : [],
    swapCost: cfg.swapCost, reinforceCost: cfg.reinforceCost, reinforceBonus: signed(cfg.reinforceBonus),
    duels: open.filter(c => c.opportunity && s.knights.some(k => k.card === c.id && k.pass === "duel")),
    missingPasses: s.knights.filter(k => k.participated && !k.pass).map(k => knightActor(k)?.name).filter(Boolean).join(", ")
  };
}
