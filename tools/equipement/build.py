"""Construit data/equipement.json : armes, armures et boucliers du Livre du joueur (chap. 8 et 9,
appendice A, liste des prix p. 208, objets de famille de la Table 3.9) et du Livre du maître
(belles épées du butin de camp, Tables 6.11 et 6.12).

Seules les valeurs de jeu sont reprises ; les descriptions sont de courts résumés reformulés,
avec la page du livre. Les prix sont en deniers (240 d. = 1 £).

Usage : python3 tools/equipement/build.py  (depuis la racine du dépôt)
"""
import hashlib, json, os

VERSION = 2
ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
ICON = "systems/pendragon-vf/icons/gear/{}.svg"

def gid(name):
    return hashlib.md5(("equipement:" + name).encode()).hexdigest()[:16]

FOLDERS = [
    ("melee", "Armes de mêlée", 100), ("brawl", "Armes de rixe et improvisées", 200), ("missile", "Armes de jet", 300),
    ("armor", "Armures", 400), ("helm", "Heaumes", 500), ("shield", "Boucliers", 600),
    ("family", "Objets de famille et butin", 700), ("future", "Périodes ultérieures (appendice A)", 800),
]
FOLDER = {k: gid("folder:" + k) for k, _, _ in FOLDERS}
FOLDER_DOCS = [{"_id": FOLDER[k], "name": n, "type": "Item", "sorting": "a", "sort": s, "color": None} for k, n, s in FOLDERS]

def dmg(base="character", dice=0, flat=0, mx=0):
    return {"base": base, "dice": dice, "flat": flat, "max": mx}

def weapon(name, folder, icon, skill, use, damage, *, group="melee", price=None, period="all", periodNote="", parry=0,
           twoHanded=False, shieldBreaker=False, alts=(), rng="", thrown=None, adv="", dis="", desc="", source="", quality=0, quantity=1):
    return {
        "_id": gid(name), "name": name, "type": "arme", "img": ICON.format(icon), "folder": FOLDER[folder],
        "system": {
            "description": desc, "period": period, "periodNote": periodNote, "price": price, "quantity": quantity,
            "equipped": False, "source": source, "group": group, "skill": skill, "use": use, "damage": damage,
            "quality": quality, "alts": [{"label": l, "dice": d} for l, d in alts], "parry": parry,
            "twoHanded": twoHanded, "shieldBreaker": shieldBreaker, "range": rng,
            "thrown": thrown or {"enabled": False, "skill": "thrown", "damage": dmg(), "range": "short"},
            "advantage": adv, "disadvantage": dis
        }
    }

def throw(damage, rng, skill="thrown"):
    return {"enabled": True, "skill": skill, "damage": damage, "range": rng}

def armor(name, folder, icon, kind, material, value, *, price=None, period="all", periodNote="", padding=False,
          closed=False, moveFoot=0, layered=0, notes="", desc="", source=""):
    return {
        "_id": gid(name), "name": name, "type": "armure", "img": ICON.format(icon), "folder": FOLDER[folder],
        "system": {
            "description": desc, "period": period, "periodNote": periodNote, "price": price, "quantity": 1,
            "equipped": False, "source": source, "kind": kind, "material": material, "value": value,
            "layered": layered, "padding": padding, "closed": closed, "moveFoot": moveFoot, "notes": notes
        }
    }

def shield(name, folder, icon, size, value, ranged, *, mounted=0, chargeExempt=False, noMissile=False, price=None,
           period="all", periodNote="", dis="", notes="", desc="", source=""):
    return {
        "_id": gid(name), "name": name, "type": "bouclier", "img": ICON.format(icon), "folder": FOLDER[folder],
        "system": {
            "description": desc, "period": period, "periodNote": periodNote, "price": price, "quantity": 1,
            "equipped": False, "source": source, "size": size, "value": value, "rangedPenalty": ranged,
            "mountedPenalty": mounted, "chargeExempt": chargeExempt, "noMissile": noMissile,
            "disadvantage": dis, "notes": notes
        }
    }

