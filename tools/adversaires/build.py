"""Construit data/adversaires.json (acteurs PNJ du système) à partir des blocs extraits du Livre du maître.

Seules les valeurs de jeu sont reprises ; les capacités spéciales sont résumées en quelques mots
(reformulées) avec la page du livre, sans reprendre son texte.
"""
import hashlib, json, re

B = {b["name"]: b for b in json.load(open("blocks.json", encoding="utf-8"))}

SKILL_FIX = {"Arme de jet": "Arme lancée", "Armes lancées": "Arme lancée"}

# Résumés des capacités (reformulés), par créature
SUPERNATURAL = "Surnaturel : seules les armes de fer (+1D6) ou de fer béni (+2D6) le blessent ; les autres peuvent seulement le faire chuter. Une substance bénie inflige 1D6 en ignorant l'armure."
DEMON = "Démon : le fer inflige +1D6 dégâts (autres faiblesses au choix du MJ)."
ABIL = {
    "Taureau": ["Charge : dégâts complets en chargeant.", "Empalement : à pleine vitesse, avec les cornes.", "Piétinement : seulement contre une victime à terre."],
    "Auroch": ["Charge : dégâts complets en chargeant (règles de passage, Livre du joueur p. 149).", "Empalement : à pleine vitesse, avec les cornes.", "Piétinement : seulement contre une victime à terre."],
    "Faucon": ["Évitement +20 en vol.", "Plongée : attaque en piqué depuis les airs."],
    "Éléphant": ["Piétinement : la cible esquive par un test opposé de DEX (la sienne ou celle de sa monture) ; succès partiel = demi-dégâts.", "Empalement : +2D6 contre une armure de plaques.", "Saisie et lancé : projette la cible à 1D6+5 m (6D6)."],
    "Ours": ["Griffes : deux jets de 4D6 si l'ours l'emporte, blessures distinctes, additionnées pour la Chute.", "Mutilation : au tour suivant une Chute, morsure mortelle ; défense à −5 sauf en Rixe.", "Férocité : continue d'attaquer un tour après Inconscience ou Blessure majeure (sauf face à un épieu à sanglier)."],
    "Loup": ["Chasse en meute : un loup ignoré par sa cible fait une attaque téméraire."],
    "Renard": ["Évite le combat ; mord s'il est acculé."],
    "Sanglier": ["Défenses : contre un cavalier, attaque toujours le cheval d'abord.", "Férocité : continue d'attaquer un tour après Inconscience ou Blessure majeure (sauf face à un épieu à sanglier)."],
    "Cheval féérique": [SUPERNATURAL],
    "Barguest": ["Regard terrifiant (30 m, chaque tour) : opposé au Valeureux ; échec = coche Couard et fuite 1D6 tours ; succès partiel = fuite sans coche.", "Docile auprès d'une jeune fille vierge… jusqu'à son réveil.", SUPERNATURAL],
    "Chien noir": ["Invisibilité à volonté (n'attaque pas invisible) ; tactiques de meute.", SUPERNATURAL],
    "Cu Sith": ["Chien des chasseurs féeriques, silencieux, garde les entrées des collines creuses.", SUPERNATURAL],
    "Coquatrice": ["Crache-venin (une fois par tour, 30 m, attaque à distance) : test de CON contre venin 30 ; l'armure protège de la première attaque (1 ou 2 selon le métal) puis se dégrade.",
                   "Venin rampant : les armes en bois qui la touchent se dissolvent ; les lames se briseront sur un échec critique.", "Fuit la fouine ; le chant du coq lui inflige 6D6.", SUPERNATURAL],
    "Dragon": ["Griffes : deux attaques par tour, éventuellement sur deux cibles.", "Morsure : saisie (maintien au sol) ; avale toute créature de TAI ≤ moitié de la sienne.",
               "Coup de queue : peut être attaqué par deux fois plus d'adversaires ; la queue frappe ceux de flanc et de dos sans pénalité.",
               "Attaque en vol : en passant, +5 à l'attaque, −15 à celle de la cible.", "Une panthère qui rote l'apaise et l'endort."],
    "Doppelganger": ["Changeforme : prend la forme et les caractéristiques physiques de quiconque, pas ses compétences, traits ni passions.", "Craint les objets bénis.", SUPERNATURAL],
    "Fachan": ["Deux dimensions : invisible et inattaquable de face ou de dos ; garde un adversaire en face ; plusieurs attaquants peuvent le prendre de flanc. Le voir : Vigilance contre son Évitement 20.", SUPERNATURAL],
    "Licorne": ["Corne : charge (au moins 6 m d'élan).", "Piétinement : seulement contre une cible à terre.", "Magie féerique une fois par rencontre (invisibilité, obstacle pour fuir) ; Évitement +10 lors d'une chasse.",
                "Soigne entièrement une créature une fois par rencontre ; attaque les éléphants à vue.", SUPERNATURAL],
    "Toque-rouge": ["Désarmé : deux attaques de griffes par tour, éventuellement sur deux cibles.", SUPERNATURAL],
    "Cwn Annwn": ["Morsure démoniaque : l'armure ne compte pas ; la victime oppose sa valeur de Croyant comme armure.",
                  "Langue de feu : après chaque morsure réussie, attaque de Tromperie ; la victime résiste par un test de Dévotion.", DEMON],
    "Chevalier démoniaque": ["Ses illusions (Tromperie démoniaque) se percent par un test de Croyant (voir le livre).", DEMON],
    "Petit géant": ["Allonge : pas de désavantage de hauteur contre les cavaliers.", "Pisté avec Chasse +5."],
    "Grand géant": ["Chaque tour : un coup de gourdin, ou deux piétinements sur deux cibles sans pénalité.", "Défenses adverses +5 ; modificateur réfléchi +5/−5 contre les combattants à pied ; pas de +5 aux armes longues contre lui.", "Pisté avec Chasse +10."],
    "Géant Gargantuesque": ["Chaque tour : un coup de gourdin, ou deux piétinements ; Écrasement contre une cible déjà à terre.", "Défenses adverses +10 ; modificateur réfléchi +10/−10 à pied, +5/−5 à cheval ; pas de bonus de charge à la lance.", "Pisté avec Chasse +20."],
    "Sauvageon (ou Woodwose)": ["Fuit et se recroqueville plutôt que de combattre."],
    "Brownie": ["Invisible à volonté pour les mortels.", "Esprit domestique : influence la Gestion du domaine lors de la phase d'hiver (voir le livre).", SUPERNATURAL],
    "Ogre": ["Manie un lourd maillet à deux mains."],
    "Elfe": ["Armure en métal d'étoile, toujours d'une période en avance (18 + bouclier à l'époque de l'Enfant-roi).", "Magie féerique une fois par rencontre (invisibilité, illusion, métamorphose, soins).",
             "Don féerique (Table 8.5) ; monte un cheval féerique.", SUPERNATURAL],
    "Guenaude": ["Deux attaques de griffes par tour, éventuellement sur deux cibles (cheval et cavalier compris).", SUPERNATURAL],
    "Gobelin": ["Magie féerique : invisibilité une fois par rencontre.", "Tir elfe : la victime fait aussitôt un test comme pour la Sénescence.", SUPERNATURAL],
    "Nain": ["Magie féerique : invisibilité une fois par rencontre.", "Combat à mains nues (Rixe).", SUPERNATURAL],
}

