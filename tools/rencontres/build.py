"""Construit data/rencontres.json : les rencontres de bataille du Livre du maître (chap. 6).

Seules les valeurs de jeu sont reprises (perte et minimum de Moral, VC, effectifs, Gloire, rançon) ;
les descriptions sont des résumés reformulés des règles particulières, avec la page du livre.
Les adversaires renvoient aux acteurs du compendium « Pendragon — Adversaires » (identifiants fixes).

Usage : python3 tools/rencontres/build.py  (depuis la racine du dépôt)
"""
import hashlib, json

VERSION = 2
ICONS = "systems/pendragon-vf/icons/types"
ADV = "Compendium.world.pendragon-adversaires.Actor."
ALL = ["feudal", "feudalLesser", "saxon", "cymric", "pict"]

def rid(name):
    return hashlib.md5(("rencontre:" + name).encode()).hexdigest()[:16]

FOLDERS = [
    {"_id": rid("folder:feudal"), "name": "Opposants féodaux", "type": "Item", "sorting": "m", "sort": 100},
    {"_id": rid("folder:march"), "name": "Opposants des marches", "type": "Item", "sorting": "m", "sort": 200},
    {"_id": rid("folder:opp"), "name": "Opportunités", "type": "Item", "sorting": "m", "sort": 300},
]
F_FEUDAL, F_MARCH, F_OPP = (f["_id"] for f in FOLDERS)

KNIGHT_RANSOM = "1D6 : 1 chevalier pauvre 3 £ ; 2–5 chevalier de maisonnée 4 £ ; 6 chevalier vassal 10 £"
ELITE_RANSOM = "1D6 : 1–5 chevalier de maisonnée 4 £ ; 6 chevalier vassal 10 £"

