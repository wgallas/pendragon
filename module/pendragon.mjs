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
import { ensureAdversaries, ensureEncounters, ensureEquipment } from "./documents/compendium.mjs";
import { ArmeData, ArmureData, BouclierData } from "./data/equipement.mjs";
import { EquipementSheet } from "./sheets/equipement-sheet.mjs";
import { DomaineData } from "./data/domaine.mjs";
import { DomaineSheet } from "./sheets/domaine-sheet.mjs";
import * as domains from "./documents/domains.mjs";
import * as winterEngine from "./winter/engine.mjs";
import * as winterGm from "./winter/gm.mjs";
import { openWinterWizard, WinterWizard } from "./winter/wizard.mjs";
import * as tests from "./dice/tests.mjs";
import * as rules from "./rules/resolution.mjs";
import { CREATION } from "./creation/data.mjs";
import { CreationWizard, openCreationWizard } from "./creation/wizard.mjs";
import { newDayForAll, addNewDayControl, addNewDayDirectoryButton } from "./documents/new-day.mjs";
import { PendragonItem } from "./documents/item.mjs";
import { migrateDefaultIcons } from "./documents/icons.mjs";
import { BatailleData } from "./data/bataille.mjs";
import { RencontreData } from "./data/rencontre.mjs";
import { BatailleSheet } from "./sheets/bataille-sheet.mjs";
import { RencontreSheet } from "./sheets/rencontre-sheet.mjs";
import * as battleEngine from "./battle/engine.mjs";
import * as battleClient from "./battle/client.mjs";
import { ensureBattlefield } from "./battle/scene.mjs";
import { BANNER_SETTING } from "./battle/banner.mjs";
import * as combatExchange from "./combat/exchange.mjs";
import * as combatDamage from "./combat/damage.mjs";
import { registerStatuses, setStatus, STATUS } from "./combat/status.mjs";

