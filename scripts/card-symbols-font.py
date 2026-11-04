#!/usr/bin/env python3
"""Build assets/fonts/CardSymbols.ttf and src/components/cardSymbolGlyphs.ts.

why: card text draws mana, FaB and Riftbound symbols as glyphs from this font so
iOS, Android and web place them by font metrics, the way they place letters.
Inline views drifted per platform and per line. Each color of a symbol is its own
zero-advance glyph, so stacked spans in different colors overlap, and the
`advance` glyph then moves the pen past the symbol.

Run it after changing a shape:
    python3 -m venv /tmp/card-symbols && /tmp/card-symbols/bin/pip install fonttools skia-pathops
    /tmp/card-symbols/bin/python scripts/card-symbols-font.py
"""

import pathlib
import subprocess

import pathops
from fontTools.fontBuilder import FontBuilder
from fontTools.misc.timeTools import timestampFromString
from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.svgLib.path import parse_path
from fontTools.ttLib import TTFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
FONT_OUT = ROOT / "assets/fonts/CardSymbols.ttf"
TS_OUT = ROOT / "src/components/cardSymbolGlyphs.ts"
RUBIK = ROOT / "assets/fonts"

# Shapes are drawn in a 24-unit box (y down), then placed in 1000-unit em space (y up).
# The coin is 0.9em wide, centered on Rubik's cap height, with 0.06em on each side.
BOX_SCALE = 900 / 24
SIDE = 60
CAP_CENTER = 350
ADVANCE = 900 + 2 * SIDE

# why: ISC requires its notice to travel with these copied paths; see CardSymbols-LICENSES.txt. Paths use Lucide's 24-unit box.
LUCIDE = {
    "sword": [
        "m11 19-6-6",
        "m5 21-2-2",
        "m8 16-4 4",
        "M9.5 17.5 20.414 6.586A2 2 0 0021 5.172V3h-2.172a2 2 0 00-1.414.586L6.5 14.5",
    ],
    "shield": [
        "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",
    ],
    "heart": [
        "M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5",
    ],
    "hexagon": [
        "M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z",
    ],
    "wind": [
        "M12.8 19.6A2 2 0 1 0 14 16H2",
        "M17.5 8a2.5 2.5 0 1 1 2 4H2",
        "M9.8 4.4A2 2 0 1 1 11 8H2",
    ],
    "brain": [
        "M12 18V5",
        "M15 13a4.17 4.17 0 01-3-4 4.17 4.17 0 01-3 4",
        "M17.707 6.294A3 3 0 1012 5a3 3 0 10-5.707 1.294",
        "M17.996 5.125a4 4 0 012.526 5.77",
        "M18 18a4 4 0 002-7.465",
        "M19.967 17.482a4 4 0 11-7.967.517 4 4 0 11-7.967-.517",
        "M6 18a4 4 0 01-2-7.465",
        "M6.004 5.125a4 4 0 00-2.526 5.77",
    ],
    "redo": ["M21 7v6h-6", "M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7"],
    "undo": ["M3 7v6h6", "M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"],
    "sun": [
        "M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
        "M12 2v2",
        "M12 20v2",
        "m4.93 4.93 1.41 1.41",
        "m17.66 17.66 1.41 1.41",
        "M2 12h2",
        "M20 12h2",
        "m6.34 17.66-1.41 1.41",
        "m19.07 4.93-1.41 1.41",
    ],
    "diamond": [
        "M2.7 10.3a2.41 2.41 0 0 0 0 3.41l7.59 7.59a2.41 2.41 0 0 0 3.41 0l7.59-7.59a2.41 2.41 0 0 0 0-3.41l-7.59-7.59a2.41 2.41 0 0 0-3.41 0Z",
    ],
    "waves": [
        "M2 12q2.5 2 5 0t5 0 5 0 5 0",
        "M2 19q2.5 2 5 0t5 0 5 0 5 0",
        "M2 5q2.5 2 5 0t5 0 5 0 5 0",
    ],
    "flame": [
        "M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4",
    ],
    "leaf": [
        "M11 20a10 10 0 0010-10 25.9 25.9 0 00-1.04-7.281 1 1 0 00-1.755-.325C15.833 5.5 13 5.5 9.8 6.1A7 7 0 0011 20",
        "M2 21a5 5 0 012.911-4.544C7.613 15.212 8.351 15.24 11 13",
    ],
    "zap": [
        "M15.914 4a1.5 1.5 0 00-2.474-1.561l-9 9A1.5 1.5 0 005.5 14h4.002a.5.5 0 01.471.666L8.086 20a1.5 1.5 0 002.475 1.56l9-9A1.5 1.5 0 0018.5 10h-3.997a.5.5 0 01-.472-.667z",
    ],
    "snowflake": [
        "m10 20-1.25-2.5L6 18",
        "M10 4 8.75 6.5 6 6",
        "m14 20 1.25-2.5L18 18",
        "m14 4 1.25 2.5L18 6",
        "m17 21-3-6h-4",
        "m17 3-3 6 1.5 3",
        "M2 12h6.5L10 9",
        "m20 10-1.5 2 1.5 2",
        "M22 12h-6.5L14 15",
        "m4 10 1.5 2L4 14",
        "m7 21 3-6-1.5-3",
        "m7 3 3 6h4",
    ],
}

