/**
 * Pendragon (VF) — point d'entrée du système pour Foundry VTT v14.
 */
import { PDVF, SYSTEM_ID } from "./config.mjs";
import { ChevalierData } from "./data/chevalier.mjs";
import { PendragonActor } from "./documents/actor.mjs";
import { ChevalierSheet } from "./sheets/chevalier-sheet.mjs";
import { PnjData } from "./data/pnj.mjs";
import { PnjSheet } from "./sheets/pnj-sheet.mjs";
import { ChevalData } from "./data/cheval.mjs";
import { ChevalSheet } from "./sheets/cheval-sheet.mjs";
import * as followers from "./documents/followers.mjs";
import { ensureAdversaries, ensureEncounters } from "./documents/compendium.mjs";
import * as winterEngine from "./winter/engine.mjs";
import * as winterGm from "./winter/gm.mjs";
import { openWinterWizard, WinterWizard } from "./winter/wizard.mjs";
import * as tests from "./dice/tests.mjs";
import * as rules from "./rules/resolution.mjs";
import { CREATION } from "./creation/data.mjs";
import { CreationWizard, openCreationWizard } from "./creation/wizard.mjs";
import { newDayForAll, addNewDayControl, addNewDayDirectoryButton } from "./documents/new-day.mjs";
import { PendragonItem } from "./documents/item.mjs";
import { BatailleData } from "./data/bataille.mjs";
import { RencontreData } from "./data/rencontre.mjs";
import { BatailleSheet } from "./sheets/bataille-sheet.mjs";
import { RencontreSheet } from "./sheets/rencontre-sheet.mjs";
import * as battleEngine from "./battle/engine.mjs";
import * as battleClient from "./battle/client.mjs";

Hooks.once("init", () => {
  console.log(`${SYSTEM_ID} | Initialisation du système Pendragon (VF)`);

  CONFIG.PDVF = PDVF;
  // Données de création : les suppléments peuvent les compléter dans leur propre hook « init ».
  PDVF.creation = CREATION;
  game.pendragon = {
    config: PDVF, newDay: newDayForAll, followers, importAdversaries: ensureAdversaries, importEncounters: ensureEncounters,
    tests, rules, openCreationWizard, battle: { engine: battleEngine, client: battleClient },
    winter: { engine: winterEngine, openPanel: winterGm.openWinterPanel, start: winterGm.startWinter, close: winterGm.closeWinter, open: openWinterWizard }
  };

  // Documents et modèles de données
  CONFIG.Actor.documentClass = PendragonActor;
  CONFIG.Actor.dataModels.chevalier = ChevalierData;
  CONFIG.Actor.dataModels.pnj = PnjData;
  CONFIG.Actor.dataModels.cheval = ChevalData;
  CONFIG.Item.documentClass = PendragonItem;
  CONFIG.Item.dataModels.bataille = BatailleData;
  CONFIG.Item.dataModels.rencontre = RencontreData;
  CONFIG.Actor.trackableAttributes = {
    chevalier: { bar: ["health.hp"], value: [] },
    pnj: { bar: ["health.hp"], value: [] },
    cheval: { bar: ["health.hp"], value: [] }
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
        if (app instanceof ChevalierSheet || app instanceof PnjSheet || app instanceof ChevalSheet) app.render();
      }
    }
  });

  // Hiver en cours (année ; 0 : aucun) : l'assistant d'hiver des joueurs est ouvert
  game.settings.register(SYSTEM_ID, "winterYear", {
    scope: "world",
    config: false,
    type: new foundry.data.fields.NumberField({ required: true, integer: true, initial: 0 }),
    onChange: () => {
      for (const app of foundry.applications.instances?.values?.() ?? []) {
        if (app instanceof ChevalierSheet || app instanceof winterGm.WinterPanel) app.render();
      }
    }
  });

  // Version du compendium des rencontres de bataille déjà importée dans ce monde
  game.settings.register(SYSTEM_ID, "encountersVersion", {
    scope: "world",
    config: false,
    type: new foundry.data.fields.NumberField({ required: true, integer: true, initial: 0 })
  });

  // Version du compendium des adversaires déjà importée dans ce monde
  game.settings.register(SYSTEM_ID, "adversariesVersion", {
    scope: "world",
    config: false,
    type: new foundry.data.fields.NumberField({ required: true, integer: true, initial: 0 })
  });

  // Jour en cours (compteur avancé par « Nouveau jour » ; sert à l'usage quotidien des passions)
  game.settings.register(SYSTEM_ID, "currentDay", {
    scope: "world",
    config: false,
    type: new foundry.data.fields.NumberField({ required: true, integer: true, initial: 1 }),
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
  DSC.registerSheet(Actor, SYSTEM_ID, PnjSheet, {
    types: ["pnj"],
    makeDefault: true,
    label: "PDVF.SheetLabel.pnj"
  });
  DSC.registerSheet(Actor, SYSTEM_ID, ChevalSheet, {
    types: ["cheval"],
    makeDefault: true,
    label: "PDVF.SheetLabel.cheval"
  });

  DSC.registerSheet(Item, SYSTEM_ID, BatailleSheet, {
    types: ["bataille"],
    makeDefault: true,
    label: "PDVF.SheetLabel.bataille"
  });
  DSC.registerSheet(Item, SYSTEM_ID, RencontreSheet, {
    types: ["rencontre"],
    makeDefault: true,
    label: "PDVF.SheetLabel.rencontre"
  });

  // Gabarits partiels
  foundry.applications.handlebars.loadTemplates([
    `systems/${SYSTEM_ID}/templates/actor/chevalier/parts/skill-row.hbs`,
    `systems/${SYSTEM_ID}/templates/actor/chevalier/parts/stepper.hbs`,
    `systems/${SYSTEM_ID}/templates/family/history.hbs`,
    `systems/${SYSTEM_ID}/templates/creation/stepper.hbs`,
    `systems/${SYSTEM_ID}/templates/creation/knight-status.hbs`,
    `systems/${SYSTEM_ID}/templates/actor/pnj/row.hbs`
  ]);
});

