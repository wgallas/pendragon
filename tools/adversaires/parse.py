"""Extraction des blocs de statistiques du Livre du maître (texte brut du PDF).

Ne garde que les valeurs de jeu (nombres, noms d'attaques, de traits, de passions et de compétences),
les noms des capacités spéciales et la page : aucun texte descriptif du livre.
"""
import json, re, sys

lines = open("gm.txt", encoding="utf-8").read().split("\n")

SKILL_WORDS = ["Haches et masses", "Armes longues", "Arme de jet", "Arbalète", "Charge", "Rixe", "Épée", "Lance", "Arc",
               "Équitation", "Bataille"]
NUM = r"(\d+(?:\s*\(\+\d+\))?)"


def page_of(i):
    """Numéro de page : ligne isolée composée d'un nombre, juste après une ligne vide (pied de page du PDF)."""
    for j in range(i, max(0, i - 400), -1):
        if re.fullmatch(r"\d{2,3}", lines[j].strip()) and (j == 0 or lines[j - 1].strip() == "" or "William Gallas" in lines[j - 1]):
            return int(lines[j].strip())
    return None


def value(s):
    """« 20 (+1) » → 21 ; « 13+1D3 » → moyenne arrondie ; « 2D6+3 » → 10."""
    s = s.strip().replace("–", "-")
    m = re.fullmatch(r"(\d+)\s*\(\+(\d+)\)", s)
    if m:
        return int(m.group(1)) + int(m.group(2))
    m = re.fullmatch(r"(\d*)\s*\+?\s*(\d+)[dD](\d+)\s*([+-]\s*\d+)?", s)
    if m and "D" in s.upper():
        base = int(m.group(1) or 0)
        n, f = int(m.group(2)), int(m.group(3))
        extra = int(m.group(4).replace(" ", "")) if m.group(4) else 0
        return int(base + n * (f + 1) / 2 + extra + 0.5)
    m = re.match(r"-?\d+", s)
    return int(m.group(0)) if m else None


def split_list(text):
    """« Valeureux 13+1D3, Fier 16 » → [(nom, valeur, brut)]."""
    out = []
    for part in re.split(r",\s*(?![^()]*\))", text):
        part = part.strip().rstrip(".")
        if not part:
            continue
        m = re.match(r"(.+?)\s+((?:\d+\s*\+\s*\d*[dD]\d+)|(?:\d+\s*\(\+\d+\))|(?:\d+))\s*(.*)$", part)
        if m:
            out.append({"name": m.group(1).strip(), "value": value(m.group(2)), "raw": m.group(2).strip() + ((" " + m.group(3)) if m.group(3) else "")})
        else:
            out.append({"name": part, "value": None, "raw": ""})
    return out


def parse_attack(line, has_skill):
    line = line.strip()
    m = re.match(r"(.+?)\s+" + NUM + r"\s+(\S.*)$", line)
    if not m:
        return None
    left, val, dmg = m.group(1), m.group(2), m.group(3)
    skill = ""
    if has_skill:
        for w in sorted(SKILL_WORDS, key=len, reverse=True):
            if left.endswith(" " + w) or left == w:
                skill = w
                left = left[: -len(w)].strip() or w
                break
    return {"name": left, "skill": skill, "value": value(val), "damage": dmg.strip()}