# why: MIT requires its notice to travel with this copied path; see CardSymbols-LICENSES.txt. The path uses Phosphor's 256-unit box.
PHOSPHOR_SKULL = "M128,16C70.65,16,24,60.86,24,116c0,34.1,18.27,66,48,84.28V216a16,16,0,0,0,16,16h8a4,4,0,0,0,4-4V200.27a8.17,8.17,0,0,1,7.47-8.25,8,8,0,0,1,8.53,8v28a4,4,0,0,0,4,4h16a4,4,0,0,0,4-4V200.27a8.17,8.17,0,0,1,7.47-8.25,8,8,0,0,1,8.53,8v28a4,4,0,0,0,4,4h8a16,16,0,0,0,16-16V200.28C213.73,182,232,150.1,232,116,232,60.86,185.35,16,128,16ZM92,152a20,20,0,1,1,20-20A20,20,0,0,1,92,152Zm72,0a20,20,0,1,1,20-20A20,20,0,0,1,164,152Z"

COIN_ICONS = ["sun", "waves", "skull", "flame", "leaf", "diamond", "redo", "undo", "zap", "snowflake", "brain", "shield"]
# why: 100 and 1000000 are printed on Un-cards (Mox Lotus, Gleemax); other numbers above 20 never are.
COIN_TEXTS = [str(n) for n in range(21)] + ["100", "1000000", "X", "Y", "Z"]
LINE_ICONS = ["sword", "shield", "heart", "wind", "brain", "redo", "undo"]
# why: appended after the original glyphs so their code points stay put.
LATER_LINE_ICONS = ["hexagon", "diamond"]


def affine(scale, dx, dy):
    """Box transform: x' = scale*x + dx, y' = scale*y + dy, then into em space."""
    return (BOX_SCALE * scale, 0, 0, -BOX_SCALE * scale, SIDE + BOX_SCALE * dx, CAP_CENTER + BOX_SCALE * (12 - dy))


def around(scale, cx=12, cy=12):
    """Scale about a box point, matching SVG translate(c) scale(s) translate(-c)."""
    return affine(scale, cx * (1 - scale), cy * (1 - scale))


def svg_path(d, transform):
    path = pathops.Path()
    parse_path(d, TransformPen(path.getPen(), transform))
    return path


def stroked(paths, transform, width):
    """Lucide draws round-capped strokes; fonts need the filled outline of that stroke."""
    out = pathops.Path()
    for d in paths:
        path = svg_path(d, transform)
        path.stroke(width * transform[0], pathops.LineCap.ROUND_CAP, pathops.LineJoin.ROUND_JOIN, 4)
        path.convertConicsToQuads()
        out.addPath(path)
    return out


def circle(cx, cy, r, transform=affine(1, 0, 0)):
    k = 0.5522847498 * r
    d = (
        f"M{cx + r} {cy}C{cx + r} {cy + k} {cx + k} {cy + r} {cx} {cy + r}"
        f"C{cx - k} {cy + r} {cx - r} {cy + k} {cx - r} {cy}"
        f"C{cx - r} {cy - k} {cx - k} {cy - r} {cx} {cy - r}"
        f"C{cx + k} {cy - r} {cx + r} {cy - k} {cx + r} {cy}Z"
    )
    return svg_path(d, transform)


def union(*paths):
    out = pathops.Path()
    for path in paths:
        out.addPath(path)
    return pathops.simplify(out, clockwise=True)


def op(a, b, kind):
    return pathops.op(a, b, kind, clockwise=True)