E = [
    # nom, dossier, perte, minimum, VC, par PJ, PNJ, Gloire, drapeaux, rançon, armées, description
    ("Paysans", F_FEUDAL, "1D3", 5, 1/16, 5, "5505c99f384fd134", 0, {}, "", ["feudal", "feudalLesser", "cymric"],
     "Levée de paysans sans cœur à l'ouvrage ; aucune Gloire à les vaincre. Cinq par PJ, dont la moitié seulement attaque à chaque tour "
     "(pénalité d'adversaires multiples). Chargés par des chevaliers, ils testent Couard et fuient sur un succès. Un paysan blessé fuit à la fin du tour ; "
     "à la fin de chaque tour, test collectif de Valeureux : échec, la moitié fuit ; échec critique, tous fuient. (p. 137)"),
    ("Lanciers", F_FEUDAL, "1D6", 8, 1/8, 3, "c4d36e0c2ea2837a", 10, {}, "", ["feudal", "feudalLesser", "saxon", "cymric", "pict"],
     "Piétaille armée de lances à deux mains, dangereuse en mur de lances pour les chevaliers et leurs chevaux. Trois par PJ, qui se liguent contre lui. "
     "Ils peuvent planter leurs lances contre une charge si tout le groupe réussit un test de Valeureux ; pas de malus contre des cavaliers. "
     "Ils reculent en Défense au tiers de pertes graves et détalent aux deux tiers. (p. 137)"),
    ("Fantassins", F_FEUDAL, "1D6", 7, 1/8, 2, "ba40b3149d025664", 10, {}, "", ["feudal", "feudalLesser", "cymric"],
     "Hommes d'armes à l'épée, à la masse ou à la hache, armure légère et bouclier. Deux par PJ (un seul jet d'armement). "
     "Chargés par des chevaliers montés : test collectif de Valeureux (échec, la moitié fuit ; échec critique, tous). "
     "Ils fuient aussi à la moitié de pertes graves. Modificateur de hauteur contre les cavaliers, bonus d'arme longue à la lance. (p. 138)"),
    ("Archers", F_FEUDAL, "1D6", 5, 1/8, 3, "55ba3d7511dd7caf", 5, {"ranged": True}, "", ["feudal", "feudalLesser", "saxon"],
     "Trois archers par PJ, qui tirent dès la longue portée (« Réduire la distance », Livre du joueur p. 152). Le commandant du conroi fait un test de Bataille "
     "pour savoir combien de tours de tirs subir avant le contact ; chaque tir touche le cheval sur 1–4, le cavalier sur 5–6. "
     "Rejoints par plus de cavaliers que de piétons, chacun teste Valeureux ou fuit ; l'unité fuit au tiers de pertes graves. (p. 138)"),
    ("Chevaliers à pied", F_FEUDAL, "1D6", 10, 1/2, 1.5, "6110aecec8af5f57", 25, {}, KNIGHT_RANSOM, ["feudal", "feudalLesser"],
     "Des chevaliers démontés, aussi déterminés que les autres. Une fois et demie le nombre de PJ ; ils se groupent sur les PJ les plus glorieux "
     "ou les mieux montés, les autres combattent un contre un. Leur lance annule le malus contre un cavalier ; à pied, ils prennent l'épée. Rançon à tirer pour chaque captif. (p. 139)"),
    ("Chevaliers d'élite à pied", F_FEUDAL, "1D6+2", 12, 1/2, 1.5, "5fa834e305afdee7", 50, {}, ELITE_RANSOM, ["feudal"],
     "La garde personnelle d'un grand seigneur, privée de ses destriers, superbement armée. Une fois et demie le nombre de PJ ; mêmes tactiques "
     "que les chevaliers à pied. Rançon à tirer pour chaque captif. (p. 139)"),
    ("Hobilars", F_FEUDAL, "1D6+3", 10, 1/2, 2, "136aeff7988ab9aa", 25, {}, "", ["feudal", "feudalLesser", "cymric"],
     "Cavalerie légère sur des hobbies (Mouvement 18), peu de Gloire et aucune rançon. Deux par PJ ; ils esquivent automatiquement à l'approche : "
     "poursuivre les deux impose −5 à toutes les actions, n'en viser qu'un laisse l'autre s'enfuir. Rattrapé, un hobilar combat un tour puis teste Valeureux "
     "(échec : il esquive de nouveau ; succès : il reste un tour de plus). (p. 140)"),
    ("Sergents montés", F_FEUDAL, "1D6+2", 12, 3/4, 1, "8ff1cf4edd4fd35e", 25, {"mounted": True, "counterCharge": True},
     "1D6 : 1–4 sergent, pas de rançon ; 5–6 mercenaire pauvre 2 £", ["feudal", "feudalLesser"],
     "Cavaliers non nobles entraînés au combat monté (sert aussi pour des écuyers ou des mercenaires pauvres). Autant que de PJ, sur de petits chargeurs. "
     "Ils peuvent contre-charger. Rançon à tirer pour chaque captif. (p. 140)"),
    ("Chevaliers montés", F_FEUDAL, "1D6+2", 12, 1, 1, "6c03100972673424", 25, {"mounted": True, "counterCharge": True}, KNIGHT_RANSOM, ["feudal", "feudalLesser"],
     "Un conroi de chevaliers semblable à celui des PJ. Autant que de PJ, sur des chargeurs en bon état. Ils contre-chargent ; hors charge, "
     "ils préfèrent l'épée, sauf contre des armes longues (lance). Rançon à tirer pour chaque captif. (p. 141)"),
    ("Chevaliers montés d’élite", F_FEUDAL, "2D6", 12, 1, 1, "9be892161f7a6be9", 50, {"mounted": True, "counterCharge": True}, ELITE_RANSOM, ["feudal"],
     "Chevaliers de maisonnée et vassaux d'un seigneur réputé, superbement armés, sur de beaux étalons (+5 £). Autant que de PJ ; mêmes tactiques "
     "que les chevaliers montés. Un cheval capturé peut avoir un dressage ou une personnalité (Livre du joueur p. 184–186). (p. 141)"),
    ("Guerriers tribaux pictes", F_MARCH, "1D6+1", 8, 1/8, 2, "7dbb48658a691973", 25, {}, "", ["pict"],
     "Guerriers peints sans armure, targe au poing, lance à deux mains ; ils ne paient ni n'acceptent de rançon. Deux par PJ. "
     "Ils plantent leurs lances contre une charge sans test. Au tiers de pertes graves, les autres tentent de fuir (Esquive) au tour suivant. (p. 142)"),
    ("Guerriers saxons", F_MARCH, "1D6+2", 8, 1/4, 2, "ba9a0eb388366b7a", 25, {}, "", ["saxon"],
     "Heorthgeneat aguerris, garde d'un seigneur saxon. Deux par PJ : le défenseur au bouclier (lance, hache ou épée), l'autre à la grande hache. "
     "Mur de boucliers contre la charge au premier tour (seul le défenseur est testé), puis ils attaquent tous deux. Ni reddition ni rançon ; "
     "ils combattent jusqu'aux trois quarts de pertes. (p. 142)"),
]

