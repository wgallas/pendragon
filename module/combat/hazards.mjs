/**
 * Dangers hors combat (Livre du joueur, chap. 11, p. 194–197) : chute, chute d'objets, feu, asphyxie,
 * froid, maladie, poison ; et Chirurgie après le froid. Chaque danger publie une carte de combat
 * avec ses jets et un bouton « Annuler ».
 */
import { PDVF } from "../config.mjs";
import { resolveTest } from "../rules/resolution.mjs";
import { fallDice, fallDiceAfterTest, asphyxiaModifier, poisonEffect } from "../rules/hazards.mjs";
import { combatStats, receiveDamage, loseHitPoints, loseCharacteristic, treatCold, postCombatCard, testValue } from "./damage.mjs";
import { ask, healerChoices } from "./dialogs.mjs";

const L = (k) => game.i18n.localize(k);
const F = (k, d) => game.i18n.format(k, d);
const esc = (s) => foundry.utils.escapeHTML ? foundry.utils.escapeHTML(String(s ?? "")) : String(s ?? "");
const outcomeLabel = (o) => L(`PDVF.Outcome.${o}`);

async function rollFormula(formula) {
  const r = new Roll(String(formula).replace(/D/g, "d"));
  await r.evaluate();
  return r;
}

/** Valeur d'un PNJ ou d'un chevalier pour un test de caractéristique. */
function charValue(actor, id) {
  return Number(actor.system.characteristics?.[id]?.value) || 0;
}

/** Fenêtre « Dangers » : choix du danger, puis ses réglages. */
export async function promptHazard(actor) {
  const st = combatStats(actor);
  const options = PDVF.hazards.map(id => `<option value="${id}">${L(`PDVF.Hazard.${id}.name`)}</option>`).join("");
  const coldOpt = (Number(actor.system.health?.cold) || 0) > 0 ? `<option value="coldCare">${F("PDVF.Hazard.coldCare.name", { cold: actor.system.health.cold })}</option>` : "";
  const first = await ask(F("PDVF.Hazard.Title", { name: actor.name }), `
    <div class="form-group"><label>${L("PDVF.Hazard.Choose")}</label><select name="kind">${options}${coldOpt}</select></div>
    <p class="pdvf-hint">${L("PDVF.Hazard.ChooseHint")}</p>`, L("PDVF.Hazard.Next"), "fa-solid fa-arrow-right");
  if (!first?.kind) return;
  const fn = HAZARDS[first.kind];
  return fn ? fn(actor, st) : null;
}

/* -------------------------------------------- */

