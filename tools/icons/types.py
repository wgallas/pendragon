"""Dessine les icônes par défaut des types d'acteurs et d'objets (icons/types/*.svg),
dans le style enluminé des icônes d'équipement.

Usage : python3 tools/icons/types.py  (depuis la racine du dépôt)
"""
import os

INK, VERM, GOLD, LAPIS, STEEL, WOOD, PARCH = "#2b2118", "#a8321e", "#b8892b", "#2f4a7a", "#cfccc3", "#7a5434", "#f4ead0"
SKIN, GREEN, GREY, CLOTH = "#e8c9a0", "#4f6b3a", "#8d8478", "#e3d3ad"
OUT = os.path.join(os.path.dirname(__file__), "..", "..", "icons", "types")


def svg(body, defs=""):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="256" height="256">{defs}'
            f'<rect x="1.5" y="1.5" width="61" height="61" rx="6" fill="{PARCH}" stroke="{INK}" stroke-width="2"/>'
            f'<rect x="4.5" y="4.5" width="55" height="55" rx="4" fill="none" stroke="{GOLD}" stroke-width="0.8"/>'
            f'<g stroke="{INK}" stroke-width="1.2" stroke-linejoin="round" stroke-linecap="round">{body}</g></svg>')


def p(d, fill="none", **kw):
    extra = "".join(f' {k.replace("_", "-")}="{v}"' for k, v in kw.items())
    return f'<path d="{d}" fill="{fill}"{extra}/>'


def c(cx, cy, r, fill, **kw):
    extra = "".join(f' {k.replace("_", "-")}="{v}"' for k, v in kw.items())
    return f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{fill}"{extra}/>'


def r(x, y, w, h, fill, rx=0):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}"/>'


def line(x1, y1, x2, y2, **kw):
    extra = "".join(f' {k.replace("_", "-")}="{v}"' for k, v in kw.items())
    return f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}"{extra}/>'


def bust(cloak, collar=None):
    """Buste vu de face : épaules drapées et cou ; la tête est dessinée à part."""
    out = p("M10 59 Q11 43 24 40 L40 40 Q53 43 54 59 Z", cloak)
    if collar:
        out += p("M24 40 L32 49 L40 40", collar)
    return out


def sword(angle):
    blade = (p("M30.6 10 L32 5 L33.4 10 L33.4 38 L30.6 38 Z", STEEL) + r(25, 38, 14, 3, GOLD, 1.2)
             + r(30.8, 41, 2.4, 8, INK, 1) + c(32, 51, 2.4, GOLD))
    return f'<g transform="rotate({angle} 32 32)">{blade}</g>'


