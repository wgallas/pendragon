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


def niche(bg, dots=GOLD):
    """Niche gothique au fond coloré semé de points d'or, comme dans les miniatures."""
    arch = "M13 58 L13 27 Q14 13 32 6.5 Q50 13 51 27 L51 58 Z"
    pts = "".join(c(x, y, 0.55, dots, stroke="none") for y in range(12, 58, 6) for x in range(16 + (y // 6 % 2) * 3, 50, 6))
    return (f'<clipPath id="n"><path d="{arch}"/></clipPath>' + p(arch, bg)
            + f'<g clip-path="url(#n)">{pts}</g>' + p(arch, "none", stroke=GOLD, stroke_width="1.6")
            + p("M10 58 L54 58", "none", stroke=INK, stroke_width="1.6"))


MAIL = ('<defs><pattern id="m" width="2.4" height="2.4" patternUnits="userSpaceOnUse">'
        '<circle cx="1.2" cy="1.2" r="0.85" fill="none" stroke="#6f6c66" stroke-width="0.45"/></pattern></defs>')
BODY = "M27 23 Q32 21 37 23 L40 34 L42 46 L33 46 L32 42 L31 46 L22 46 L24 34 Z"
ARM = "M37 23 L41.6 32.6 L39.6 34.6 L36 28 Z"
SHIELD = "M15.8 26.6 Q21 24.6 26.2 26.6 L26.2 36 Q25.2 44.5 21 49.4 Q16.8 44.5 15.8 36 Z"


def face(cx=32, cy=16, r=4.3):
    return c(cx, cy, r, SKIN) + c(cx - 1.5, cy - 0.3, 0.45, INK, stroke="none") + c(cx + 1.5, cy - 0.3, 0.45, INK, stroke="none")


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
    # Personnage : chevalier en haubert de mailles, heaume à nasal, écu et épée, dans une niche bleue
    "character": (niche(LAPIS) + MAIL
                  + p("M26.5 46 L26.5 56 L30.5 56 L30.5 46 M33.5 46 L33.5 56 L37.5 56 L37.5 46", STEEL)
                  + p("M26.5 46 L26.5 56 L30.5 56 L30.5 46 M33.5 46 L33.5 56 L37.5 56 L37.5 46", "url(#m)", stroke="none")
                  + p("M25.5 56 L31 56 M33 56 L38.5 56", "none", stroke_width="1.6")
                  + p("M39 35 L44 51 L42.4 51.6 L37.6 35.6 Z", WOOD) + c(43.4, 51.6, 0.9, GOLD)
                  + p(BODY, STEEL) + p(BODY, "url(#m)", stroke="none") + p(BODY, "none")
                  + r(24.3, 33, 15.4, 1.9, WOOD)
                  + p(ARM, STEEL) + p(ARM, "url(#m)", stroke="none") + p(ARM, "none")
                  + line(36.6, 34.6, 40.8, 33.2, stroke=GOLD, stroke_width="1.6") + c(40.2, 34.4, 1.6, SKIN)
                  + c(32, 16.6, 6, STEEL) + c(32, 16.6, 6, "url(#m)", stroke="none") + c(32, 16.6, 6, "none")
                  + c(32, 18, 3.9, SKIN) + c(30.3, 17.6, 0.5, INK, stroke="none") + c(33.7, 17.6, 0.5, INK, stroke="none")
                  + p("M30.6 20.4 Q32 21.2 33.4 20.4", "none", stroke_width="0.6")
                  + p("M25.8 14 Q26.2 6.8 32 5.4 Q37.8 6.8 38.2 14 Z", STEEL) + r(25.6, 13, 12.8, 1.4, GOLD, 0.4)
                  + r(31.4, 14.2, 1.2, 4.2, STEEL, 0.5)
                  + p(SHIELD, VERM) + p("M21 25.6 L21 48.6 M16.3 31 L25.7 31", "none", stroke=GOLD, stroke_width="1.3") + c(21, 31, 1.3, GOLD)),
    # Écuyer : cotte courte et chausses, lance à fanion, dans une niche vermeille
    "squire": (niche(VERM)
               + line(42, 8, 42, 57, stroke=WOOD, stroke_width="1.8") + p("M42 8.5 L50 11 L42 14 Z", GOLD)
               + p("M27 22 Q32 20 37 22 L39 34 L41 44 L23 44 L25 34 Z", LAPIS)
               + p("M29 22 L32 44 L35 22", "none", stroke=GOLD, stroke_width="0.9")
               + r(25, 33, 14, 2, WOOD)
               + p("M27.5 44 L27 56 L30.5 56 L31 44 M33 44 L33.5 56 L37 56 L36.5 44", GREY)
               + p("M26 56 L31 56 M33 56 L38 56", "none", stroke_width="1.6")
               + p("M37 23 L41.5 31 L40.5 33 L36 27", LAPIS) + c(41.5, 31.5, 1.5, SKIN)
               + face(32, 16.5)
               + p("M27.6 16 Q27 10.5 32 10.5 Q37 10.5 36.4 16 Q35 13.5 32 13.5 Q29 13.5 27.6 16 Z", WOOD)),
    # Suivant : homme du commun au capuchon à longue cornette, bâton de marche, dans une niche verte
    "follower": (niche(GREEN)
                 + line(22, 15, 20, 57, stroke=WOOD, stroke_width="1.8")
                 + p("M27 23 Q32 21 37 23 L39 34 L41 46 L23 46 L25 34 Z", WOOD)
                 + r(25, 33, 14, 1.8, INK)
                 + p("M27.5 46 L27.5 56 L30.5 56 L30.5 46 M33.5 46 L33.5 56 L36.5 56 L36.5 46", CLOTH)
                 + p("M26 56 L31 56 M33 56 L38 56", "none", stroke_width="1.6")
                 + p("M27 24 L21.5 31 L23 33 L27.5 28", WOOD) + c(21.8, 31.5, 1.5, SKIN)
                 + p("M26 21 Q25 9.5 32 9 Q39 9.5 38 21 L42 31 l-2 -1.6 l-2 1.6 l-2 -1.6 l-2 1.6 l-2 -1.6 l-2 1.6 l-2 -1.6 l-2 1.6 l-2 -1.6 l-2 1.6 Z", "#c8a24a")
                 + face(32, 17)),
    # Créature : tête de loup
    "creature": (p("M15 12 L25 22 L39 22 L49 12 L48 30 Q48 40 40 47 L36 56 L28 56 L24 47 Q16 40 16 30 Z", GREY)
                 + p("M19 17 L24 23 L20 25 Z", WOOD) + p("M45 17 L40 23 L44 25 Z", WOOD)
                 + p("M24 34 L29 31 L29 35 Z", GOLD) + p("M40 34 L35 31 L35 35 Z", GOLD)
                 + p("M28 44 Q32 41 36 44 L35 49 L29 49 Z", INK)
                 + p("M29 52 L30 55 M35 52 L34 55", "none", stroke=PARCH)),
    # Cheval : destrier caparaçonné, tête de profil avec chanfrein et plumet
    "horse": (p("M33 13 L33.5 5.5 L38 12 Q49 18 53 30 L56 58 L28 58 Q31 51 28 45 L20 46 Q15 49 11 46.5 Q8 43.5 10 39.5 L20 25 Q25 17 33 13 Z", WOOD)
              # caparaçon : bleu semé d'or, bord dentelé
              + p("M39 13.5 Q49 19 53 30 L56 58 L29 58 Q31 52 29 46 L32.5 44 L31 40 L34.5 38 L33 34 L36.5 32 L35 28 L38.5 26 L37 22 L40.5 20 L39 16.5 Z", LAPIS)
              + "".join(p(f"M{x} {y} l1.3 1.3 l-1.3 1.3 l-1.3 -1.3 Z", GOLD, stroke="none") for x, y in [(46, 24), (49, 33), (42, 37), (51, 43), (45, 47), (38, 51), (52, 53), (43, 30)])
              # chanfrein d'acier, œillère et arête
              + p("M32.5 13.6 L38 15.8 L19.5 41.5 L14.5 38.6 Z", STEEL) + p("M35 15 L17 40", "none", stroke_width="0.7")
              + c(27.5, 24.5, 2.4, STEEL) + c(27.5, 24.5, 1, INK, stroke="none")
              + p("M34.5 13 Q33 8 37 5.5 Q37.5 9 40.5 10.5 Q37.5 11 36.5 13.8 Z", VERM)
              # bride et rênes
              + p("M23 31 L26 43 M15 43 L29 41", "none", stroke=VERM, stroke_width="1.6")
              + c(12.5, 43.5, 0.9, INK, stroke="none")),
    # --- Objets ---
    # Bataille : deux étendards croisés, attachés à leur hampe
    "battle": (line(17, 59, 44, 8, stroke=WOOD, stroke_width="2.4") + line(47, 59, 20, 8, stroke=WOOD, stroke_width="2.4")
               + p("M42.4 11 L57 14 L53 19 L56.5 24.5 L36.5 22.1 Z", VERM) + p("M21.6 11 L7 14 L11 19 L7.5 24.5 L27.5 22.1 Z", LAPIS)
               + line(43.4, 9.1, 35.8, 23.5, stroke=WOOD, stroke_width="2.4") + line(20.6, 9.1, 28.2, 23.5, stroke=WOOD, stroke_width="2.4")
               + c(44, 7, 1.8, GOLD) + c(20, 7, 1.8, GOLD)
               + p("M48 14.6 L51 17.6 L48 20.6 L45 17.6 Z", GOLD) + p("M16 14.6 L19 17.6 L16 20.6 L13 17.6 Z", GOLD)),
    # Rencontre de bataille (adversaire) : épées croisées
    "encounter": sword(40) + sword(-40),
    # Rencontre de bataille (occasion de Gloire) : couronne de laurier et étoile
    "opportunity": (p("M32 54 Q14 50 13 30 Q14 20 20 13", "none", stroke=GREEN, stroke_width="2")
                    + p("M32 54 Q50 50 51 30 Q50 20 44 13", "none", stroke=GREEN, stroke_width="2")
                    + "".join(p(f"M{x} {y} q{dx} {dy} {ex} {ey} q{-dx/2} {-dy/2} {-ex} {-ey} Z", GREEN, stroke_width="0.8")
                              for (x, y, dx, dy, ex, ey) in [(16, 42, -6, -1, -5, -5), (14, 32, -6, 1, -5, -5), (16, 22, -5, 2, -3, -6),
                                                             (48, 42, 6, -1, 5, -5), (50, 32, 6, 1, 5, -5), (48, 22, 5, 2, 3, -6)])
                    + p("M32 18 L35 27 L44.5 27 L37 32.5 L40 41.5 L32 36 L24 41.5 L27 32.5 L19.5 27 L29 27 Z", GOLD)),
    # Domaine : château à deux tours et donjon, porte à herse, bannière
    "castle": (p("M6 58 Q32 50 58 58 Z", "#8a9a5b")
               + r(23, 14, 18, 40, "#d9cba8") + p("M23 14 L23 10 L26 10 L26 14 M29 14 L29 10 L32 10 L32 14 M35 14 L35 10 L38 10 L38 14 M41 14 L41 10", "#d9cba8")
               + p("M23 10 L26 10 L26 14 L29 14 L29 10 L32 10 L32 14 L35 14 L35 10 L38 10 L38 14 L41 14 L41 10 L41 14", "none")
               + r(9, 24, 12, 32, "#e3d3ad") + r(43, 24, 12, 32, "#e3d3ad")
               + p("M9 24 L9 20 L12 20 L12 24 L15 24 L15 20 L18 20 L18 24 L21 24 L21 20", "none") + r(9, 20, 3, 4, "#e3d3ad") + r(15, 20, 3, 4, "#e3d3ad") + r(18, 20, 3, 4, "#e3d3ad")
               + r(43, 20, 3, 4, "#e3d3ad") + r(49, 20, 3, 4, "#e3d3ad") + r(52, 20, 3, 4, "#e3d3ad")
               + r(21, 34, 22, 22, "#e3d3ad") + p("M21 34 L21 31 L24 31 L24 34 M27 34 L27 31 L30 31 L30 34 M34 34 L34 31 L37 31 L37 34 M40 34 L40 31 L43 31 L43 34", "#e3d3ad")
               + p("M27 56 L27 46 Q32 40 37 46 L37 56 Z", INK)
               + p("M28.5 56 L28.5 45.5 M31 56 L31 43.5 M33.5 56 L33.5 43.5 M36 56 L36 45.5 M27.5 49 L36.5 49 M27.5 52.5 L36.5 52.5", "none", stroke=GOLD, stroke_width="0.7")
               + r(31, 18, 2.4, 5, INK, 1) + r(14, 30, 2, 4, INK, 1) + r(48, 30, 2, 4, INK, 1)
               + line(32, 10, 32, 3) + p("M32 3 L40 5 L32 7.5 Z", VERM)
               + p("M9 56 L55 56", "none", stroke_width="0.8")),
}

# Le domaine (objet « domaine ») garde son chemin d'icône d'équipement.
EXTRA = {"castle": os.path.join(os.path.dirname(__file__), "..", "..", "icons", "gear", "domain.svg")}


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, body in ICONS.items():
        with open(EXTRA.get(name, os.path.join(OUT, f"{name}.svg")), "w", encoding="utf-8") as f:
            f.write(svg(body))
    print(f"{len(ICONS)} icônes dans {os.path.normpath(OUT)}")


if __name__ == "__main__":
    main()
