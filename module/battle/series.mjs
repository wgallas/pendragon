/**
 * Batailles enchaînées : une bataille par journée. La journée suivante reprend le conroi, le paquet,
 * l'armée et les commandants de la veille ; le Moral, les passions, les opportunités jouées,
 * l'Intensité, les tours et les événements repartent de zéro.
 */
const F = (k, d) => game.i18n.format(k, d);

/** Crée la journée suivante d'une bataille et ouvre sa fiche (MJ). */
export async function createNextDay(battle) {
  if (!game.user.isGM) return null;
  const s = battle.system;
  const src = foundry.utils.deepClone(battle._source.system);
  const day = (Number(s.series.day) || 1) + 1;
  const seriesName = s.series.name || battle.name;
  const army = (a) => ({ ...a, outcome: "", forced: "" });
  const system = {
    year: src.year, place: src.place, war: src.war, kind: "battle",
    series: { name: seriesName, previous: battle.uuid, day },
    banner: src.banner, scene: src.scene, notes: "", intro: "", interlude: "",
    size: src.size, intensity: null, rounds: null, tournament: src.tournament,
    army: src.army, odds: src.odds, favors: src.favors, firstCharge: "test",
    allied: army(src.allied), enemy: army(src.enemy),
    encounters: src.encounters.map(e => ({ ...e, used: false, from: null, to: null, forced: false })),
    conroi: { ...src.conroi, moraleStart: 0, morale: 0 },
    knights: src.knights
      .filter(k => !["dead", "captured", "left"].includes(k.status))
      .map(k => ({ uuid: k.uuid, role: k.role, status: "field", arrival: null, passion: k.passion, squireLost: false, kills: [] })),
    outcome: { result: "", glory: null, commanderDouble: true, bonuses: [], loot: { mode: "rules", pounds: null, commanderPounds: null, items: "" }, note: "" }
  };
  const data = {
    name: F("PDVF.Battle.DayName", { name: seriesName, day }),
    type: "bataille",
    img: battle.img,
    folder: battle.folder?.id ?? null,
    system
  };
  // La journée de départ porte le numéro 1 et le nom de la série.
  if (!s.series.day || !s.series.name) await battle.update({ "system.series.day": s.series.day || 1, "system.series.name": seriesName });
  const created = await Item.implementation.create(data, battle.pack ? { pack: battle.pack } : {});
  if (created) {
    ui.notifications.info(F("PDVF.Battle.Notify.NextDay", { name: created.name }));
    created.sheet?.render(true);
  }
  return created;
}

/** Bataille précédente de la série (si elle existe encore). */
export function previousBattle(battle) {
  const id = battle?.system?.series?.previous;
  if (!id) return null;
  try { return fromUuidSync(id); } catch (err) { return null; }
}