ICONS = {
    # --- Acteurs ---
    # Chevalier : heaume à cimier, sur un écu
    "knight": (p("M14 12 L50 12 L50 34 Q50 52 32 58 Q14 52 14 34 Z", LAPIS)
               + p("M32 12 L32 58", "none", stroke=GOLD, stroke_width="1.4")
               + p("M22 21 Q22 14 32 14 Q42 14 42 21 L42 44 Q37 49 32 49 Q27 49 22 44 Z", STEEL)
               + r(23, 27, 18, 2.6, INK, 1)
               + line(32, 31, 32, 46, stroke_width="1.4")
               + "".join(c(x, y, 0.7, INK) for x, y in [(27, 36), (27, 40), (37, 36), (37, 40)])
               + p("M32 14 Q33 7 40 6 Q37 10 39 13 Q35 11 32 14 Z", VERM)),
    # Personnage : buste au manteau bleu, capuchon
    "character": (bust(LAPIS, GOLD) + c(32, 28, 9, SKIN)
                  + p("M21 30 Q20 15 32 14 Q44 15 43 30 Q41 21 32 20 Q23 21 21 30 Z", LAPIS)
                  + c(28.5, 29, 0.9, INK) + c(35.5, 29, 0.9, INK) + p("M29 33.5 Q32 35.5 35 33.5")),
    # Écuyer : jeune homme à la cotte vermeille et au fanion
    "squire": (line(49, 8, 49, 59, stroke=WOOD, stroke_width="2.4") + p("M49 9 L57.5 12 L49 15.5 Z", VERM)
               + bust(VERM, CLOTH) + c(31, 28, 8.5, SKIN)
               + p("M22.5 27 Q22 18 31 18 Q40 18 39.5 27 Q36 22 31 22 Q26 22 22.5 27 Z", WOOD)
               + c(28, 29, 0.9, INK) + c(34, 29, 0.9, INK) + p("M28.5 33 Q31 34.5 33.5 33")),
    # Suivant : homme au chaperon vert
    "follower": (bust(GREEN, CLOTH) + c(32, 29, 8.5, SKIN)
                 + p("M22 26 Q24 14 34 15 Q44 16 43 26 Q38 22 32 22 Q26 22 22 26 Z", GREEN)
                 + p("M42 22 Q50 26 47 36", "none", stroke=GREEN, stroke_width="3")
                 + c(29, 30, 0.9, INK) + c(35, 30, 0.9, INK) + p("M29.5 34 Q32 35.5 34.5 34")),
    # Créature : tête de loup
    "creature": (p("M15 12 L25 22 L39 22 L49 12 L48 30 Q48 40 40 47 L36 56 L28 56 L24 47 Q16 40 16 30 Z", GREY)
                 + p("M19 17 L24 23 L20 25 Z", WOOD) + p("M45 17 L40 23 L44 25 Z", WOOD)
                 + p("M24 34 L29 31 L29 35 Z", GOLD) + p("M40 34 L35 31 L35 35 Z", GOLD)
                 + p("M28 44 Q32 41 36 44 L35 49 L29 49 Z", INK)
                 + p("M29 52 L30 55 M35 52 L34 55", "none", stroke=PARCH)),
    # Cheval : tête de profil, bride vermeille
    "horse": (p("M40 8 L44 16 Q52 22 52 34 L52 58 L26 58 Q30 48 26 42 L14 46 Q8 44 10 38 L20 24 Q26 14 36 13 Z", WOOD)
              + p("M40 8 L36 16 M44 16 Q44 22 52 30", "none")
              + p("M38 14 Q46 20 50 34 L50 56", "none", stroke=INK, stroke_width="2.4")
              + c(28, 25, 1.4, INK) + c(13.5, 41, 1, INK)
              + p("M20 30 L28 27 L24 42 M14 37 L22 33", "none", stroke=VERM, stroke_width="2")
              + c(24, 31, 1.6, GOLD)),
    # --- Objets ---
    # Bataille : deux bannières croisées
    "battle": (line(17, 59, 44, 8, stroke=WOOD, stroke_width="2.4") + line(47, 59, 20, 8, stroke=WOOD, stroke_width="2.4")
               + p("M42 11 L58 14 L54 20 L58 26 L39 23 Z", VERM) + p("M22 11 L6 14 L10 20 L6 26 L25 23 Z", LAPIS)
               + c(44, 7, 1.8, GOLD) + c(20, 7, 1.8, GOLD)
               + p("M46 15.5 L49 18.5 L46 21.5 L43 18.5 Z", GOLD) + p("M18 15.5 L21 18.5 L18 21.5 L15 18.5 Z", GOLD)),
    # Rencontre de bataille (adversaire) : épées croisées
    "encounter": sword(40) + sword(-40),
    # Rencontre de bataille (occasion de Gloire) : couronne de laurier et étoile
    "opportunity": (p("M32 54 Q14 50 13 30 Q14 20 20 13", "none", stroke=GREEN, stroke_width="2")
                    + p("M32 54 Q50 50 51 30 Q50 20 44 13", "none", stroke=GREEN, stroke_width="2")
                    + "".join(p(f"M{x} {y} q{dx} {dy} {ex} {ey} q{-dx/2} {-dy/2} {-ex} {-ey} Z", GREEN, stroke_width="0.8")
                              for (x, y, dx, dy, ex, ey) in [(16, 42, -6, -1, -5, -5), (14, 32, -6, 1, -5, -5), (16, 22, -5, 2, -3, -6),
                                                             (48, 42, 6, -1, 5, -5), (50, 32, 6, 1, 5, -5), (48, 22, 5, 2, 3, -6)])
                    + p("M32 18 L35 27 L44.5 27 L37 32.5 L40 41.5 L32 36 L24 41.5 L27 32.5 L19.5 27 L29 27 Z", GOLD)),
}


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, body in ICONS.items():
        with open(os.path.join(OUT, f"{name}.svg"), "w", encoding="utf-8") as f:
            f.write(svg(body))
    print(f"{len(ICONS)} icônes dans {os.path.normpath(OUT)}")


if __name__ == "__main__":
    main()