blocks = []
for i, l in enumerate(lines):
    if not l.startswith("TAI DEX FOR CON"):
        continue
    cols = l.split()
    vals = lines[i + 1].split()
    # nom : remonter au-dessus d'une éventuelle phrase descriptive
    j = i - 1
    name = lines[j].strip()
    if len(name.split()) > 4 or name.endswith((".", "!")) or name[:1].islower():
        k = j
        while k > i - 6 and (len(lines[k].split()) > 4 or lines[k].strip()[:1].islower()):
            k -= 1
        name = lines[k].strip()
    b = {"name": name, "line": i, "page": page_of(i), "chars": {}, "attacks": [], "notes": []}
    keys = {"TAI": "siz", "DEX": "dex", "FOR": "str", "CON": "con", "ATT": "app"}
    # ATT peut être une formule « 2D6+3 » (un seul jeton)
    for c, v in zip(cols, vals):
        b["chars"][keys[c]] = value(v)
        if c == "ATT" and "D" in v.upper():
            b["notes"].append(f"ATT {v}")
    k = i + 2
    if lines[k].strip() == "Attaques":
        header = lines[k + 1]
        has_skill = "Compétence Valeur" in header
        k += 2
        while k < len(lines) and not lines[k].startswith("Santé"):
            a = parse_attack(lines[k], has_skill)
            if a:
                b["attacks"].append(a)
            elif b["attacks"]:
                b["attacks"][-1]["name"] += " " + lines[k].strip()   # nom d'arme sur deux lignes
            k += 1
    # santé (4 lignes après « Attribut Valeur Attribut Valeur »)
    while k < len(lines) and not lines[k].startswith("Attribut Valeur"):
        k += 1
    stats = " ".join(lines[k + 1:k + 6])
    def grab(label):
        m = re.search(label + r"\s+([\d,]+(?:\+\d+)?|—)", stats)
        return m.group(1) if m else None
    b["hp"] = grab("Points de [Vv]ie")
    b["knockdown"] = grab("Chute")
    b["majorWound"] = grab("Blessure Majeure")
    b["unconscious"] = grab("Inconscience")
    b["move"] = grab("Mouvement")
    b["armor"] = grab("Points d’Armure")
    b["glory"] = grab("Récompense de Gloire")
    b["healRate"] = grab("Taux de Guérison")
    m = re.search(r"Mod\. Valeureux\s+([–-]?\d+)", stats)
    b["valorousMod"] = int(m.group(1).replace("–", "-")) if m else None
    m = re.search(r"Mouvement\s+([\d/]+\s*\([^)]*\))", stats)
    if m:
        b["notes"].append(f"Mouvement {m.group(1)}")
    k += 5
    # lignes suivantes jusqu'au prochain bloc : listes et noms de capacités
    rest = []
    while k < len(lines) and k < i + 80 and not (k + 1 < len(lines) and lines[k + 1].startswith("TAI DEX FOR CON")):
        rest.append(lines[k])
        k += 1
    text = "\n".join(rest)
    def field(label):
        m = re.search(r"(?m)^" + label + r"\s*:\s*(.+(?:\n(?![A-ZÉÈÀÂ][\w’'\- ]{1,30}\s*:).+)*)", text)
        return re.sub(r"\s+", " ", m.group(1)).strip() if m else ""
    b["armorText"] = field("Armure")
    b["traits"] = split_list(field("Traits?"))
    b["honor"] = field("Honneur")
    b["passions"] = split_list(field("Passions?"))
    b["skills"] = split_list(field("Compétences?"))
    b["possessions"] = field("Possessions")
    # noms des capacités : « Nom : … » ou « Nom: … » en début de ligne, hors champs connus
    known = {"Armure", "Traits", "Trait", "Honneur", "Passions", "Passion", "Compétences", "Compétence", "Possessions",
             "Serviteurs", "Note", "Trésor", "Rançon"}
    abil = []
    for m in re.finditer(r"(?m)^([A-ZÉÈÀÂ][\w’' \-éèêàâîôûç]{2,40}?)\s*:", text):
        n = m.group(1).strip()
        if n not in known and n not in abil and not n.startswith(("Chapitre", "Table", "Perte", "Moral", "Valeur de chevalier")):
            abil.append(n)
    b["abilities"] = abil[:8]
    blocks.append(b)

json.dump(blocks, open("blocks.json", "w"), ensure_ascii=False, indent=1)
for b in blocks:
    print(b["page"], b["name"], "|", b["chars"], "| att", [(a["name"], a["skill"], a["value"], a["damage"]) for a in b["attacks"]],
          "| PV", b["hp"], "AR", b["armor"], "G", b["glory"], "| T", [(t["name"], t["value"]) for t in b["traits"]],
          "| H", b["honor"], "| P", [(t["name"], t["value"]) for t in b["passions"]], "| C", [(t["name"], t["value"]) for t in b["skills"]],
          "| cap", b["abilities"])
