/**
 * Pendragon (VF) — point d'entrée du système pour Foundry VTT v14.
 */
import { PDVF, SYSTEM_ID } from "./config.mjs";
import { ChevalierData } from "./data/chevalier.mjs";
import { PendragonActor } from "./documents/actor.mjs";
import { ChevalierSheet } from "./sheets/chevalier-sheet.mjs";
import * as tests from "./dice/tests.mjs";
import * as rules from "./rules/resolution.mjs";

Hooks.once("init", () => {
  console.log(`${SYSTEM_ID} | Initialisation du système Pendragon (VF)`);

  CONFIG.PDVF = PDVF;
  game.pendragon = { config: PDVF, tests, rules };

  // Documents et modèles de données
  CONFIG.Actor.documentClass = PendragonActor;
  CONFIG.Actor.dataModels.chevalier = ChevalierData;
  CONFIG.Actor.trackableAttributes = {
    chevalier: { bar: ["health.hp"], value: [] }
  };

  // Réglages du monde
  game.settings.register(SYSTEM_ID, "currentYear", {
    name: "PDVF.Settings.currentYear.name",
    hint: "PDVF.Settings.currentYear.hint",
    scope: "world",
    config: true,
    type: new foundry.data.fields.NumberField({ required: true, integer: true, initial: 508 }),
    onChange: () => {
      for (const app of foundry.applications.instances?.values?.() ?? []) {
        if (app instanceof ChevalierSheet) app.render();
      }
    }
  });

  // Fiches
  const DSC = foundry.applications.apps.DocumentSheetConfig;
  DSC.registerSheet(Actor, SYSTEM_ID, ChevalierSheet, {
    types: ["chevalier"],
    makeDefault: true,
    label: "PDVF.SheetLabel.chevalier"
  });

  // Gabarits partiels
  foundry.applications.handlebars.loadTemplates([
    `systems/${SYSTEM_ID}/templates/actor/chevalier/parts/skill-row.hbs`,
    `systems/${SYSTEM_ID}/templates/actor/chevalier/parts/stepper.hbs`
  ]);
});

// Boutons des cartes de chat (crise de passion…)
Hooks.on("renderChatMessageHTML", (message, html) => tests.onRenderChatMessage(message, html));