const HAZARDS = {
  /** Chute (p. 194) : dés selon la hauteur ; test de DEX (d'Équitation, de cheval) ; l'armure ne protège pas. */
  async fall(actor, st) {
    const r = await ask(L("PDVF.Hazard.fall.name"), `
      <div class="form-group"><label>${L("PDVF.Hazard.fall.height")}</label><input type="number" name="meters" value="2" min="0" step="1"></div>
      <div class="form-group"><label>${L("PDVF.Hazard.fall.fromHorse")}</label><input type="checkbox" name="horse" ${st.mounted ? "checked" : ""}></div>
      <p class="pdvf-hint">${L("PDVF.Hazard.fall.hint")}</p>`, L("PDVF.Combat.Apply"), "fa-solid fa-person-falling");
    if (!r) return;
    const meters = Number(r.meters) || 0;
    let dice = fallDice(meters);
    const lines = [F("PDVF.Hazard.Line.FallDice", { meters, dice })];
    const rolls = [];
    const undo = [];
    if (dice > 0) {
      const horse = !!r.horse && st.horsemanship < 99;
      const value = horse ? st.horsemanship : st.dex;
      const t = await testValue(value, 0);
      rolls.push(t.roll);
      dice = fallDiceAfterTest(dice, t.result.outcome);
      lines.push(F("PDVF.Hazard.Line.FallTest", { skill: horse ? L("PDVF.Skill.horsemanship") : L("PDVF.Char.dex.long"), value, die: t.result.die, outcome: outcomeLabel(t.result.outcome), dice }));
    }
    if (dice > 0) {
      const roll = await rollFormula(`${dice}d6`);
      rolls.push(roll);
      const out = await receiveDamage(actor, { base: roll.total, armorValue: st.virtueArmor, knockdown: false, source: F("PDVF.Hazard.fall.source", { meters }) });
      lines.push(...out.lines); rolls.push(...out.rolls); undo.push(out.undo);
    } else lines.push(L("PDVF.Hazard.Line.NoDamage"));
    return postCombatCard({ actor, title: L("PDVF.Hazard.fall.name"), subtitle: actor.name, sections: [{ lines }], rolls, undo });
  },

  /** Chute d'objets (p. 194) : 2D6 à 16D6 ; l'armure protège, le bouclier aussi si l'on voit venir le danger. */
  async objects(actor, st) {
    const r = await ask(L("PDVF.Hazard.objects.name"), `
      <div class="form-group"><label>${L("PDVF.Hazard.objects.size")}</label><select name="dice">
        <option value="2D6">${L("PDVF.Hazard.objects.small")}</option><option value="3D6">${L("PDVF.Hazard.objects.large")}</option>
        <option value="6D6">${L("PDVF.Hazard.objects.huge")}</option><option value="16D6">${L("PDVF.Hazard.objects.enormous")}</option></select></div>
      <div class="form-group"><label>${L("PDVF.Hazard.Formula")}</label><input type="text" name="formula" value="" placeholder="4D6"></div>
      <div class="form-group"><label>${F("PDVF.Hazard.objects.shield", { value: st.shield })}</label><input type="checkbox" name="shield"></div>`,
    L("PDVF.Combat.Apply"), "fa-solid fa-cubes-stacked");
    if (!r) return;
    const roll = await rollFormula(String(r.formula || "").trim() || r.dice);
    const out = await receiveDamage(actor, { base: roll.total, shield: r.shield ? st.shield : 0, shieldIsShield: true, knockdown: false, source: L("PDVF.Hazard.objects.source") });
    return postCombatCard({ actor, title: L("PDVF.Hazard.objects.name"), subtitle: actor.name, sections: [{ lines: out.lines }], rolls: [roll, ...out.rolls], undo: [out.undo] });
  },

  /**
   * Feu (p. 194–195) : dégâts par tour ; l'armure ne protège qu'au premier tour (elle chauffe ensuite) ;
   * tout le feu fait une seule blessure.
   */
  async fire(actor, st) {
    const r = await ask(L("PDVF.Hazard.fire.name"), `
      <div class="form-group"><label>${L("PDVF.Hazard.fire.dice")}</label><select name="dice">
        <option value="1D6">${L("PDVF.Hazard.fire.flame")}</option><option value="2D6">${L("PDVF.Hazard.fire.blaze")}</option><option value="3D6">${L("PDVF.Hazard.fire.inferno")}</option></select></div>
      <div class="form-group"><label>${L("PDVF.Hazard.Rounds")}</label><input type="number" name="rounds" value="1" min="1" max="20" step="1"></div>
      <div class="form-group"><label>${L("PDVF.Hazard.fire.ignoreArmor")}</label><input type="checkbox" name="ignore"></div>
      <p class="pdvf-hint">${L("PDVF.Hazard.fire.hint")}</p>`, L("PDVF.Combat.Apply"), "fa-solid fa-fire");
    if (!r) return;
    const rounds = Math.max(1, Math.min(20, Number(r.rounds) || 1));
    const lines = [];
    const rolls = [];
    let total = 0;
    for (let i = 0; i < rounds; i++) {
      const roll = await rollFormula(r.dice);
      rolls.push(roll);
      const armor = (i === 0 && !r.ignore) ? st.armor : st.virtueArmor;
      const real = Math.max(0, roll.total - armor);
      total += real;
      lines.push(F("PDVF.Hazard.Line.FireRound", { round: i + 1, rolled: roll.total, armor, real }));
    }
    const undo = [];
    if (total > 0) {
      const out = await receiveDamage(actor, { base: total, armorValue: 0, knockdown: false, source: L("PDVF.Hazard.fire.source") });
      lines.push(...out.lines); rolls.push(...out.rolls); undo.push(out.undo);
    } else lines.push(L("PDVF.Hazard.Line.NoDamage"));
    lines.push(L("PDVF.Hazard.fire.firstAid"));
    return postCombatCard({ actor, title: L("PDVF.Hazard.fire.name"), subtitle: actor.name, sections: [{ lines }], rolls, undo });
  },

  /**
   * Asphyxie (p. 193–194) : un test de CON par tour (−1 cumulatif après le premier) ; après le premier
   * échec, 1D6 par tour suivant (plus si la vapeur est toxique). Pas de blessure.
   */
  async asphyxia(actor, st) {
    const r = await ask(L("PDVF.Hazard.asphyxia.name"), `
      <div class="form-group"><label>${L("PDVF.Hazard.Rounds")}</label><input type="number" name="rounds" value="3" min="1" max="30" step="1"></div>
      <div class="form-group"><label>${L("PDVF.Hazard.asphyxia.toxic")}</label><input type="text" name="toxic" value="" placeholder="1D6"></div>
      <p class="pdvf-hint">${L("PDVF.Hazard.asphyxia.hint")}</p>`, L("PDVF.Combat.Apply"), "fa-solid fa-lungs");
    if (!r) return;
    const rounds = Math.max(1, Math.min(30, Number(r.rounds) || 1));
    const con = charValue(actor, "con");
    const lines = [];
    const rolls = [];
    let failed = false;
    let total = 0;
    for (let i = 1; i <= rounds; i++) {
      if (!failed) {
        const mod = asphyxiaModifier(i);
        const t = await testValue(con, mod);
        rolls.push(t.roll);
        lines.push(F("PDVF.Hazard.Line.HoldBreath", { round: i, con, mod: mod ? ` (${mod})` : "", die: t.result.die, outcome: outcomeLabel(t.result.outcome) }));
        if (!t.result.success) failed = true;
        continue;
      }
      const formula = r.toxic ? `1d6 + ${String(r.toxic).replace(/D/g, "d")}` : "1d6";
      const roll = await rollFormula(formula);
      rolls.push(roll);
      total += roll.total;
      lines.push(F("PDVF.Hazard.Line.Suffocate", { round: i, damage: roll.total }));
    }
    const undo = [];
    if (total > 0) {
      const out = await loseHitPoints(actor, total);
      lines.push(...out.lines); undo.push(out.undo);
    } else lines.push(L("PDVF.Hazard.Line.NoDamage"));
    return postCombatCard({ actor, title: L("PDVF.Hazard.asphyxia.name"), subtitle: actor.name, sections: [{ lines }], rolls, undo });
  },

  /** Froid (p. 195) : test de CON par jour (froid) ou par tour (glacial) ; 1D6 par échec, sans blessure. */
  async cold(actor) {
    const r = await ask(L("PDVF.Hazard.cold.name"), `
      <div class="form-group"><label>${L("PDVF.Hazard.cold.kind")}</label><select name="kind">
        <option value="cold">${L("PDVF.Hazard.cold.cold")}</option><option value="freezing">${L("PDVF.Hazard.cold.freezing")}</option></select></div>
      <div class="form-group"><label>${L("PDVF.Hazard.cold.tests")}</label><input type="number" name="tests" value="1" min="1" max="30" step="1"></div>
      <div class="form-group"><label>${L("PDVF.Combat.Modifier")}</label><input type="number" name="modifier" value="0" step="1"></div>
      <p class="pdvf-hint">${L("PDVF.Hazard.cold.hint")}</p>`, L("PDVF.Combat.Apply"), "fa-solid fa-snowflake");
    if (!r) return;
    const tests = Math.max(1, Math.min(30, Number(r.tests) || 1));
    const con = charValue(actor, "con");
    const mod = Number(r.modifier) || 0;
    const lines = [];
    const rolls = [];
    let total = 0;
    for (let i = 1; i <= tests; i++) {
      const t = await testValue(con, mod);
      rolls.push(t.roll);
      let damage = 0;
      if (!t.result.success) { const d = await rollFormula("1d6"); rolls.push(d); damage = d.total; total += damage; }
      lines.push(F(damage ? "PDVF.Hazard.Line.ColdHurt" : "PDVF.Hazard.Line.ColdOk", {
        unit: L(`PDVF.Hazard.cold.unit.${r.kind}`), n: i, con, mod: mod ? ` (${mod > 0 ? "+" : ""}${mod})` : "", die: t.result.die, outcome: outcomeLabel(t.result.outcome), damage
      }));
    }
    const undo = [];
    if (total > 0) {
      const out = await loseHitPoints(actor, total, { cold: total });
      lines.push(...out.lines, L("PDVF.Hazard.cold.surgery")); undo.push(out.undo);
    } else lines.push(L("PDVF.Hazard.Line.NoDamage"));
    return postCombatCard({ actor, title: L("PDVF.Hazard.cold.name"), subtitle: actor.name, sections: [{ lines }], rolls, undo });
  },

  /** Chirurgie après le froid : la moitié des PV perdus au froid, tout sur un critique. */
  async coldCare(actor) {
    const rows = healerChoices(actor, "chirurgery").filter(h => !h.self);
    const r = await ask(F("PDVF.Hazard.coldCare.name", { cold: actor.system.health.cold }), `
      <div class="form-group"><label>${L("PDVF.Combat.Surgeon")}</label><select name="surgeon">
        ${rows.map(h => `<option value="${h.id}">${esc(h.label)}</option>`).join("")}
        <option value="manual">${L("PDVF.Combat.OtherHealer")}</option></select></div>
      <div class="form-group"><label>${L("PDVF.Combat.OtherValue")}</label><input type="number" name="value" value="10" min="0" step="1"></div>`,
    L("PDVF.Hazard.coldCare.apply"), "fa-solid fa-kit-medical");
    if (!r) return;
    const h = rows.find(x => x.id === r.surgeon);
    const surgeon = h ? { name: h.name, value: h.value } : { name: L("PDVF.Combat.OtherHealer"), value: Number(r.value) || 0 };
    const out = await treatCold(actor, surgeon);
    return postCombatCard({ actor, title: L("PDVF.Hazard.coldCare.title"), subtitle: actor.name, sections: [{ lines: out.lines }], rolls: out.rolls, undo: [out.undo] });
  },

  /**
   * Maladie (p. 195) : le MJ fixe les dégâts, et s'ils font une blessure (soignée par la Chirurgie), une
   * perte de PV ou une perte de caractéristique. Le malade est Affaibli.
   */
  async disease(actor) {
    const chars = PDVF.characteristics.map(c => `<option value="${c}">${L(`PDVF.Hazard.disease.char`)} : ${L(`PDVF.Char.${c}.long`)}</option>`).join("");
    const r = await ask(L("PDVF.Hazard.disease.name"), `
      <div class="form-group"><label>${L("PDVF.Hazard.disease.illness")}</label><input type="text" name="name" value="" placeholder="${L("PDVF.Hazard.disease.placeholder")}"></div>
      <div class="form-group"><label>${L("PDVF.Hazard.Formula")}</label><input type="text" name="formula" value="1D6"></div>
      <div class="form-group"><label>${L("PDVF.Hazard.disease.effect")}</label><select name="mode">
        <option value="hp">${L("PDVF.Hazard.disease.hp")}</option><option value="wound">${L("PDVF.Hazard.disease.wound")}</option>${chars}</select></div>
      <p class="pdvf-hint">${L("PDVF.Hazard.disease.hint")}</p>`, L("PDVF.Combat.Apply"), "fa-solid fa-virus");
    if (!r) return;
    const roll = await rollFormula(r.formula || "1d6");
    const source = r.name || L("PDVF.Hazard.disease.name");
    const lines = [F("PDVF.Hazard.Line.Disease", { name: actor.name, illness: source, damage: roll.total })];
    let out;
    if (r.mode === "wound") out = await receiveDamage(actor, { base: roll.total, armorValue: 0, knockdown: false, source });
    else if (r.mode === "hp") out = await loseHitPoints(actor, roll.total, { debilitate: true });
    else out = await loseCharacteristic(actor, r.mode, roll.total);
    lines.push(...out.lines);
    const undo = [out.undo];
    if (r.mode !== "hp" && !actor.system.health.debilitated) {
      const more = await loseHitPoints(actor, 0, { debilitate: true });
      lines.push(...more.lines); undo.push(more.undo);
    }
    return postCombatCard({ actor, title: L("PDVF.Hazard.disease.name"), subtitle: source, sections: [{ lines }], rolls: [roll, ...(out.rolls ?? [])], undo });
  },

  /**
   * Poison (p. 196, Table 11.3) : test de CON contre l'efficacité (opposition fixe) ; succès partiel :
   * −moitié de l'efficacité en CON ; échec : −l'efficacité. Un antidote trouvé par la Chirurgie,
   * donné à temps, neutralise le poison.
   */
  async poison(actor) {
    const options = PDVF.poisons.map(p => `<option value="${p.id}">${L(`PDVF.Hazard.poison.${p.id}`)} (${p.potency})</option>`).join("");
    const rows = healerChoices(actor, "chirurgery");
    const r = await ask(L("PDVF.Hazard.poison.name"), `
      <div class="form-group"><label>${L("PDVF.Hazard.poison.kind")}</label><select name="poison">${options}<option value="custom">${L("PDVF.Hazard.poison.custom")}</option></select></div>
      <div class="form-group"><label>${L("PDVF.Hazard.poison.potency")}</label><input type="number" name="potency" value="" min="0" step="1" placeholder="${L("PDVF.Hazard.poison.potencyHint")}"></div>
      <div class="form-group"><label>${L("PDVF.Hazard.poison.antidote")}</label><select name="healer">
        <option value="">${L("PDVF.Hazard.poison.noAntidote")}</option>
        ${rows.map(h => `<option value="${h.id}">${esc(h.label)}</option>`).join("")}
        <option value="manual">${L("PDVF.Combat.OtherHealer")}</option></select></div>
      <div class="form-group"><label>${L("PDVF.Combat.OtherValue")}</label><input type="number" name="value" value="10" min="0" step="1"></div>
      <div class="form-group"><label>${L("PDVF.Hazard.poison.elixir")}</label><input type="checkbox" name="elixir"></div>
      <p class="pdvf-hint">${L("PDVF.Hazard.poison.hint")}</p>`, L("PDVF.Combat.Apply"), "fa-solid fa-skull-crossbones");
    if (!r) return;
    const preset = PDVF.poisons.find(p => p.id === r.poison);
    // Efficacité saisie (le formulaire rend null pour un champ vide) ; sinon celle du poison choisi
    const typed = r.potency !== null && r.potency !== undefined && String(r.potency).trim() !== "" && Number.isFinite(Number(r.potency));
    const potency = typed ? Number(r.potency) : (preset?.potency ?? 10);
    const label = preset && !typed ? L(`PDVF.Hazard.poison.${preset.id}`) : F("PDVF.Hazard.poison.potencyLabel", { potency });
    const lines = [];
    const rolls = [];
    // Antidote : test de Chirurgie (+1D6 avec l'élixir d'un apothicaire, Livre des Nobles p. 106)
    if (r.healer) {
      const h = rows.find(x => x.id === r.healer);
      const healer = h ? { name: h.name, value: h.value } : { name: L("PDVF.Combat.OtherHealer"), value: Number(r.value) || 0 };
      let bonus = 0;
      if (r.elixir) { const e = await rollFormula("1d6"); rolls.push(e); bonus = e.total; }
      const t = await testValue(healer.value, bonus);
      rolls.push(t.roll);
      lines.push(F("PDVF.Hazard.Line.Antidote", { healer: healer.name, value: healer.value, mod: bonus ? ` (+${bonus})` : "", die: t.result.die, outcome: outcomeLabel(t.result.outcome) }));
      if (t.result.success) {
        lines.push(F("PDVF.Hazard.Line.Neutralized", { name: actor.name }));
        return postCombatCard({ actor, title: L("PDVF.Hazard.poison.name"), subtitle: label, sections: [{ lines }], rolls });
      }
    }
    const con = charValue(actor, "con");
    const d20 = await rollFormula("1d20");
    rolls.push(d20);
    const result = resolveTest(con, 0, d20.total);
    const eff = poisonEffect(result, potency);
    lines.push(F("PDVF.Hazard.Line.PoisonTest", { con, potency, die: result.die, outcome: outcomeLabel(result.outcome), effect: L(`PDVF.Hazard.poison.effect.${eff.effect}`) }));
    const undo = [];
    if (eff.loss) {
      const out = await loseCharacteristic(actor, "con", eff.loss, { poison: true });
      lines.push(...out.lines, L("PDVF.Hazard.poison.recovery")); undo.push(out.undo);
    }
    return postCombatCard({ actor, title: L("PDVF.Hazard.poison.name"), subtitle: label, sections: [{ lines }], rolls, undo });
  }
};