BATTLE = {
    "Paysans": ("1D3", 5, "1/16"), "Lanciers": ("1D6", 8, "1/8"), "Fantassins": ("1D6", 7, "1/8"), "Archers": ("1D6", 5, "1/8"),
    "Chevaliers à Pied": ("1D6", 10, "1/2"), "Chevaliers d'élite à Pied": ("1D6+2", 12, "1/2"), "Hobilars": ("1D6+3", 10, "1/2"),
    "Sergents montés": ("1D6+2", 12, "3/4"), "Chevaliers montés": ("1D6+2", 12, "1"), "Chevaliers montés d’élite": ("2D6", 12, "1"),
    "Guerriers tribaux pictes": ("1D6+1", 8, "1/8"), "Guerriers saxons": ("1D6+2", 8, "1/4"),
}

# (nom dans le livre, nom affiché, dossier)
SELECTION = [
    *[(n, n.replace("Lancier Vétéran", "Lancier vétéran"), "Chevaliers") for n in
      ["Chevalier débutant", "Chevalier ordinaire", "Chevalier vétéran", "Chevalier respecté", "Chevalier notable", "Chevalier renommé", "Chevalier extraordinaire"]],
    ("Bandit", "Bandit", "Combattants"), ("Lancier", "Lancier", "Combattants"), ("Lancier Vétéran", "Lancier vétéran", "Combattants"),
    ("Archer", "Archer", "Combattants"), ("Arbalétrier", "Arbalétrier", "Combattants"), ("Sergent Monté", "Sergent monté", "Combattants"),
    ("Homme des Collines", "Homme des collines", "Combattants"), ("Berserker", "Berserker", "Combattants"),
    ("Chevalier Saxon", "Chevalier saxon", "Saxons"), ("Ceorl", "Ceorl", "Saxons"), ("Ceorl riche", "Ceorl riche", "Saxons"),
    ("Soldat à pied saxon", "Heorthgeneat", "Saxons"), ("Heorthgeneat à cheval", "Heorthgeneat à cheval", "Saxons"),
    ("Ætheling", "Ætheling", "Saxons"), ("Cyning", "Cyning", "Saxons"),
    ("Guerriers peints du Nord", "Guerrier picte", "Pictes"), ("Guerrier Picte Supérieur", "Guerrier picte supérieur", "Pictes"),
    *[(n, n.replace(" à Pied", " à pied"), "Unités de bataille") for n in
      ["Paysans", "Lanciers", "Fantassins", "Archers", "Chevaliers à Pied", "Chevaliers d'élite à Pied", "Hobilars", "Sergents montés",
       "Chevaliers montés", "Chevaliers montés d’élite", "Guerriers tribaux pictes", "Guerriers saxons", "Gardes de la Bannière", "Commandant", "Garde du Corps", "Champion"]],
    *[(n, n, "Animaux") for n in ["Taureau", "Auroch", "Éléphant", "Ours", "Loup", "Renard", "Sanglier", "Faucon"]],
    *[(n, n.replace("Géant Gargantuesque", "Géant gargantuesque").replace("Sauvageon (ou Woodwose)", "Sauvageon"), "Créatures féeriques et monstres") for n in
      ["Cheval féérique", "Barguest", "Chien noir", "Cu Sith", "Coquatrice", "Dragon", "Doppelganger", "Fachan", "Licorne", "Toque-rouge",
       "Cwn Annwn", "Chevalier démoniaque", "Petit géant", "Grand géant", "Géant Gargantuesque", "Sauvageon (ou Woodwose)", "Brownie",
       "Ogre", "Elfe", "Guenaude", "Gobelin", "Nain"]],
]