def rubik_text(text, weight, font_size, x, baseline):
    """Rubik outlines for text centered at box x, as the old SvgText drew them."""
    font = TTFont(RUBIK / f"Rubik-{weight}.ttf")
    glyphs, cmap, hmtx = font.getGlyphSet(), font.getBestCmap(), font["hmtx"]
    k = font_size / font["head"].unitsPerEm
    names = [cmap[ord(char)] for char in text]
    pen_x = x - sum(hmtx[name][0] for name in names) * k / 2
    out = pathops.Path()
    for name in names:
        glyphs[name].draw(TransformPen(out.getPen(), compose(affine(1, 0, 0), (k, 0, 0, -k, pen_x, baseline))))
        pen_x += hmtx[name][0] * k
    return out


def compose(outer, inner):
    a, b, c, d, e, f = inner
    A, B, C, D, E, F = outer
    return (A * a + C * b, B * a + D * b, A * c + C * d, B * c + D * d, A * e + C * f + E, B * e + D * f + F)


def optical_nudge(text):
    """why: Rubik draws "1" with its flag on the left, so centering the advance width leaves the ink off-center."""
    if text == "1":
        return 0.36
    return 0.22 if text.startswith("1") else 0


def coin_icon(name):
    if name == "skull":
        return union(svg_path(PHOSPHOR_SKULL, compose(around(0.62), (0.09375, 0, 0, 0.09375, 0, 0))))
    return union(stroked(LUCIDE[name], around(0.62), 2.6))


def coin_text(text):
    """Digits at 14 units, shrunk to fit 18 units wide, with their cap height centered in the coin."""
    font = TTFont(RUBIK / "Rubik-SemiBold.ttf")
    cmap, hmtx = font.getBestCmap(), font["hmtx"]
    width = sum(hmtx[cmap[ord(char)]][0] for char in text) * 14 / font["head"].unitsPerEm
    size = 14 * min(1, 18 / width)
    half_cap = font["OS/2"].sCapHeight / font["head"].unitsPerEm * size / 2
    return union(rubik_text(text, "SemiBold", size, 12 + optical_nudge(text), 12 + half_cap))


UPPER = svg_path("M0 0H24L0 24Z", affine(1, 0, 0))
LOWER = svg_path("M24 0V24H0Z", affine(1, 0, 0))


def build_shapes():
    """Every glyph shape, keyed by the name the app uses for it."""
    disc = union(circle(12, 12, 12))
    shapes = {
        "disc": disc,
        "ring": op(disc, circle(12, 12, 10.5), pathops.PathOp.DIFFERENCE),
        "discUpper": op(disc, UPPER, pathops.PathOp.INTERSECTION),
        "discLower": op(disc, LOWER, pathops.PathOp.INTERSECTION),
        "phyrexianDot": union(circle(19, 19, 5)),
        "phyrexianHeart": union(stroked(LUCIDE["heart"], compose(affine(1, 19, 19.3), (0.3, 0, 0, 0.3, -3.6, -3.6)), 4)),
    }
    faces = {name: coin_icon(name) for name in COIN_ICONS} | {text: coin_text(text) for text in COIN_TEXTS}
    for key, face in faces.items():
        shapes[f"face:{key}"] = face
        shapes[f"face:{key}:upper"] = op(face, UPPER, pathops.PathOp.INTERSECTION)
        shapes[f"face:{key}:lower"] = op(face, LOWER, pathops.PathOp.INTERSECTION)
    for name in LINE_ICONS:
        shapes[f"line:{name}"] = union(stroked(LUCIDE[name], affine(1, 0, 0), 2))
    hexagon = stroked(LUCIDE["hexagon"], affine(1, 0, 0), 2)
    for letter in ["R", "X"]:
        shapes[f"line:hexagon{letter}"] = union(hexagon, rubik_text(letter, "Bold", 10, 12, 15.6))
    for name in LATER_LINE_ICONS:
        shapes[f"line:{name}"] = union(stroked(LUCIDE[name], affine(1, 0, 0), 2))
    ring = op(circle(12, 12, 10), circle(12, 12, 8), pathops.PathOp.DIFFERENCE)
    shapes["line:inkwell"] = union(ring, circle(12, 12, 3.5))
    return shapes


def tt_glyph(path):
    pen = TTGlyphPen(None)
    path.draw(Cu2QuPen(pen, max_err=1, reverse_direction=False))
    return pen.glyph()


