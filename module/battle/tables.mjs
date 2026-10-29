/**
 * Tables d'événements aléatoires d'une bataille (ex. table de Badon en 3D6 et ses sous-tables).
 * Le tirage annonce le résultat dans le chat ; les effets typés seront appliqués par le panneau du tour.
 */
import { tableRow } from "../rules/battle.mjs";
import { announce } from "./engine.mjs";

const L = (k) => game.i18n.localize(k);
const F = (k, d) => game.i18n.format(k, d);

/**
 * Tire sur une table (et ses sous-tables, trois niveaux au plus).
 * @returns {Promise<{total:number, row:object|null, chain:object[]}>}
 */
export async function rollEventTable(battle, tableId, depth = 0) {
  const s = battle.system;
  const table = s.tables.find(t => t.id === tableId);
  if (!table) return null;
  const roll = await new Roll(String(table.formula || "1D6").replace(/D/g, "d")).evaluate();
  await roll.toMessage({ speaker: { alias: battle.name }, flavor: table.name || L("PDVF.Battle.Table") });
  const row = tableRow(table, roll.total);
  const chain = [{ table, total: roll.total, row }];
  if (row?.table && depth < 3) {
    const sub = await rollEventTable(battle, row.table, depth + 1);
    if (sub) chain.push(...sub.chain);
  }
  if (depth === 0) {
    const lines = chain.map(c => F("PDVF.Battle.TableResult", {
      table: c.table.name || L("PDVF.Battle.Table"), total: c.total, text: c.row?.text || L("PDVF.Battle.TableNoRow")
    }));
    await announce(battle, { title: table.name || L("PDVF.Battle.Table"), subtitle: battle.name, lines });
  }
  return { total: roll.total, row, chain };
}