ICONS = "systems/pendragon-vf/icons/types"
CATEGORY = {"Animaux": "creature", "Créatures féeriques et monstres": "creature"}
TAGLINE = {"Chevaliers": "Chevalier", "Combattants": "Combattant", "Saxons": "Saxon", "Pictes": "Picte", "Unités de bataille": "Unité de bataille (chap. 6)",
           "Animaux": "Animal", "Créatures féeriques et monstres": ""}

# Corrections manuelles (coquilles du livre ou de l'extraction)
FIX = {
    "Archer": {"attacks": [{"name": "Dague", "skill": "Rixe", "value": 10, "damage": "2D6+4"}, {"name": "Arc", "skill": "Arc", "value": 15, "damage": "3D6"}]},
    "Berserker": {"attacks": [{"name": "Seax", "skill": "Rixe", "value": 15, "damage": "2D6+6"}, {"name": "Grande hache ou fléau", "skill": "Armes longues", "value": 18, "damage": "8D6"}]},
    "Champion": {"attacks": [{"name": "Lance", "skill": "Charge", "value": 18, "damage": "7D6"}, {"name": "Épée", "skill": "Épée", "value": 19, "damage": "5D6+1D6"}],
                 "notes": ["Charge : dégâts selon le meilleur cheval de guerre de la période.", "+1D6 de Chevalier farouche à l'épée.", "Le MJ peut remplacer l'Épée par une autre compétence d'arme."]},
    "Commandant": {"attacks": [{"name": "Lance", "skill": "Lance", "value": 14, "damage": "5D6"}, {"name": "Épée", "skill": "Épée", "value": 16, "damage": "5D6"}],
                   "skills": [{"name": "Équitation", "value": 16}], "notes": ["Compétences d'armes déjà réduites de 5 pour la cotte de mailles double.", "Rançon : 100 £ ou plus selon le rang."]},
    "Garde du Corps": {"attacks": [{"name": "Lance", "skill": "Lance", "value": 18, "damage": "5D6+1D6"}, {"name": "Épée", "skill": "Épée", "value": 20, "damage": "5D6+1D6"}],
                       "notes": ["+1D6 de Chevalier farouche compris dans les dégâts."]},
    "Fantassins": {"attacks": [{"name": "Hache de bataille", "skill": "Haches et masses", "value": 10, "damage": "4D6"}, {"name": "Masse d'armes", "skill": "Haches et masses", "value": 10, "damage": "4D6"},
                               {"name": "Épée", "skill": "Épée", "value": 10, "damage": "4D6"}],
                   "notes": ["Hache de bataille : −1D6 à la protection du bouclier.", "Masse d'armes : +1D6 contre la maille.", "Arme tirée au 1D6 : 1–2 épée, 3–4 hache, 5–6 masse."]},
    "Chevaliers à Pied": {"attacks": [{"name": "Lance", "skill": "Lance", "value": 12, "damage": "4D6"}, {"name": "Épée", "skill": "Épée", "value": 15, "damage": "4D6"}],
                          "notes": ["Lance : ignore la pénalité de hauteur contre les cavaliers."]},
    "Chevaliers d'élite à Pied": {"attacks": [{"name": "Lance", "skill": "Lance", "value": 14, "damage": "5D6"}, {"name": "Épée", "skill": "Épée", "value": 19, "damage": "5D6"}],
                                  "notes": ["Lance : ignore la pénalité de hauteur contre les cavaliers."]},
    "Guerriers saxons": {"attacks": [{"name": "Hache de bataille", "skill": "Haches et masses", "value": 14, "damage": "5D6"}, {"name": "Lance", "skill": "Lance", "value": 14, "damage": "5D6"},
                                     {"name": "Épée", "skill": "Épée", "value": 14, "damage": "5D6"}, {"name": "Grande hache", "skill": "Armes longues", "value": 14, "damage": "7D6"}],
                         "notes": ["Haches : −1D6 à la protection du bouclier.", "Lance : ignore la pénalité de hauteur contre les cavaliers.",
                                   "Arme tirée au 1D6 : 1–2 épée, 3–4 hache de bataille, 5–6 lance ; pas de bouclier avec la grande hache (armure 5)."]},
    "Hobilars": {"traits": [{"name": "Valeureux", "value": 10}], "skills": [{"name": "Équitation", "value": 16}]},
    "Sergents montés": {"traits": [{"name": "Valeureux", "value": 12}], "skills": [{"name": "Équitation", "value": 14}]},
    "Chevaliers montés": "battle-knights",
    "Chevaliers montés d’élite": "battle-knights",
    "Guerriers tribaux pictes": "battle-picts",
    "Chevalier renommé": {"passionsNote": "plus une ou plusieurs passions à 16"},
    "Chevalier extraordinaire": {"passionsNote": "plus une ou plusieurs passions à 16", "defaultSkillNote": "Toutes les autres compétences d'armes à 10."},
    "Elfe": {"armorValue": 18, "armorShield": 6, "passionsNote": "au moins une passion à 16 au choix du MJ"},
    "Dragon": {"glory": 1000, "notes": ["Mouvement 25 au sol, 85 en vol."]},
    "Faucon": {"notes": ["Mouvement 80 en vol."]},
    "Ours": {"notes": ["Blessure majeure et Inconscience : voir Férocité."]},
}

