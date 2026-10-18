import { PDVF } from "../config.mjs";

const fields = foundry.data.fields;
const int = (initial, opts = {}) => new fields.NumberField({ required: true, nullable: false, integer: true, initial, ...opts });
const str = (initial = "", opts = {}) => new fields.StringField({ initial, ...opts });
const bool = (initial = false) => new fields.BooleanField({ initial });

/** Champs communs aux objets d'équipement. */
function common() {
  return {
    description: str(),
    period: str("all", { choices: Object.keys(PDVF.periods) }),
    periodNote: str(),
    price: new fields.NumberField({ required: true, nullable: true, integer: true, min: 0, initial: null }),
    quantity: int(1, { min: 0 }),
    equipped: bool(false),
    source: str()
  };
}

/** Dégâts d'un profil d'arme. */
function damage(base = "character") {
  return new fields.SchemaField({
    base: str(base, { choices: PDVF.damageBases }),
    dice: int(0),
    flat: int(0),
    max: int(0, { min: 0 })
  });
}

/** Objet « Arme » (Tables 8.1 et 8.2). */
export class ArmeData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      ...common(),
      group: str("melee", { choices: PDVF.weaponGroups }),
      skill: str("sword"),
      use: str("both", { choices: ["foot", "horse", "both"] }),
      damage: damage(),
      quality: int(0),
      // Variantes de dégâts ; « when » les applique d'office dans un échange (contre mailles, plates, sans armure)
      alts: new fields.ArrayField(new fields.SchemaField({ label: str(), dice: int(1), when: str("", { blank: true, choices: ["", "mail", "plate", "unarmored"] }) })),
      long: bool(false),
      blunt: bool(false),
      swordTie: bool(false),
      parry: int(0, { min: 0 }),
      twoHanded: bool(false),
      shieldBreaker: bool(false),
      // Portée des armes de jet ; vide pour une arme de mêlée.
      range: str("", { blank: true, choices: ["", ...PDVF.ranges] }),
      thrown: new fields.SchemaField({
        enabled: bool(false),
        skill: str("thrown"),
        damage: damage(),
        range: str("short", { choices: PDVF.ranges })
      }),
      advantage: str(),
      disadvantage: str()
    };
  }
}

/** Objet « Armure » : pièce d'armure ou heaume (Tables 9.2 et 9.3). */
export class ArmureData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      ...common(),
      kind: str("body", { choices: PDVF.armorKinds }),
      material: str("mail", { choices: PDVF.armorMaterials }),
      value: int(0, { min: 0 }),
      // Pièce portée par-dessus une armure de corps (cotte de plates sur un haubert) : ce qu'elle ajoute alors.
      layered: int(0, { min: 0 }),
      padding: bool(false),
      closed: bool(false),
      moveFoot: int(0),
      notes: str()
    };
  }
}

/** Objet « Bouclier » (Table 9.4). */
export class BouclierData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      ...common(),
      size: str("large", { choices: ["small", "medium", "large"] }),
      value: int(6, { min: 0 }),
      rangedPenalty: int(0),
      mountedPenalty: int(0),
      chargeExempt: bool(false),
      noMissile: bool(false),
      disadvantage: str(),
      notes: str()
    };
  }
}
