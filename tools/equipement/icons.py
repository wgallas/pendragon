"""Dessine les icônes d'équipement (icons/gear/*.svg), dans le style enluminé du système.

Usage : python3 tools/equipement/icons.py  (depuis la racine du dépôt)
"""
import os

INK, VERM, GOLD, LAPIS, STEEL, WOOD, PARCH = "#2b2118", "#a8321e", "#b8892b", "#2f4a7a", "#cfccc3", "#7a5434", "#f4ead0"
OUT = os.path.join(os.path.dirname(__file__), "..", "..", "icons", "gear")

def svg(body, rotate=False):
    inner = f'<g transform="rotate(45 32 32)">{body}</g>' if rotate else body
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="256" height="256">'
            f'<rect x="1.5" y="1.5" width="61" height="61" rx="6" fill="{PARCH}" stroke="{INK}" stroke-width="2"/>'
            f'<rect x="4.5" y="4.5" width="55" height="55" rx="4" fill="none" stroke="{GOLD}" stroke-width="0.8"/>'
            f'<g stroke="{INK}" stroke-width="1.2" stroke-linejoin="round" stroke-linecap="round">{inner}</g></svg>')

def poly(pts, fill):
    return f'<polygon points="{" ".join(f"{x},{y}" for x, y in pts)}" fill="{fill}"/>'

def rect(x, y, w, h, fill, rx=0):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}"/>'

def circ(cx, cy, r, fill):
    return f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{fill}"/>'

def path(d, fill="none", sw=None):
    return f'<path d="{d}" fill="{fill}"{f" stroke-width={chr(34)}{sw}{chr(34)}" if sw else ""}/>'

def shaft(y1, y2, w=2.6, fill=WOOD):
    return rect(32 - w / 2, y1, w, y2 - y1, fill, rx=1)