L = open("gm.txt", encoding="utf-8").read().split("\n")


def raw_lines(block, label):
    """Contenu d'un champ « Label : … » dans le bloc, sur plusieurs lignes tant qu'elles finissent par une virgule."""
    i = block["line"]
    for k in range(i + 2, i + 40):
        if k + 1 < len(L) and L[k + 1].startswith("TAI DEX FOR CON"):
            break
        m = re.match(r"^" + label + r"\s*:\s*(.*)$", L[k])
        if m:
            text = m.group(1).strip()
            while text.endswith(",") and k + 1 < len(L):
                k += 1
                text += " " + L[k].strip()
            return text
    return ""


def num(s):
    s = str(s or "").replace(",", "").strip()
    m = re.match(r"\d+", s)
    return int(m.group(0)) if m else None


def avg_value(raw):
    raw = raw.replace(" ", "")
    m = re.fullmatch(r"(\d+)\(\+(\d+)\)", raw)
    if m:
        return int(m.group(1)) + int(m.group(2))
    m = re.fullmatch(r"(\d+)\+(\d+)[dD](\d+)", raw)
    if m:
        return int(int(m.group(1)) + int(m.group(2)) * (int(m.group(3)) + 1) / 2 + 0.5)
    m = re.match(r"\d+", raw)
    return int(m.group(0)) if m else None