O = [
    ("Capturer la Bannière", "3D6", 13, 1, 1, "aec112688eed430a", 50, {"noCharge": True}, "5 £", ALL,
     "La bannière d'un commandant ennemi est en vue, gardée par autant de chevaliers d'élite que de PJ (Hommage (Seigneur) 20, combat à mort). "
     "Pas de charge possible. Pour la prendre : vaincre son garde, puis le porte-bannière ou réussir Rixe (Saisir l'arme). En repli, les escortes font "
     "des tests d'Équitation opposés pour bloquer les poursuivants. Bannière ramenée : porteur +100 Gloire, escortes +50, tous +2 £ et des faveurs F10 ; "
     "le commandant de division adverse teste Bataille à −5 ou quitte le champ (sinon Moral minimum −3 pour le reste de la bataille). Le conroi se replie ensuite. (p. 143)"),
    ("Combattre le Commandant Ennemi", "3D6", 14, 1, 1.5, "3468abac19617484", 50, {"counterCharge": True}, "5 £ (gardes) ; commandant 100 £ ou plus", ALL,
     "Un commandant de flanc isolé avec ses gardes du corps (une fois et demie le nombre de PJ), qui peuvent contre-charger et s'acharnent sur les PJ les plus glorieux. "
     "Il faut vaincre son adversaire avant d'approcher le commandant (acteur « Commandant », 150 Gloire). Commandant pris ou tué : la division quitte la bataille, "
     "sauf ralliement (Bataille −10) ; les autres chevaliers du conroi gagnent +50 Gloire, +5 £ et des faveurs F15. (p. 144)"),
    ("Rassembler la Division !", "3D6", 12, 0, 0, "", 0, {}, "", ALL,
     "L'aile se débande. Trois étapes, une seule passion (invocable à chacune) : 1) test de Bataille, puis Honneur, Valeureux et Hommage (critique 2, succès 1, "
     "échec critique −2) ; 2) un seul PJ sonne du cor (Instrument −10) ; 3) la foule a Couard 20, modifié par les tests d'Honneur, Valeureux et Hommage de chaque PJ, "
     "puis chacun teste Éloquence contre elle. Résultats de la déroute générale à l'offensive (+5 à toutes les compétences pour la rencontre suivante). (p. 145)"),
    ("Duel des Champions", "0", 14, 1, 0, "749d06a64a60aca1", 150, {}, "5 £", ALL,
     "Un champion ennemi défie le conroi. Le commandant désigne le champion (titre, Gloire, Charge, dégâts du cheval, armure) ; un volontaire peut tester "
     "Honneur ou une passion adaptée pour être retenu (critique : en tête). Contre une armée féodale, joute à mort ; le vaincu est fait prisonnier, "
     "sa division peut se retirer. 150 Gloire pour la victoire. (p. 146)"),
    ("Raid sur le Camp", "3D6", 10, 0, 2, "", 0, {"forbidPrudent": True}, "", ALL,
     "L'ennemi pille votre camp. Rencontre ennemie aléatoire, deux adversaires au plus par chevalier ; pas de posture Prudent. Après 1D3 tours, "
     "une autre rencontre aléatoire. Un chevalier sans adversaire peut piller (coche Égoïste et Arbitraire, Table 6.11), au risque d'être vu (Vigilance 12). "
     "Les deux groupes battus sans voler : 50 Gloire et faveurs F30 ; un seul : 20 Gloire et F10. Placez les ennemis de la rencontre tirée à la main. (p. 147)"),
    ("Raid sur le convoi de ravitaillement", "1D6", 14, 0, 0, "", 0, {}, "", ALL,
     "Le camp ennemi est sans défense. Chaque chevalier pille par phases (Table 6.12) : la première coche Égoïste, la deuxième Arbitraire, la troisième Téméraire ; "
     "un résultat déjà obtenu amène un combat (1D3+1 lanciers, puis 1D3 chevaliers ordinaires à pied), une quatrième phase un chevalier vétéran monté. "
     "Les pillards sont à pied (Écuyer −5). (p. 147–148)"),
]

def item(name, folder, kind, loss, mn, kv, per, npc, glory, flags, ransom, armies, desc, fixed=None, img=f"{ICONS}/encounter.svg"):
    system = {
        "kind": kind, "description": desc, "moraleLoss": loss, "moraleMin": mn, "kv": kv, "perKnight": per,
        "fixedCount": fixed, "npc": ADV + npc if npc else "", "glory": glory,
        "mounted": False, "counterCharge": False, "ranged": False, "noCharge": False, "forbidPrudent": False,
        "ransom": ransom, "armies": armies
    }
    system.update(flags)
    return {"_id": rid(name), "name": name, "type": "rencontre", "img": img, "folder": folder, "system": system}

items = [item(n, f, "opponent", l, m, kv, p, npc, g, fl, r, a, d) for (n, f, l, m, kv, p, npc, g, fl, r, a, d) in E]
for (n, l, m, kv, p, npc, g, fl, r, a, d) in O:
    items.append(item(n, F_OPP, "opportunity", l, m, kv, p, npc, g, fl, r, a, d,
                      fixed=1 if n == "Duel des Champions" else None, img=f"{ICONS}/opportunity.svg"))

out = {"version": VERSION, "folders": FOLDERS, "items": items}
json.dump(out, open("data/rencontres.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(len(items), "rencontres")