ICONS = {
    # --- Armes (dessinées verticales, puis inclinées) ---
    "sword": (poly([(29.5, 12), (32, 5), (34.5, 12), (34.5, 41), (29.5, 41)], STEEL)
              + '<line x1="32" y1="10" x2="32" y2="39" stroke-width="0.7"/>'
              + rect(22.5, 41, 19, 3.4, GOLD, 1.5) + rect(30.4, 44.4, 3.2, 9, INK, 1) + circ(32, 56, 3.2, GOLD), True),
    "dagger": (poly([(30.3, 22), (32, 15), (33.7, 22), (33.7, 41), (30.3, 41)], STEEL)
               + rect(26.5, 41, 11, 3, GOLD, 1.3) + rect(30.8, 44, 2.4, 7, INK, 1) + circ(32, 53, 2.4, GOLD), True),
    "seax": (poly([(29.5, 41), (29.5, 17), (35, 23), (34.5, 41)], STEEL)
             + rect(29, 41, 6, 2, INK, 0.8) + rect(30.4, 43, 3.2, 10, WOOD, 1.2) + circ(32, 54.5, 1.8, GOLD), True),
    "spear": (shaft(15, 60) + poly([(32, 3), (35.5, 11), (32, 18), (28.5, 11)], STEEL)
              + rect(30.3, 17, 3.4, 3, INK, 0.6), True),
    "javelin": (shaft(18, 56, 2) + poly([(32, 8), (34.3, 14), (32, 20), (29.7, 14)], STEEL), True),
    "lance": (poly([(31, 9), (33, 9), (35.2, 46), (28.8, 46)], VERM) + poly([(32, 3), (33.5, 9), (30.5, 9)], STEEL)
              + '<line x1="30.3" y1="20" x2="33.7" y2="26" stroke="' + GOLD + '" stroke-width="1.6"/>'
              + '<line x1="29.7" y1="30" x2="34.3" y2="37" stroke="' + GOLD + '" stroke-width="1.6"/>'
              + poly([(24.5, 46), (39.5, 46), (34.5, 39.5), (29.5, 39.5)], STEEL) + rect(30.2, 46, 3.6, 13, WOOD, 1.2), True),
    "staff": (shaft(6, 58, 3.2) + rect(30, 6, 4, 4, INK, 1) + rect(30, 54, 4, 4, INK, 1), True),
    "club": (path("M30.5 58 L33.5 58 L37 18 Q32 10 27 18 Z", WOOD) + circ(30, 24, 1, INK) + circ(34, 30, 1, INK) + circ(31, 36, 1, INK), True),
    "greatclub": (path("M30 59 L34 59 L39 12 Q32 4 25 12 Z", WOOD) + circ(29, 18, 1.2, INK) + circ(35, 24, 1.2, INK) + circ(30.5, 30, 1.2, INK), True),
    "axe": (shaft(12, 60) + path("M33 14 Q42 8 47 12 Q44 20 47 29 Q42 32 33 26 Z", STEEL), True),
    "greataxe": (shaft(8, 60) + path("M33 11 Q42 4 48 9 Q44 18 48 27 Q42 31 33 24 Z", STEEL)
                 + path("M31 11 Q22 4 16 9 Q20 18 16 27 Q22 31 31 24 Z", STEEL), True),
    "francisca": (shaft(22, 58) + path("M33 22 Q38 14 45 13 Q42 21 44 28 Q38 28 33 30 Z", STEEL), True),
    "mace": (shaft(24, 60) + poly([(32, 9), (38, 15), (38, 23), (32, 29), (26, 23), (26, 15)], STEEL)
             + poly([(32, 5), (34, 10), (30, 10)], STEEL) + poly([(41, 19), (37, 21), (37, 17)], STEEL) + poly([(23, 19), (27, 17), (27, 21)], STEEL), True),
    "greatmace": (shaft(22, 61, 3) + poly([(32, 4), (40, 11), (40, 21), (32, 28), (24, 21), (24, 11)], STEEL)
                  + '<line x1="32" y1="4" x2="32" y2="28"/><line x1="24" y1="16" x2="40" y2="16"/>', True),
    "maul": (shaft(20, 60, 3) + rect(22, 8, 20, 12, WOOD, 2) + '<line x1="27" y1="8" x2="27" y2="20"/><line x1="37" y1="8" x2="37" y2="20"/>', True),
    "bow": (path("M22 7 Q48 32 22 57", "none", 3.2) + path("M22 7 Q48 32 22 57", "none") + '<line x1="22" y1="7" x2="22" y2="57" stroke-width="0.8"/>'
            + '<line x1="16" y1="32" x2="46" y2="32" stroke-width="1.4"/>' + poly([(48, 32), (44, 30), (44, 34)], STEEL)
            + poly([(16, 32), (19, 29.5), (19, 34.5)], VERM), False),
    "longbow": (path("M24 4 Q50 32 24 60", "none", 3.6) + '<line x1="24" y1="4" x2="24" y2="60" stroke-width="0.8"/>'
                + rect(33.5, 29, 3, 6, GOLD, 1), False),
    "crossbow": (rect(30, 20, 4, 36, WOOD, 1.5) + path("M12 24 Q32 12 52 24", "none", 3) + '<line x1="12" y1="24" x2="52" y2="24" stroke-width="0.8"/>'
                 + rect(29, 15, 6, 6, INK, 1) + '<line x1="32" y1="10" x2="32" y2="34" stroke-width="1.6"/>' + poly([(32, 7), (34, 11), (30, 11)], STEEL), False),
    # --- Armures ---
    "gambison": (path("M22 10 L28 8 Q32 12 36 8 L42 10 L52 20 L47 26 L44 23 L44 56 L20 56 L20 23 L17 26 L12 20 Z", "#d9c398")
                 + "".join(f'<line x1="21" y1="{y}" x2="43" y2="{y}" stroke-width="0.7"/>' for y in range(18, 56, 5))
                 + '<line x1="32" y1="12" x2="32" y2="56" stroke-width="0.7"/>', False),
    "aketon": (path("M22 10 L28 8 Q32 12 36 8 L42 10 L52 20 L47 26 L44 23 L44 56 L20 56 L20 23 L17 26 L12 20 Z", "#efe2c0")
               + "".join(f'<line x1="21" y1="{y}" x2="43" y2="{y}" stroke-width="0.5" stroke-dasharray="2 1.5"/>' for y in range(20, 56, 7)), False),
    "mail": ('<defs><pattern id="m" width="4" height="4" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.4" fill="none" stroke="#6f6c66" stroke-width="0.7"/></pattern></defs>'
             + path("M22 10 L28 8 Q32 12 36 8 L42 10 L54 24 L48 29 L44 24 L44 58 L35 58 L32 50 L29 58 L20 58 L20 24 L16 29 L10 24 Z", STEEL)
             + path("M22 10 L28 8 Q32 12 36 8 L42 10 L54 24 L48 29 L44 24 L44 58 L35 58 L32 50 L29 58 L20 58 L20 24 L16 29 L10 24 Z", "url(#m)"), False),
    "hauberk_short": ('<defs><pattern id="m" width="4" height="4" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.4" fill="none" stroke="#6f6c66" stroke-width="0.7"/></pattern></defs>'
                      + path("M22 12 L28 10 Q32 14 36 10 L42 12 L49 21 L44 25 L44 48 L20 48 L20 25 L15 21 Z", STEEL)
                      + path("M22 12 L28 10 Q32 14 36 10 L42 12 L49 21 L44 25 L44 48 L20 48 L20 25 L15 21 Z", "url(#m)"), False),
    "mail_adv": ('<defs><pattern id="m" width="4" height="4" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.4" fill="none" stroke="#6f6c66" stroke-width="0.7"/></pattern></defs>'
                 + path("M22 8 L28 6 Q32 10 36 6 L42 8 L56 26 L51 30 L44 22 L44 50 L38 50 L37 60 L33 60 L32 50 L31 60 L27 60 L26 50 L20 50 L20 22 L13 30 L8 26 Z", STEEL)
                 + path("M22 8 L28 6 Q32 10 36 6 L42 8 L56 26 L51 30 L44 22 L44 50 L38 50 L37 60 L33 60 L32 50 L31 60 L27 60 L26 50 L20 50 L20 22 L13 30 L8 26 Z", "url(#m)")
                 + rect(26, 44, 3, 6, WOOD, 1) + rect(35, 44, 3, 6, WOOD, 1), False),
    "coat_plates": (path("M20 10 L44 10 L48 18 L46 54 L18 54 L16 18 Z", "#8a2a1c")
                    + "".join(rect(x, y, 6, 6, STEEL, 0.8) for y in (17, 26, 35, 44) for x in (21, 29, 37))
                    + "".join(circ(x + 1, y + 1, 0.6, GOLD) for y in (17, 26, 35, 44) for x in (21, 29, 37)), False),
    "helm_open": (path("M16 40 Q16 14 32 14 Q48 14 48 40 Z", STEEL) + rect(15, 39, 34, 4, INK, 1)
                  + '<line x1="32" y1="14" x2="32" y2="39" stroke-width="0.8"/>', False),
    "kettle": (path("M10 40 Q32 30 54 40 Q46 44 32 44 Q18 44 10 40 Z", STEEL) + path("M20 37 Q20 16 32 16 Q44 16 44 37 Z", STEEL), False),
    "helm_nasal": (path("M17 42 Q18 22 32 8 Q46 22 47 42 Z", STEEL) + rect(16, 40, 32, 4, GOLD, 1)
                   + rect(30.3, 44, 3.4, 12, STEEL, 1) + '<line x1="32" y1="9" x2="32" y2="40" stroke-width="0.8"/>', False),
    "helm_nasal_adv": (path("M17 42 Q18 22 32 8 Q46 22 47 42 Z", STEEL) + rect(16, 40, 32, 4, GOLD, 1)
                       + path("M18 44 L46 44 L44 56 Q32 60 20 56 Z", STEEL)
                       + '<line x1="22" y1="49" x2="30" y2="49" stroke-width="1.6"/><line x1="34" y1="49" x2="42" y2="49" stroke-width="1.6"/>'
                       + circ(26, 53, 0.7, INK) + circ(38, 53, 0.7, INK) + circ(32, 54, 0.7, INK), False),
    # --- Boucliers ---
    "shield_norman": (path("M17 10 Q32 4 47 10 L47 28 Q47 46 32 60 Q17 46 17 28 Z", VERM)
                      + path("M20 12.5 Q32 7.5 44 12.5 L44 28 Q44 44 32 56 Q20 44 20 28 Z", "none")
                      + path("M32 6 L32 58 M18 22 L46 22", "none") + circ(32, 22, 3, GOLD), False),
    "shield_round": (circ(32, 32, 22, LAPIS) + path("M32 10 L32 54 M10 32 L54 32", "none") + circ(32, 32, 22, "none")
                     + circ(32, 32, 6, STEEL) + circ(32, 32, 2, GOLD), False),
    "shield_plain": (circ(32, 32, 21, "#a07a4a") + "".join(f'<line x1="{x}" y1="{32 - (441 - (x - 32) ** 2) ** 0.5:.1f}" x2="{x}" y2="{32 + (441 - (x - 32) ** 2) ** 0.5:.1f}" stroke-width="0.7"/>' for x in (22, 27, 32, 37, 42))
                     + circ(32, 32, 5, STEEL), False),
    "buckler": (circ(32, 32, 14, STEEL) + circ(32, 32, 10, "none") + circ(32, 32, 4, GOLD), False),
    "scutum": (rect(18, 6, 28, 52, VERM, 12) + rect(21, 9, 22, 46, "none", 10) + circ(32, 32, 4.5, GOLD)
               + path("M32 12 L32 26 M32 38 L32 52", "none"), False),
    "targe": (circ(32, 32, 15, LAPIS) + circ(32, 32, 11, "none") + path("M32 21 Q40 26 32 32 Q24 38 32 43", "none")
              + rect(14, 30, 36, 4, WOOD, 1), False),
}

def main():
    os.makedirs(OUT, exist_ok=True)
    for name, (body, rot) in ICONS.items():
        with open(os.path.join(OUT, f"{name}.svg"), "w") as f:
            f.write(svg(body, rot))
    print(len(ICONS), "icônes écrites dans", os.path.normpath(OUT))

if __name__ == "__main__":
    main()
