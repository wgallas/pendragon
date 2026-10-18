/** Liste des blessures d'un combattant (chevalier ou PNJ). */
export function woundsField() {
  const fields = foundry.data.fields;
  return new fields.ArrayField(new fields.SchemaField({
    id: new fields.StringField({ initial: "" }),
    damage: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0, min: 0 }),
    type: new fields.StringField({ initial: "minor", choices: ["minor", "major", "mortal", "fall"] }),
    source: new fields.StringField({ initial: "" }),
    aided: new fields.BooleanField({ initial: false }),
    day: new fields.NumberField({ required: true, nullable: true, integer: true, initial: null })
  }));
}