def build_font(shapes):
    names = list(shapes)
    glyph_names = {name: f"g{index}" for index, name in enumerate(names)}
    chars = {name: 0xE001 + index for index, name in enumerate(names)}
    order = [".notdef", "advance", *glyph_names.values()]

    empty = TTGlyphPen(None).glyph()
    glyphs = {".notdef": empty, "advance": TTGlyphPen(None).glyph()}
    glyphs |= {glyph_names[name]: tt_glyph(shape) for name, shape in shapes.items()}

    rubik = TTFont(RUBIK / "Rubik-Regular.ttf")
    hhea, os2 = rubik["hhea"], rubik["OS/2"]

    fb = FontBuilder(1000, isTTF=True)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap({0xE000: "advance"} | {chars[name]: glyph_names[name] for name in names})
    fb.setupGlyf(glyphs)
    glyf = fb.font["glyf"]
    metrics = {".notdef": (ADVANCE, 0), "advance": (ADVANCE, 0)}
    for name in names:
        glyph = glyf[glyph_names[name]]
        glyph.recalcBounds(glyf)
        metrics[glyph_names[name]] = (0, getattr(glyph, "xMin", 0))
    fb.setupHorizontalMetrics(metrics)
    # why: matching Rubik's vertical metrics keeps line height and baseline identical when a run switches fonts.
    fb.setupHorizontalHeader(ascent=hhea.ascent, descent=hhea.descent, lineGap=hhea.lineGap)
    fb.setupNameTable(
        {
            "copyright": "Copyright 2026 Scryve. Includes outlines from Rubik (Copyright 2015 The Rubik Project Authors), Lucide and Phosphor.",
            "familyName": "CardSymbols",
            "styleName": "Regular",
            "uniqueFontIdentifier": "CardSymbols-Regular-1.0",
            "fullName": "CardSymbols",
            "psName": "CardSymbols",
            "version": "Version 1.0",
            "licenseDescription": "This Font Software is licensed under the SIL Open Font License, Version 1.1.",
            "licenseInfoURL": "https://openfontlicense.org",
        }
    )
    fb.setupOS2(
        version=4,
        sTypoAscender=os2.sTypoAscender,
        sTypoDescender=os2.sTypoDescender,
        sTypoLineGap=os2.sTypoLineGap,
        usWinAscent=os2.usWinAscent,
        usWinDescent=os2.usWinDescent,
        sCapHeight=os2.sCapHeight,
        sxHeight=os2.sxHeight,
        fsSelection=os2.fsSelection,
        achVendID="SCRY",
    )
    fb.setupPost()
    # why: a fixed timestamp keeps the font byte-identical when nothing changed.
    stamp = timestampFromString("Wed Nov 04 00:00:00 2026")
    fb.updateHead(created=stamp, modified=stamp)
    fb.font.recalcTimestamp = False
    fb.save(FONT_OUT)
    return chars


def ts_string(code):
    return f'"\\u{code:04X}"'


def write_ts(chars):
    def entry(key, name):
        return f"  {key}: {ts_string(chars[name])},"

    def faces(keys):
        lines = []
        for key in keys:
            quoted = f'"{key}"' if key.isdigit() else key
            lines.append(
                f"  {quoted}: {{ whole: {ts_string(chars[f'face:{key}'])}, upper: {ts_string(chars[f'face:{key}:upper'])}, lower: {ts_string(chars[f'face:{key}:lower'])} }},"
            )
        return lines

    layers = ["disc", "ring", "discUpper", "discLower", "phyrexianDot", "phyrexianHeart"]
    lines = [
        "// why: generated with assets/fonts/CardSymbols.ttf by scripts/card-symbols-font.py, so hand edits drift from the font.",
        "",
        'export const CARD_SYMBOL_FONT = "CardSymbols"',
        "",
        "/** why: every other glyph has no advance so a symbol's layers stack; this one moves the pen past them. */",
        f"export const SYMBOL_ADVANCE = {ts_string(0xE000)}",
        "",
        "export const SYMBOL_LAYERS = {",
        *[entry(name, name) for name in layers],
        "} as const",
        "",
        "export const COIN_FACES = {",
        *faces(COIN_ICONS + COIN_TEXTS),
        "} as const",
        "",
        "export const LINE_SYMBOLS = {",
        *[
            entry(name, f"line:{name}")
            for name in [*LINE_ICONS, "hexagonR", "hexagonX", *LATER_LINE_ICONS, "inkwell"]
        ],
        "} as const",
        "",
    ]
    TS_OUT.write_text("\n".join(lines))
    subprocess.run(["pnpm", "exec", "prettier", "--write", str(TS_OUT)], cwd=ROOT, check=True, capture_output=True)


if __name__ == "__main__":
    write_ts(build_font(build_shapes()))
    print(f"wrote {FONT_OUT.relative_to(ROOT)} and {TS_OUT.relative_to(ROOT)}")