Hooks.once("init", () => {
  console.log(`${SYSTEM_ID} | Initialisation du système Pendragon (VF)`);

  CONFIG.PDVF = PDVF;
  // Données de création : les suppléments peuvent les compléter dans leur propre hook « init ».
  PDVF.creation = CREATION;
  game.pendragon = {
    config: PDVF, newDay: newDayForAll, followers, importAdversaries: ensureAdversaries, importEncounters: ensureEncounters, importEquipment: ensureEquipment,
    tests, rules, openCreationWizard, battle: { engine: battleEngine, client: battleClient },
    domains, combat: { engage: combatExchange.engage, receiveDamage: combatDamage.receiveDamage, stats: combatDamage.combatStats },
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
  CONFIG.Item.dataModels.arme = ArmeData;
  CONFIG.Item.dataModels.armure = ArmureData;
  CONFIG.Item.dataModels.bouclier = BouclierData;
  CONFIG.Item.dataModels.domaine = DomaineData;
  // Combat : états des jetons (à cheval, désarmé) ; l'ordre du suivi de combat suit la DEX (pas d'initiative dans Pendragon)
  registerStatuses();
  CONFIG.Combat.initiative = { formula: "@characteristics.dex.value", decimals: 0 };

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

  // Période de jeu : d'après l'année, ou imposée par le MJ (équipement, chevaux, manoirs, Gloire des nouveautés).
  game.settings.register(SYSTEM_ID, "period", {
    name: "PDVF.Settings.period.name",
    hint: "PDVF.Settings.period.hint",
    scope: "world",
    config: true,
    type: new foundry.data.fields.StringField({ required: true, initial: "auto",
      choices: { auto: "PDVF.Settings.period.auto", ...Object.fromEntries(PDVF.periodOrder.filter(p => !p.sub).map(p => [p.id, PDVF.periods[p.id]])) } }),
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

  // Bandeau par défaut des batailles (image des fichiers de Foundry ; vide : bandeau neutre du système)
  game.settings.register(SYSTEM_ID, BANNER_SETTING, {
    name: "PDVF.Settings.battleBanner.name",
    hint: "PDVF.Settings.battleBanner.hint",
    scope: "world",
    config: true,
    type: String,
    default: "",
    filePicker: "image",
    onChange: () => {
      for (const app of foundry.applications.instances?.values?.() ?? []) {
        if (app instanceof BatailleSheet && app.rendered) app.render();
      }
    }
  });

  // Version du compendium des équipements déjà importée dans ce monde
  game.settings.register(SYSTEM_ID, "equipmentVersion", {
    scope: "world",
    config: false,
    type: new foundry.data.fields.NumberField({ required: true, integer: true, initial: 0 })
  });

  // Version de la mise à jour des icônes par défaut déjà faite dans ce monde
  game.settings.register(SYSTEM_ID, "iconsVersion", {
    scope: "world",
    config: false,
    type: new foundry.data.fields.NumberField({ required: true, integer: true, initial: 0 })
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
  DSC.registerSheet(Item, SYSTEM_ID, DomaineSheet, {
    types: ["domaine"],
    makeDefault: true,
    label: "PDVF.SheetLabel.domaine"
  });
  DSC.registerSheet(Item, SYSTEM_ID, EquipementSheet, {
    types: ["arme", "armure", "bouclier"],
    makeDefault: true,
    label: "PDVF.SheetLabel.equipement"
  });

  // Gabarits partiels
  foundry.applications.handlebars.loadTemplates([
    `systems/${SYSTEM_ID}/templates/actor/chevalier/parts/skill-row.hbs`,
    `systems/${SYSTEM_ID}/templates/actor/chevalier/parts/stepper.hbs`,
    `systems/${SYSTEM_ID}/templates/family/history.hbs`,
    `systems/${SYSTEM_ID}/templates/creation/stepper.hbs`,
    `systems/${SYSTEM_ID}/templates/creation/knight-status.hbs`,
    `systems/${SYSTEM_ID}/templates/actor/pnj/row.hbs`,
    `systems/${SYSTEM_ID}/templates/item/bataille/prep.hbs`,
    `systems/${SYSTEM_ID}/templates/item/bataille/effects.hbs`,
    `systems/${SYSTEM_ID}/templates/item/bataille/card-edit.hbs`,
    `systems/${SYSTEM_ID}/templates/item/bataille/event-edit.hbs`
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
  game.socket.on(battleEngine.SOCKET, combatExchange.onCombatSocket);
  winterGm.openOwnWizards();
  await ensureAdversaries();
  await ensureEncounters();
  await ensureEquipment();
  await migrateDefaultIcons();
  await ensureBattlefield();
});

// Boutons des cartes de chat (crise de passion…)
Hooks.on("renderChatMessageHTML", (message, html) => tests.onRenderChatMessage(message, html));
Hooks.on("renderChatMessageHTML", (message, html) => battleClient.onRenderChatMessage(message, html));
Hooks.on("renderChatMessageHTML", (message, html) => combatExchange.onRenderCombatCard(message, html));

// Domaines : rang du chevalier et Gloire du titre quand il en reçoit un
Hooks.on("createItem", (item, options, userId) => domains.onDomainCreated(item, options, userId));
Hooks.on("updateItem", (item, changes, options, userId) => domains.onDomainUpdated(item, changes, options, userId));

// « Nouveau jour » du MJ (outils des jetons, barre de gauche)
Hooks.on("getSceneControlButtons", (controls) => addNewDayControl(controls));
Hooks.on("renderActorDirectory", (app, html) => addNewDayDirectoryButton(app, html));
Hooks.on("renderActorDirectory", (app, html) => winterGm.addWinterDirectoryButton(app, html));
Hooks.on("updateActor", (actor, changes) => winterGm.refreshPanel(actor, changes));

// Combattants montés (sergents, chevaliers montés) : leurs nouveaux jetons sont posés « À cheval »,
// pour que l'avantage de hauteur joue dès le premier échange (aussi pour « Placer les ennemis »).
Hooks.on("createToken", (token, options, userId) => {
  if (userId !== game.user.id) return;
  const actor = token.actor;
  if (actor?.type !== "pnj" || !actor.system.mountedDefault) return;
  setStatus(actor, STATUS.mounted, true).catch(err => console.error(`${SYSTEM_ID} | Jeton à cheval`, err));
});

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