def parse_list(text):
    out, variable = [], []
    for part in re.split(r",\s*(?![^()]*\))", text):
        part = part.strip().rstrip(".")
        m = re.match(r"(.+?)\s*:?\s+(\d+\s*(?:\+\s*\d+[dD]\d+|\(\+\d+\))?)(.*)$", part)
        if not m or len(m.group(1)) > 40 or m.group(1)[:1].islower() or m.group(1).startswith("Au moins"):
            continue
        name, raw = m.group(1).strip(), m.group(2).strip()
        v = avg_value(raw)
        out.append({"name": name, "value": v})
        if "D" in raw.upper() or m.group(3).strip():
            variable.append(f"{name} {raw}{(' ' + m.group(3).strip()) if m.group(3).strip() else ''}")
    return out, variable


def stable_id(name):
    return hashlib.sha1(("pendragon-vf.adversaire." + name).encode()).hexdigest()[:16]


folders = {}
actors = []
for src, name, folder in SELECTION:
    b = B[src]
    fix = FIX.get(src, {})
    notes = [f"Livre du maître, p. {b['page']}."]
    variable = []
    attacks = [{"name": a["name"].strip(), "skill": SKILL_FIX.get(a["skill"], a["skill"]), "value": a["value"], "damage": a["damage"].replace("*", "").replace(" / ", "/").strip()}
               for a in b["attacks"]]
    # Javelot « Armes lancées » mal découpé
    for a in attacks:
        if a["name"].endswith(" Armes lancées"):
            a["name"], a["skill"] = a["name"][: -len(" Armes lancées")], "Arme lancée"
    traits, v1 = parse_list(raw_lines(b, "Traits?"))
    passions, v2 = parse_list(raw_lines(b, "Passions?"))
    skills, v3 = parse_list(raw_lines(b, "Compétences?"))
    variable += v1 + v2 + v3
    honor_raw = raw_lines(b, "Honneur")
    honor = avg_value(honor_raw) if honor_raw else None
    if honor_raw and "D" in honor_raw.upper():
        variable.append(f"Honneur {honor_raw}")
    if isinstance(fix, str) and fix == "battle-knights":
        mixed, _ = parse_list(raw_lines(b, "Compétences et traits"))
        traits = [x for x in mixed if x["name"] == "Valeureux"]
        skills = [x for x in mixed if x["name"] != "Valeureux"]
        fix = {}
    elif fix == "battle-picts":
        fix = {}
    if not traits and not skills:
        mixed, _ = parse_list(raw_lines(b, "Compétences et traits"))
        if mixed:
            traits = [x for x in mixed if x["name"] in ("Valeureux", "Prudent", "Couard")]
            skills = [x for x in mixed if x not in traits]
    if not traits:
        t, _ = parse_list(raw_lines(b, "Trait"))
        traits = t
    if fix.get("attacks"): attacks = fix["attacks"]
    if fix.get("traits"): traits = fix["traits"]
    if fix.get("skills"): skills = fix["skills"]
    notes += fix.get("notes", [])
    if fix.get("passionsNote"): notes.append("Passions : " + fix["passionsNote"] + ".")
    if fix.get("defaultSkillNote"): notes.append(fix["defaultSkillNote"])
    for n in b["notes"]:
        if n.startswith("ATT "):
            notes.append(f"ATT {n[4:]} (valeur moyenne reportée).")
    if variable:
        notes.append("Valeurs variables (moyenne reportée) : " + ", ".join(variable) + ".")
    if src in BATTLE:
        loss, minimum, kv = BATTLE[src]
        notes.append(f"Bataille : perte de Moral {loss}, Moral minimum {minimum}, valeur de chevalier {kv}.")
    for a in ABIL.get(src, []):
        notes.append(a)

    armor = str(b.get("armor") or "0")
    av, _, sh = armor.partition("+")
    armor_value = fix.get("armorValue", num(av) or 0)
    armor_shield = fix.get("armorShield", num(sh) or 0)
    chars = {k: {"value": b["chars"].get(k, 0)} for k in ["siz", "dex", "str", "con", "app"]}
    c = {k: chars[k]["value"] for k in chars}
    hp = num(b["hp"])
    # Valeurs imposées seulement quand le livre s'écarte du calcul
    rnd = lambda x: int(x + 0.5)
    auto = {"hp": c["con"] + c["siz"], "knockdown": c["siz"], "majorWound": c["con"],
            "unconscious": rnd((c["con"] + c["siz"]) / 4), "move": rnd((c["str"] + c["dex"]) / 2) + 5, "healRate": rnd(c["con"] / 5)}
    book = {"hp": hp, "knockdown": num(b["knockdown"]), "majorWound": num(b["majorWound"]), "unconscious": num(b["unconscious"]),
            "move": num(b["move"]), "healRate": num(b["healRate"])}
    overrides = {k: (v if v is not None and v != auto[k] else None) for k, v in book.items()}
    category = CATEGORY.get(folder, "character")
    glory = fix.get("glory", num(b["glory"]) or 0)
    fid = stable_id("folder." + folder)
    folders[folder] = fid
    actors.append({
        "_id": stable_id(name), "name": name, "type": "pnj", "img": f"{ICONS}/{category}.svg", "folder": fid,
        "system": {
            "category": category, "tagline": TAGLINE[folder],
            "characteristics": chars, "health": {"hp": {"value": hp or auto["hp"]}}, "overrides": overrides,
            "armor": {"value": armor_value, "shield": armor_shield, "description": re.sub(r"\s*\([^)]*$", "", (raw_lines(b, "Armure") or raw_lines(b, "Equipement"))[:200]).rstrip(" ,") if src != "Elfe" else "métal d'étoile (voir les notes)"},
            "gloryReward": glory, "valorousMod": b.get("valorousMod"),
            "attacks": attacks, "skills": skills, "traits": traits, "honor": honor, "passions": passions,
            "defaultSkill": 5, "possessions": "", "notes": "\n".join(notes)
        },
        "prototypeToken": {"name": name, "actorLink": False, "disposition": -1, "texture": {"src": f"{ICONS}/{category}.svg"}}
    })