T81, T82, T92, T93, T94, PRICES = "Livre du joueur, Table 8.1 (p. 162)", "Livre du joueur, Table 8.2 (p. 166)", \
    "Livre du joueur, Table 9.2 (p. 173)", "Livre du joueur, Table 9.3 (p. 175)", "Livre du joueur, Table 9.4 (p. 176)", "prix p. 208"
SRC = lambda t: f"{t} ; {PRICES}"
BREAKS = "Brisée sur un échec critique ou sur une égalité avec une épée."
SWORD_TIE = "Brisée par une épée sur une égalité."
AXE = "Contre un adversaire qui peut se servir de son bouclier, celui-ci ne bloque que 1D6 points (dans la limite de sa protection) ; sur un 1, il se brise."

ITEMS = [
    # ---------------- Armes de mêlée (Table 8.1) ----------------
    weapon("Épée", "melee", "sword", "sword", "both", dmg(), parry=3, price=120, source=SRC(T81),
           adv="Parade +3 ; brise les autres armes sur une égalité ; ne se brise pas sur un échec critique.",
           desc="L'arme du chevalier par excellence : lame droite à double tranchant de 70 à 80 cm, garde, poignée à une main et pommeau. Un chevalier a le droit de la porter partout, même à la cour."),
    weapon("Épée bon marché", "melee", "sword", "sword", "both", dmg(), parry=3, price=60, source=f"Livre du joueur, {PRICES}",
           adv="Parade +3 ; brise les autres armes sur une égalité ; ne se brise pas sur un échec critique.",
           desc="Épée de moindre facture, citée seulement dans la liste des prix : on lui donne ici les valeurs de l'épée."),
    weapon("Lance", "melee", "spear", "spear", "both", dmg(), alts=[("à deux mains, sans bouclier", 2)], price=30,
           thrown=throw(dmg("character", -1, 0, 4), "short"), source=f"{T81} et 8.2 ; {PRICES}",
           adv="Arme longue ; +2D6 aux dégâts à deux mains.", dis="Pas de bouclier à deux mains. " + BREAKS,
           desc="Arme d'estoc de 2 à 2,50 m, la plus répandue des champs de bataille de Bretagne. Se manie à une main avec un bouclier ou à deux mains, à pied ou à cheval, et peut se lancer (Arme lancée)."),
    weapon("Javelot", "melee", "javelin", "spear", "both", dmg("brawl", 1), price=10,
           thrown=throw(dmg("character", -1, 0, 3), "medium"), source=f"{T81} et 8.2 ; {PRICES}", dis=BREAKS,
           desc="Lance courte (1 à 1,50 m) faite pour être lancée, utilisable aussi en combat rapproché."),
    weapon("Lance de cavalerie", "melee", "lance", "charge", "horse", dmg("horse"), price=30, source=SRC(T81),
           adv="Arme longue.", dis="Brisée sur une égalité, un succès partiel ou un échec critique lors d'une Charge montée.",
           desc="Lance de combat en bois robuste (frêne, hêtre), réservée à la Charge montée ; hors charge, elle se manie comme une lance (compétence Lance)."),
    weapon("Lance de joute", "melee", "lance", "charge", "horse", dmg("horse"), price=3, period="boyKing", source=SRC(T81),
           adv="Arme longue.", dis="Pointe émoussée : dégâts amortis (moitié des dégâts). Se brise aussi sur une charge réussie dont le dé est pair (la table dit pair, le texte du chapitre dit impair).",
           desc="Lance de bois fragile, pour les joutes : elle casse bien plus souvent que la lance de cavalerie."),
    weapon("Hache de bataille", "melee", "axe", "hafted", "both", dmg(), shieldBreaker=True, price=30, source=SRC(T81),
           adv="Réduit la protection du bouclier à 1D6. " + AXE, dis=BREAKS,
           desc="Hache à une main et à lame unique, de 60 à 90 cm, plus lourde qu'une hache de bûcheron : elle enfonce les boucliers."),
    weapon("Masse d'armes", "melee", "mace", "hafted", "both", dmg(), alts=[("contre une armure de mailles", 1)], price=30, source=SRC(T81),
           adv="+1D6 aux dégâts contre une armure de mailles.", dis=BREAKS,
           desc="Gourdin à tête de fer d'environ 90 cm, souvent à ailettes, redoutable contre les mailles. On appelle « étoiles du matin » certaines masses à pointes."),
    weapon("Gourdin", "melee", "club", "hafted", "both", dmg("brawl", 1), price=10, source=SRC(T81), dis=SWORD_TIE,
           desc="Simple bâton d'arme à une main."),
    weapon("Francisque", "melee", "francisca", "hafted", "foot", dmg("brawl", 2), shieldBreaker=True, price=15,
           thrown=throw(dmg("character", -1), "short"), source=f"{T81} et 8.2 ; {PRICES}",
           adv="Lancée : dégâts normaux contre un adversaire équipé d'un bouclier.", dis="En mêlée, au contact ou en combat rapproché seulement ; brisée par une épée sur une égalité.",
           desc="Petite hache à une main des Saxons et des Francs, faite pour être lancée ; en mêlée, ce n'est qu'une arme de secours."),
    weapon("Grande hache", "melee", "greataxe", "greatWeapon", "foot", dmg("character", 2), twoHanded=True, shieldBreaker=True, price=60, source=SRC(T81),
           adv="Réduit la protection du bouclier à 1D6. " + AXE, dis="Pas de bouclier ; brisée sur une égalité avec une épée.",
           desc="Grande arme d'environ 1,50 m à lame simple ou double, surtout maniée par les Saxons."),
    weapon("Grande masse d'armes", "melee", "greatmace", "greatWeapon", "foot", dmg("character", 2), twoHanded=True,
           alts=[("contre une armure de mailles", 1)], price=60, source=SRC(T81),
           adv="Contre une cotte de mailles : +3D6 au lieu de +2D6.", dis="Pas de bouclier ; brisée sur une égalité avec une épée.",
           desc="Lourd gourdin de fer à ailettes d'environ 1,50 m, à deux mains."),
    weapon("Maillet", "melee", "maul", "greatWeapon", "foot", dmg("character", 2), twoHanded=True, price=15, source=SRC(T81),
           dis="Pas de bouclier. " + BREAKS,
           desc="Gros marteau à tête de bois d'environ 1,50 m, arme de paysan."),
    weapon("Massue", "melee", "greatclub", "greatWeapon", "foot", dmg("brawl", 2), twoHanded=True, price=20, source=SRC(T81),
           dis="Pas de bouclier. " + BREAKS,
           desc="Grande pièce de bois massif, jusqu'à 2 m : une branche, voire un pied de table."),
    weapon("Bâton (Épée)", "melee", "staff", "sword", "foot", dmg("brawl", 2), parry=2, twoHanded=True, price=10, source=SRC(T81),
           adv="Parade +2.", dis="Pas de bouclier ; brisé sur un échec critique ou sur une égalité avec une épée.",
           desc="Bâton de combat manié comme une épée. Les écuyers s'en servent pour s'entraîner."),
    weapon("Bâton (Lance)", "melee", "staff", "spear", "foot", dmg("brawl"), price=10, source=SRC(T81),
           dis="Brisé sur un échec critique ou sur une égalité avec une épée.",
           desc="Bâton de combat manié comme une lance, avec un bouclier."),
    weapon("Bâton (Armes longues)", "melee", "staff", "greatWeapon", "foot", dmg("brawl", 1), parry=4, twoHanded=True, price=10, source=SRC(T81),
           adv="Parade +4.", dis="Pas de bouclier ; brisé sur un échec critique ou sur une égalité avec une épée.",
           desc="Bâton de combat manié à deux mains comme une arme longue."),

    # ---------------- Rixe et armes improvisées ----------------
    weapon("Dague", "brawl", "dagger", "brawling", "both", dmg("brawl", 2), group="brawl", price=20,
           thrown=throw(dmg("brawl"), "short"), source=f"{T81} et 8.2 ; {PRICES}",
           desc="Couteau à double tranchant et pointe aiguisée, porté par tous comme un outil ; l'arme de dernier recours du chevalier. Lancée, elle vole mal (dégâts de Rixe)."),
    weapon("Scramasaxe", "brawl", "seax", "brawling", "foot", dmg("brawl", 2), group="brawl", parry=1, price=40, source=SRC(T81),
           adv="Parade +1.", dis="Brisé sur une égalité avec une épée.",
           desc="Grand couteau à un tranchant, arme secondaire des guerriers saxons ; rare hors de leurs terres, sauf comme prise de guerre."),
    weapon("Arme improvisée", "brawl", "club", "brawling", "both", dmg("brawl", 1), group="brawl", alts=[("à deux mains", 1)],
           thrown=throw(dmg("none", 1), "short"), source="Livre du joueur, p. 164",
           adv="Lancée : 1D6 (objet léger, portée courte) ou 2D6 (objet lourd, portée de mêlée longue).",
           dis="−5 à tous les tests : ce n'est pas une arme.",
           desc="Pierre, branche, outil, tabouret ou banc : Rixe en mêlée, Arme lancée à distance."),

    # ---------------- Armes de jet (Table 8.2) ----------------
    weapon("Arc simple", "missile", "bow", "bow", "both", dmg("character", -1, 0, 3), group="missile", rng="medium", price=30, source=SRC(T82),
           adv="Un archer entraîné (non chevalier) lance tous ses dés de dégâts, dans la limite du maximum.",
           desc="Arc d'une seule pièce de bois, de 1 m à 1,20 m, pour la chasse et la guerre. Les chevaliers ne s'en servent qu'à la chasse, sauf en cas de siège."),
    weapon("Arc long", "missile", "longbow", "bow", "foot", dmg("character", -1, 0, 4), group="missile", rng="long", periodNote="Cambrie", source=T82,
           adv="Un archer entraîné (non chevalier) lance tous ses dés de dégâts, dans la limite du maximum.",
           dis="Il faut Arc 12 et FOR 12 pour en tirer tout le potentiel ; sinon, il compte comme un arc simple.",
           desc="Arc de chasse des tribus de Cambrie, introuvable ailleurs. Prix non indiqué (celui d'un arc : 30 d.)."),
    weapon("Arc de guerre", "missile", "longbow", "bow", "foot", dmg("character", -1, 0, 5), group="missile", rng="long", periodNote="Cambrie", source=T82,
           adv="Un archer entraîné (non chevalier) lance tous ses dés de dégâts, dans la limite du maximum.",
           dis="Il faut Arc 15 et FOR 15 pour en tirer tout le potentiel ; sinon, il compte comme un arc simple.",
           desc="Puissant arc long qui demande un entraînement particulier."),
    weapon("Arbalète légère", "missile", "crossbow", "crossbow", "both", dmg("none", 1, 10), group="missile", rng="medium", price=60, source=SRC(T82),
           dis="Il faut être à pied pour la recharger.",
           desc="Arbalète « à un pied » : on glisse le pied dans l'étrier pour tendre la corde à la main. Plus souvent utilisée à la chasse qu'à la guerre."),

    # ---------------- Armures (Table 9.2) ----------------
    armor("Auqueton", "armor", "aketon", "padding", "textile", 2, price=15, source=SRC(T92),
          desc="Matelassage souple de tissu et de laine en couches épaisses, porté sous les mailles. Se revêt seul en autant de tours que sa protection."),
    armor("Gambison", "armor", "gambison", "body", "textile", 4, price=60, source=SRC(T92),
          desc="Comme l'auqueton, mais bien plus épais et raide autour du torse. Porté seul par les fantassins, ou par les chevaliers à la chasse au gibier dangereux."),
    armor("Haubergeon", "armor", "hauberk_short", "body", "mail", 4, padding=True, price=150, source=SRC(T92),
          notes="Se porte sur un auqueton (le prix comprend l'auqueton).",
          desc="Cotte de mailles légère (broigne) : du cou à mi-cuisse, les bras jusqu'au-dessus des coudes."),
    armor("Haubert", "armor", "mail", "body", "mail", 6, padding=True, price=390, source=SRC(T92),
          notes="Se porte sur un auqueton (le prix comprend l'auqueton).",
          desc="Cotte de mailles jusqu'aux genoux, fendue pour monter à cheval ; portée avec un heaume à nasal."),
    armor("Haubert avancé", "armor", "mail_adv", "body", "mail", 7, padding=True, price=720, period="boyKing", source=SRC(T92),
          notes="Se porte sur un auqueton (le prix comprend l'auqueton).",
          desc="Haubert complété de gantelets et de chausses de mailles, de brassards et de grèves de cuir bouilli."),
    armor("Cotte de plates", "armor", "coat_plates", "overlay", "plate", 6, layered=1, moveFoot=-5, period="boyKingLate", source=T92,
          notes="Portée sur un haubert : +1 de protection et plus de bonus des armes contre les mailles. −5 au Mouvement à pied.",
          desc="Plaques de métal rivetées sous un surcot de cuir ou de toile, dernière nouveauté de la fin de la période (515 et après). On ne l'achète pas : seuls les nobles fortunés l'ont, ou l'offrent à un chevalier fidèle."),

    # ---------------- Heaumes (Table 9.3) ----------------
    armor("Chapel de fer", "helm", "kettle", "helm", "mail", 1, price=60, source=SRC(T93),
          desc="Heaume ouvert à large bord, commun chez les fantassins. Prix : celui du heaume ouvert."),
    armor("Heaume ouvert", "helm", "helm_open", "helm", "mail", 1, price=60, source=SRC(T93),
          desc="Cervelière arrondie, le heaume le plus simple et le moins cher, des fantassins et des chevaliers désargentés. Camail compris."),
    armor("Heaume à nasal", "helm", "helm_nasal", "helm", "mail", 2, price=90, source=SRC(T93),
          desc="Heaume conique standard des chevaliers de la période, avec une barre qui protège le nez et une jugulaire. Camail compris."),
    armor("Heaume à nasal avancé", "helm", "helm_nasal_adv", "helm", "mail", 3, closed=True, price=240, period="boyKing", source=SRC(T93),
          notes="Heaume fermé : −5 aux tests de Vigilance (vue, ouïe) ; visage méconnaissable.",
          desc="Heaume à nasal complété de garde-joues, d'un couvre-nuque de mailles et d'une visagière : le premier heaume « fermé »."),

    # ---------------- Boucliers (Table 9.4) ----------------
    shield("Bouclier normand", "shield", "shield_norman", "large", 6, -10, mounted=-2, chargeExempt=True, price=30, source=SRC(T94),
           notes="Pas de pénalité à cheval pour une Charge à la lance (simple ou de cavalerie).",
           desc="Long bouclier en larme des chevaliers de la période, tenu par une poignée, des attaches d'avant-bras et une guige ; conçu contre les flèches et pour la charge."),
    shield("Bouclier rond", "shield", "shield_round", "large", 6, -10, mounted=-2, price=30, source=SRC(T94),
           desc="Bouclier à umbo de l'infanterie, le favori des Saxons et des peuples germaniques."),
    shield("Scutum", "shield", "scutum", "large", 6, -10, mounted=-2, price=30, source=SRC(T94),
           desc="Bouclier romain ovale, avec des attaches pour de petits javelots plombés (plumbatae)."),
    shield("Bouclier simple", "shield", "shield_plain", "medium", 6, -5, price=10, source=SRC(T94),
           dis="Brisé s'il sert contre un succès critique de l'adversaire.",
           desc="Bouclier de l'infanterie ordinaire, de la taille d'un bouclier rond mais de moindre facture."),
    shield("Rondache", "shield", "buckler", "small", 4, 0, noMissile=True, price=10, source=SRC(T94),
           dis="Aucune protection contre les armes de jet ni contre les charges.",
           notes="+1D6 aux dégâts d'une attaque à mains nues ; peut être lâchée au début d'un tour sans pénalité.",
           desc="Petit bouclier rond ou ovale à poignée centrale, pratique en combat rapproché."),
    shield("Targe", "shield", "targe", "small", 4, 0, noMissile=True, price=10, source=SRC(T94),
           dis="Aucune protection contre les armes de jet ni contre les charges ; aucune protection si la main est occupée.",
           notes="Attachée au bras : laisse la main libre et ne gêne ni la Saisie ni la Rixe à deux mains ; ne peut pas être lâchée.",
           desc="Petit bouclier sanglé à l'avant-bras gauche."),

    # ---------------- Objets de famille (Table 3.9) et butin (LdM, Tables 6.11-6.12) ----------------
    weapon("Belle épée", "family", "sword", "sword", "both", dmg(), quality=1, parry=3, price=240,
           source="Livre du maître, Tables 6.11 et 6.12 (butin de camp)",
           adv="+1 aux dégâts. Parade +3 ; brise les autres armes sur une égalité ; ne se brise pas sur un échec critique.",
           desc="Épée de belle facture trouvée dans un camp pillé (valeur 1 £)."),
    weapon("Magnifique épée", "family", "sword", "sword", "both", dmg(), quality=1, parry=3, price=1200,
           source="Livre du joueur, Table 3.9 (10)",
           adv="+1 aux dégâts. Parade +3 ; brise les autres armes sur une égalité ; ne se brise pas sur un échec critique.",
           desc="Objet de famille (chance du débutant), valeur 5 £."),
    weapon("Épée à la devise familiale", "family", "sword", "sword", "both", dmg(), parry=3, price=240,
           source="Livre du joueur, Table 3.9 (20)",
           adv="+5 en Amour (Famille) au combat. Parade +3 ; brise les autres armes sur une égalité ; ne se brise pas sur un échec critique.",
           desc="Objet de famille : belle épée gravée d'or à la devise de la famille (valeur 1 £)."),
    weapon("Spatha romaine", "family", "sword", "sword", "both", dmg(), parry=3, price=1200,
           source="Livre du joueur, Table 3.9 (8)",
           adv="+5 en Courtoisie dans une cour romaine, ou une faveur F5 si on l'offre à un seigneur romain.",
           desc="Objet de famille : épée romaine au fourreau d'or et d'argent (valeur 5 £)."),
    weapon("Lances du chef franc", "family", "spear", "spear", "both", dmg(), alts=[("à deux mains, sans bouclier", 2)], quantity=2, price=480,
           thrown=throw(dmg("character", -1, 0, 4), "short"), source="Livre du joueur, Table 3.9 (3)",
           adv="+1 en Valeureux quand on s'en sert ; croix annuelle en Fier.", dis="Pas de bouclier à deux mains. " + BREAKS,
           desc="Objet de famille : paire de lances offertes par un chef franc (valeur 2 £)."),
    weapon("Lance à la hure de sanglier", "family", "spear", "spear", "both", dmg(), alts=[("contre un sanglier", 1), ("à deux mains, sans bouclier", 2)], price=240,
           thrown=throw(dmg("character", -1, 0, 4), "short"), source="Livre du joueur, Table 3.9 (7)",
           adv="+1D6 aux dégâts contre les sangliers.", dis="Pas de bouclier à deux mains. " + BREAKS,
           desc="Objet de famille : fer de lance gravé d'une hure de sanglier (valeur 1 £)."),
    weapon("Lance de frêne des druides", "family", "spear", "spear", "both", dmg(), alts=[("à deux mains, sans bouclier", 2)], price=240,
           thrown=throw(dmg("character", -1, 0, 4), "short"), source="Livre du joueur, Table 3.9 (17)",
           adv="Croix annuelle à tous les traits païens, si on le souhaite.", dis="Pas de bouclier à deux mains. " + BREAKS,
           desc="Objet de famille : lance de frêne offerte par les druides (valeur 1 £)."),
    weapon("Lance bénie par saint Dewi", "family", "spear", "spear", "both", dmg(), alts=[("à deux mains, sans bouclier", 2)], price=240,
           thrown=throw(dmg("character", -1, 0, 4), "short"), source="Livre du joueur, Table 3.9 (19)",
           adv="Croix annuelle à tous les traits chrétiens, si on le souhaite.", dis="Pas de bouclier à deux mains. " + BREAKS,
           desc="Objet de famille : lance bénie par saint Dewi (valeur 1 £)."),
    shield("Bouclier d'if griffé", "family", "shield_norman", "large", 6, -10, mounted=-2, chargeExempt=True, price=240,
           source="Livre du joueur, Table 3.9 (16)", notes="+2 en Valeureux quand on s'en sert.",
           desc="Objet de famille : bouclier d'if marqué des griffes d'un monstre (valeur 1 £). Le livre n'en donne pas le type : valeurs d'un bouclier normand, à ajuster."),

    # ---------------- Périodes ultérieures (appendice A) ----------------
    weapon("Épée longue", "future", "sword", "sword", "both", dmg(), parry=3, period="tournament",
           alts=[("à deux mains, sans bouclier", 2), ("contre plates, en demi-épée", 3)], source="Livre du joueur, Table A.1 (p. 239)",
           adv="Parade +3 ; brise les armes à manche sur une égalité.", dis="Pas de bouclier à deux mains ou en demi-épée.",
           desc="Épée à une main et demie : +2D6 à deux mains, ou +3D6 contre les plates au combat rapproché, prise en demi-épée."),
    weapon("Fauchon", "future", "seax", "sword", "both", dmg(), parry=2, period="romance", alts=[("contre un ennemi sans armure", 1)],
           source="Livre du joueur, Table A.1 (p. 239)", adv="Parade +2 ; brise les armes à manche sur une égalité.",
           desc="Épée courbe à un tranchant."),
    weapon("Fauchon à deux mains", "future", "seax", "sword", "both", dmg("character", 1), parry=2, period="conquest", twoHanded=True,
           alts=[("contre un adversaire sans armure", 1)], source="Livre du joueur, Table A.1 (p. 239)",
           adv="Parade +2 ; brise les armes à manche sur une égalité.", dis="Pas de bouclier. " + BREAKS,
           desc="Grand fauchon à deux mains : +1D6, ou +2D6 contre un adversaire sans armure."),
    weapon("Fléau", "future", "mace", "hafted", "both", dmg(), period="romance", alts=[("contre une armure de mailles", 1)],
           source="Livre du joueur, Table A.1 (p. 239)", adv="Ignore la protection de bouclier et la Parade de l'adversaire.",
           desc="Arme à chaîne. Le livre lui donne une compétence Fléau, qui n'existe pas encore sur la fiche : la compétence Haches et masses est mise en attendant."),
    weapon("Fléau d'armes", "future", "greatmace", "greatWeapon", "foot", dmg("character", 2), period="romance", twoHanded=True,
           alts=[("contre une armure de mailles", 1)], source="Livre du joueur, Table A.1 (p. 239)",
           adv="Ignore la protection de bouclier et la Parade de l'adversaire.",
           desc="Grand fléau à deux mains (+3D6 contre les mailles). Compétence Fléau dans le livre : Armes longues en attendant."),
    weapon("Guisarme", "future", "greataxe", "greatWeapon", "foot", dmg("character", 2), period="romance", twoHanded=True, shieldBreaker=True,
           source="Livre du joueur, Table A.1 (p. 239)", adv="Arme longue. " + AXE + " L'adversaire subit −5 s'il tente de la désarmer.", dis="Pas de bouclier.",
           desc="Arme d'hast à crochet."),
    weapon("Hache d'armes", "future", "greataxe", "greatWeapon", "foot", dmg("character", 2), period="twilight", twoHanded=True, shieldBreaker=True, parry=4,
           alts=[("contre une armure de plates", 1)], source="Livre du joueur, Table A.1 (p. 239)",
           adv="Parade +4. " + AXE, dis="Pas de bouclier ; brisée par une épée seulement sur une égalité de deux succès critiques.",
           desc="Arme d'hast à hache et pointe, +3D6 contre les plates."),
    weapon("Hallebarde", "future", "greataxe", "greatWeapon", "foot", dmg("character", 2), period="twilight", twoHanded=True, shieldBreaker=True,
           source="Livre du joueur, Table A.1 (p. 239)", adv="Arme longue. " + AXE, dis="Pas de bouclier.",
           desc="Arme d'hast à lame de hache."),
    weapon("Lance de cavalerie à deux mains", "future", "lance", "greatWeapon", "horse", dmg("character", 2), period="tournament", twoHanded=True,
           source="Livre du joueur, Table A.1 (p. 239)", adv="Arme longue ; +2D6 en mêlée.",
           dis="Pas de bouclier ; −5 pour engager des adversaires sur les côtés du cheval (pas droit devant).",
           desc="Lance maniée à deux mains en mêlée montée."),
    weapon("Lance de cavalerie fragile", "future", "lance", "charge", "horse", dmg("horse"), period="tournament",
           source="Livre du joueur, Table A.1 (p. 239)", adv="Arme longue.", dis="Se brise sur un succès.",
           desc="Lance de cavalerie faite pour casser (dégâts spéciaux selon le livre)."),
    weapon("Marteau", "future", "maul", "hafted", "both", dmg(), period="romance", alts=[("contre une armure de plates", 1)],
           source="Livre du joueur, Table A.1 (p. 239)", adv="+1D6 contre une armure de plates.",
           desc="Marteau d'armes à une main."),
    weapon("Marteau de guerre", "future", "maul", "greatWeapon", "foot", dmg("character", 2), period="romance", twoHanded=True,
           alts=[("contre une armure de plates", 1)], source="Livre du joueur, Table A.1 (p. 239)", adv="Arme longue ; +3D6 contre les plates.", dis="Pas de bouclier.",
           desc="Grand marteau à deux mains."),
    weapon("Vouge", "future", "greataxe", "greatWeapon", "foot", dmg("character", 2), period="tournament", twoHanded=True,
           source="Livre du joueur, Table A.1 (p. 239)", adv="Arme longue.", dis="Pas de bouclier.",
           desc="Arme d'hast à large lame."),
    weapon("Arbalète moyenne", "future", "crossbow", "crossbow", "both", dmg("none", 1, 14), group="missile", rng="medium", period="conquest",
           source="Livre du joueur, Table A.2 (p. 239)", dis="Un carreau tous les 2 tours.", desc="Arbalète plus puissante que l'arbalète légère."),
    weapon("Arbalète lourde", "future", "crossbow", "crossbow", "both", dmg("none", 1, 20), group="missile", rng="long", period="romance",
           source="Livre du joueur, Table A.2 (p. 239)", dis="Un carreau tous les 4 tours.", desc="Arbalète de guerre lourde."),
    weapon("Dague de lancer", "future", "dagger", "brawling", "both", dmg("brawl", 2), group="brawl", period="conquest",
           thrown=throw(dmg("brawl", 2), "short"), source="Livre du joueur, Table A.2 (p. 239)",
           desc="Dague équilibrée pour le lancer : Rixe +2D6 lancée."),
    armor("Haubert de mailles renforcé", "future", "mail_adv", "body", "mail", 13, period="conquest", source="Livre du joueur, Table A.3 (p. 240)",
          notes="Valeur du harnois complet, heaume compris.", desc="Futur harnois de mailles renforcé."),
    armor("Demi-plate", "future", "coat_plates", "body", "plate", 16, period="romance", source="Livre du joueur, Table A.3 (p. 240)",
          notes="Valeur du harnois complet, heaume compris.", desc="Futur harnois de plates partiel."),
    armor("Armure de plates", "future", "coat_plates", "body", "plate", 18, period="tournament", source="Livre du joueur, Table A.3 (p. 240)",
          notes="Valeur du harnois complet, heaume compris.", desc="Futur harnois de plates complet."),
    armor("Armure de plates gothique", "future", "coat_plates", "body", "plate", 22, period="twilight", source="Livre du joueur, Table A.3 (p. 240)",
          notes="Valeur du harnois complet, heaume compris.", desc="Le harnois de plates de maître de la fin du règne d'Arthur."),
    shield("Écu", "future", "shield_norman", "medium", 6, -5, period="conquest", source="Livre du joueur, Table A.4 (p. 240)",
           desc="Bouclier triangulaire plus petit qui remplacera le bouclier normand."),
    shield("Bouclier de joute", "future", "shield_norman", "medium", 6, 0, noMissile=True, period="romance", source="Livre du joueur, Table A.4 (p. 240)",
           dis="Ne protège pas contre les projectiles.", notes="Jamais utilisé à pied.", desc="Bouclier réservé à la joute."),
]

def main():
    names = [i["name"] for i in ITEMS]
    assert len(names) == len(set(names)), "noms en double"
    out = {"version": VERSION, "folders": FOLDER_DOCS, "items": ITEMS}
    path = os.path.join(ROOT, "data", "equipement.json")
    with open(path, "w") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(len(ITEMS), "objets écrits dans", os.path.normpath(path))

if __name__ == "__main__":
    main()