// Un cheval ou un suivant modifié : les fiches de chevalier ouvertes se redessinent (écurie, suite, Gloire passive)
Hooks.on("updateActor", (actor) => {
  if (!["cheval", "pnj"].includes(actor.type)) return;
  for (const app of foundry.applications.instances?.values?.() ?? []) {
    if (app instanceof ChevalierSheet && app.rendered) {
      const s = app.document.system;
      if (s.horses?.some(h => h.uuid === actor.uuid) || s.followers?.some(f => f.uuid === actor.uuid)) app.render();
    }
  }
});

// Compendiums des adversaires et des rencontres : créés ou mis à jour par le MJ au chargement du monde ;
// socket du système (demandes des joueurs pendant une bataille).
Hooks.once("ready", async () => {
  game.socket.on(battleEngine.SOCKET, battleEngine.onSocket);
  game.socket.on(winterEngine.SOCKET, winterGm.onWinterSocket);
  winterGm.openOwnWizards();
  await ensureAdversaries();
  await ensureEncounters();
});

// Boutons des cartes de chat (crise de passion…)
Hooks.on("renderChatMessageHTML", (message, html) => tests.onRenderChatMessage(message, html));
Hooks.on("renderChatMessageHTML", (message, html) => battleClient.onRenderChatMessage(message, html));

// « Nouveau jour » du MJ (outils des jetons, barre de gauche)
Hooks.on("getSceneControlButtons", (controls) => addNewDayControl(controls));
Hooks.on("renderActorDirectory", (app, html) => addNewDayDirectoryButton(app, html));
Hooks.on("renderActorDirectory", (app, html) => winterGm.addWinterDirectoryButton(app, html));
Hooks.on("updateActor", (actor) => winterGm.refreshPanel(actor));

// Assistant de création : s'ouvre pour un chevalier tout neuf créé par cet utilisateur.
Hooks.on("createActor", (actor, options, userId) => {
  if (userId !== game.user.id || actor.type !== "chevalier" || options.pdvfSkipWizard) return;
  const fresh = !actor.system.chronicle?.length && !actor.getFlag(SYSTEM_ID, "creation")?.done;
  if (!fresh) return;
  // La fiche s'ouvre en même temps : on attend qu'elle soit affichée, puis on place l'assistant devant.
  setTimeout(async () => {
    const wizard = new CreationWizard(actor);
    await wizard.render({ force: true });
    wizard.bringToFront?.();
  }, 600);
});

// L'assistant reste devant la fiche quand celle-ci se redessine.
Hooks.on("renderChevalierSheet", (sheet) => {
  for (const app of foundry.applications.instances?.values?.() ?? []) {
    if (app instanceof CreationWizard && app.actor === sheet.document && app.rendered) app.bringToFront?.();
  }
});