# Tables 8.2 à 8.4 (chiens, cervidés, grands félins) : saisies à la main
CLAWS = "Griffes : deux jets de dégâts séparés si le félin l'emporte, blessures distinctes, additionnées pour la Chute."
MAUL = "Mutilation : au tour suivant une Chute, morsure mortelle ; défense à −5 sauf en Rixe."
CHARGE = "Charge : dégâts complets en chargeant (règles de passage, Livre du joueur p. 149)."
TABLE = [
    # nom, page, TAI, DEX, FOR, CON, mouvement, PV, Inc., Évitement, armure, attaques, Gloire, mod. Valeureux, notes
    ("Bâtard", 175, 3, 15, 6, 15, 8, 18, 5, 10, 1, [("Morsure", 15, "2D6")], 0, None, []),
    ("Chien courant", 175, 5, 15, 12, 20, 10, 25, 6, 10, 1, [("Morsure", 15, "3D6")], 0, None, ["Chien de piste (odorat)."]),
    ("Lévrier", 175, 4, 20, 8, 12, 23, 16, 4, 10, 0, [("Morsure (en marchant)", 15, "2D6"), ("Morsure (en courant)", 10, "2D6"), ("Morsure (en sprintant)", 5, "2D6")], 0, None, ["Chien de vue, très rapide."]),
    ("Lévrier irlandais", 175, 11, 15, 16, 20, 15, 31, 8, 8, 2, [("Morsure", 20, "4D6")], 15, -1, []),
    ("Cerf", 177, 30, 20, 30, 12, 30, 42, 11, 15, 4, [("Charge", 12, "6D6"), ("Empalement", 12, "4D6")], 10, None, [CHARGE]),
    ("Chevreuil", 177, 5, 25, 5, 12, 20, 17, 4, 18, 0, [("Coup de sabot", 10, "1D6")], 0, None, ["Trop petit pour inquiéter un chevalier en armure."]),
    ("Daim", 177, 12, 20, 15, 12, 15, 24, 6, 18, 3, [("Charge", 10, "3D6"), ("Empalement", 10, "2D6")], 1, None, [CHARGE]),
    ("Élan", 177, 45, 15, 45, 12, 23, 57, 14, 14, 5, [("Charge", 12, "9D6"), ("Empalement", 12, "7D6")], 25, None, [CHARGE]),
    ("Lion", 179, 40, 20, 40, 15, 35, 55, 14, 10, 5, [("Griffes", 20, "4D6/4D6"), ("Mutilation", 20, "8D6")], 250, -5, [CLAWS, MAUL]),
    ("Lynx", 179, 5, 25, 15, 20, 25, 25, 6, 20, 2, [("Griffes", 20, "1D6/1D6"), ("Mutilation", 25, "3D6")], 10, None, [CLAWS, MAUL]),
    ("Panthère", 179, 12, 25, 25, 15, 20, 27, 8, 15, 3, [("Griffes", 20, "2D6/2D6"), ("Mutilation", 25, "4D6")], 100, -5, [CLAWS, MAUL, "Son rot apaise les dragons."]),
]
fid = stable_id("folder.Animaux")
for (name, page, siz, dex, st, con, move, hp, unc, evade, armor, atts, glory, vmod, extra) in TABLE:
    rnd = lambda x: int(x + 0.5)
    auto = {"hp": con + siz, "unconscious": rnd((con + siz) / 4), "move": rnd((st + dex) / 2) + 5}
    actors.append({
        "_id": stable_id(name), "name": name, "type": "pnj", "img": f"{ICONS}/creature.svg", "folder": fid,
        "system": {
            "category": "creature", "tagline": "Animal",
            "characteristics": {"siz": {"value": siz}, "dex": {"value": dex}, "str": {"value": st}, "con": {"value": con}, "app": {"value": 0}},
            "health": {"hp": {"value": hp}},
            "overrides": {"hp": hp if hp != auto["hp"] else None, "knockdown": None, "majorWound": None,
                          "unconscious": unc if unc != auto["unconscious"] else None, "move": move if move != auto["move"] else None, "healRate": None},
            "armor": {"value": armor, "shield": 0, "description": ""},
            "gloryReward": glory, "valorousMod": vmod,
            "attacks": [{"name": n, "skill": "", "value": v, "damage": d} for n, v, d in atts],
            "skills": [{"name": "Évitement", "value": evade}], "traits": [], "honor": None, "passions": [],
            "defaultSkill": 5, "possessions": "", "notes": "\n".join([f"Livre du maître, p. {page}."] + extra)
        },
        "prototypeToken": {"name": name, "actorLink": False, "disposition": -1, "texture": {"src": f"{ICONS}/creature.svg"}}
    })

# Bêtes sans ATT : 0 plutôt que 10
for a in actors:
    if a["system"]["category"] == "creature" and not a["system"]["characteristics"]["app"]["value"]:
        a["system"]["characteristics"]["app"]["value"] = 0

out = {
    "version": 2,
    "folders": [{"_id": fid, "name": n, "type": "Actor", "sorting": "a"} for n, fid in folders.items()],
    "actors": actors
}
json.dump(out, open("../../data/adversaires.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(len(actors), "acteurs,", len(folders), "dossiers")
for a in actors:
    s = a["system"]
    print(f"{a['name']:28} {s['characteristics']['siz']['value']:>3} PV{s['health']['hp']['value']:>4} A{s['armor']['value']}+{s['armor']['shield']} G{s['gloryReward']:>5} H{s['honor']} | "
          + "; ".join(f"{x['name']}/{x['skill']} {x['value']} {x['damage']}" for x in s["attacks"])
          + " | T " + ", ".join(f"{x['name']} {x['value']}" for x in s["traits"])
          + " | P " + ", ".join(f"{x['name']} {x['value']}" for x in s["passions"])
          + " | C " + ", ".join(f"{x['name']} {x['value']}" for x in s["skills"])
          + " | O " + ",".join(k for k, v in s["overrides"].items() if v is not None))
