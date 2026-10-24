/** why: EAS builds have no Inkscape, so this draws the variants in APP_ICON_VARIANTS on the board and button from app-icon-source.svg and the PNGs it writes are committed. */
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import {
  APP_ICON_VARIANTS,
  appIconAssets,
  type AppIconSpec,
  type Paint,
} from "../src/features/appIcon/appIconVariants"

const PENTAGON =
  "M241.44 174.58 Q256.00 164.00 270.56 174.58 L328.93 216.99 Q343.50 227.57 337.93 244.69 L315.64 313.31 Q310.08 330.43 292.08 330.43 L219.92 330.43 Q201.92 330.43 196.36 313.31 L174.07 244.69 Q168.50 227.57 183.07 216.99Z"
// why: the board centers a 7-unit border on its 100-unit pentagon, so at this 2x scale the face shrinks to radius 85 and the border reaches 7 past PENTAGON.
const FACE =
  "M242.89 180.52 Q256.00 171.00 269.11 180.52 L323.73 220.21 Q336.84 229.73 331.83 245.14 L310.97 309.36 Q305.96 324.77 289.76 324.77 L222.24 324.77 Q206.04 324.77 201.03 309.36 L180.17 245.14 Q175.16 229.73 188.27 220.21Z"
// why: seat order follows the in-game portrait board. The button must sit where seat corners meet, which five and six seats break.
const LAYOUTS: Record<number, readonly (readonly [number, number, number, number])[]> = {
  2: [
    [54, 54, 404, 197],
    [54, 261, 404, 197],
  ],
  3: [
    [54, 54, 404, 197],
    [54, 261, 197, 197],
    [261, 261, 197, 197],
  ],
  4: [
    [54, 54, 197, 197],
    [261, 54, 197, 197],
    [54, 261, 197, 197],
    [261, 261, 197, 197],
  ],
}
// why: white bands keep each seat's color under the shimmer; a tinted foil gradient washed the colors out.
const SHEEN_STOPS = [
  [0, 0],
  [0.28, 0.38],
  [0.42, 0],
  [0.62, 0.22],
  [0.74, 0],
  [1, 0.18],
] as const

// why: each icon collects its own gradients, patterns, and clips while drawing, so specs only name colors.
function defsFor(boardRadius: number) {
  const defs = new Map<string, string>()
  const add = (id: string, markup: string) => {
    if (!defs.has(id)) defs.set(id, markup)
    return `url(#${id})`
  }
  return {
    markup: () => [...defs.values()].join("\n    "),
    paint: (value: Paint) =>
      typeof value === "string"
        ? value
        : add(
            `paint-${value.join("-").replaceAll("#", "")}`,
            `<linearGradient id="paint-${value.join("-").replaceAll("#", "")}" x1="54" y1="54" x2="458" y2="458" gradientUnits="userSpaceOnUse">${value
              .map(
                (color, index) =>
                  `<stop offset="${index / (value.length - 1)}" stop-color="${color}"/>`,
              )
              .join("")}</linearGradient>`,
          ),
    // why: a ring cut at an inset follows the board corner shrunk by that inset, so on Android's rounder board every ring stays parallel to the outer one.
    clip: (inset: number) =>
      add(
        `board-${inset}`,
        `<clipPath id="board-${inset}"><rect x="${54 + inset}" y="${54 + inset}" width="${404 - 2 * inset}" height="${404 - 2 * inset}" rx="${boardRadius - inset}"/></clipPath>`,
      ),
    button: () => add("button", `<clipPath id="button"><path d="${FACE}"/></clipPath>`),
    stripes: (index: number, color: string, y: number) =>
      add(
        `stripes-${index}-${color.replace("#", "")}`,
        `<pattern id="stripes-${index}-${color.replace("#", "")}" y="${y}" width="512" height="26" patternUnits="userSpaceOnUse"><rect width="512" height="13" fill="${color}"/></pattern>`,
      ),
    glow: () =>
      add(
        "glow",
        `<filter id="glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="9"/></filter>`,
      ),
    grayscale: () =>
      add(
        "grayscale",
        `<filter id="grayscale"><feColorMatrix type="saturate" values="0"/></filter>`,
      ),
    mask: (id: string, content: string) =>
      add(
        id,
        `<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512"><rect width="512" height="512" fill="#000000"/>${content}</mask>`,
      ),
    grid: () =>
      add(
        "grid",
        `<pattern id="grid" x="54" y="54" width="21" height="21" patternUnits="userSpaceOnUse"><path d="M21 0H0V21" fill="none" stroke="#FFFFFF" stroke-opacity="0.13" stroke-width="2"/></pattern>`,
      ),
  }
}

type Defs = ReturnType<typeof defsFor>
type IconArt = Omit<AppIconSpec, "tier">
type Look = keyof ReturnType<typeof appIconAssets>

// why: white wherever the icon paints anything but its own background, so masking with it turns the painted-over holes and button gap into real transparency. A monochrome layer is one flat shape, so it also cuts the menu lines out of a filled button and drops soft effects.
function silhouette(variant: IconArt, monochrome: boolean): IconArt {
  const filledButton = (variant.button ?? "#36333D") !== variant.background
  return {
    ...variant,
    background: "#000000",
    tiles: variant.tiles.map(() => "#FFFFFF"),
    innerRing: variant.innerRing ? "#FFFFFF" : undefined,
    button: filledButton ? "#FFFFFF" : "#000000",
    buttonRing: variant.buttonRing ? "#FFFFFF" : undefined,
    lines: monochrome && filledButton ? "#000000" : "#FFFFFF",
    sheen: false,
    glow: variant.glow && !monochrome,
    grid: variant.grid && !monochrome,
  }
}

// why: tinted icons are colored by brightness alone, so seats go full bright to stay readable against the darker button.
function tintable(variant: IconArt): IconArt {
  return {
    ...variant,
    tiles: variant.tiles.map(() => "#FFFFFF"),
    innerRing: variant.innerRing ? "#8A8A8E" : undefined,
    buttonRing: variant.buttonRing ? "#FFFFFF" : undefined,
    sheen: false,
  }
}

// why: an icon drawn for a light background, like Pencil, loses its dark lines on the tinted icon's dark background, so it borrows its dark sibling's art there.
function onDarkBackground(variant: IconArt): IconArt {
  if (!variant.darkTwin) return variant
  const twin = APP_ICON_VARIANTS.find(({ name }) => name === variant.darkTwin)
  if (!twin) throw new Error(`${variant.name}: no icon named ${variant.darkTwin}`)
  return twin
}

function tiles(variant: IconArt, defs: Defs) {
  const layout = LAYOUTS[variant.tiles.length]
  if (!layout) throw new Error(`${variant.name}: no board layout for ${variant.tiles.length} tiles`)
  return layout.flatMap(([x, y, width, height], index) => {
    const radius = Math.min(54, Math.round(height * 0.36))
    const box = (inset: number, fill: string) =>
      `<rect x="${x + inset}" y="${y + inset}" width="${width - 2 * inset}" height="${height - 2 * inset}" rx="${radius - inset}" fill="${fill}"${inset ? ` clip-path="${defs.clip(inset)}"` : ""}/>`
    const tile = variant.tiles[index]
    const color =
      variant.stripes && typeof tile === "string" ? defs.stripes(index, tile, y) : defs.paint(tile)
    // why: a stroked outline gets its outer corners cut off by Android's rounder board clip so rings are holes painted over inside inset board clips instead.
    const rings = [box(0, color)]
    if (variant.outline) rings.push(box(variant.outline, variant.background))
    if (variant.innerRing) rings.push(box(22, variant.innerRing), box(31, variant.background))
    if (variant.sheen) rings.push(box(0, "url(#sheen)"))
    return rings
  })
}

function mark(variant: IconArt, defs: Defs) {
  const sheen = variant.sheen
    ? `<defs><linearGradient id="sheen" x1="54" y1="54" x2="458" y2="458" gradientUnits="userSpaceOnUse">${SHEEN_STOPS.map(
        ([offset, opacity]) =>
          `<stop offset="${offset}" stop-color="#FFFFFF" stop-opacity="${opacity}"/>`,
      ).join("")}</linearGradient></defs>`
    : ""
  const board = tiles(variant, defs).join("\n      ")
  const ring = variant.buttonRing
    ? `<path d="${FACE}" fill="none" stroke="${defs.paint(variant.buttonRing)}" stroke-width="16" stroke-linejoin="round" clip-path="${defs.button()}"/>`
    : ""
  return `${sheen}
    <g clip-path="${defs.clip(0)}">
      ${variant.glow ? `<g filter="${defs.glow()}" opacity="0.9">${board}</g>` : ""}
      ${board}
      ${variant.grid ? `<rect x="54" y="54" width="404" height="404" fill="${defs.grid()}"/>` : ""}
    </g>
    <path d="${PENTAGON}" fill="${defs.paint(variant.button ?? "#36333D")}" stroke="${variant.background}" stroke-width="14" stroke-linejoin="round"/>
    ${ring}
    <g fill="${defs.paint(variant.lines ?? "#F4F2F1")}">
      <rect x="221" y="225" width="70" height="10" rx="5"/>
      <rect x="221" y="251" width="70" height="10" rx="5"/>
      <rect x="221" y="277" width="70" height="10" rx="5"/>
    </g>`
}

// why: iOS fills the whole square; Android draws only the foreground layer, shrunk into the adaptive icon safe zone with rounder board corners so circle masks keep the whole mark. iOS tinted icons and Android's monochrome layer sit on a system background, so theirs is left transparent.
function svg(icon: IconArt, look: Look) {
  const ios = look.startsWith("ios")
  const onDark = look === "iosTinted" ? onDarkBackground(icon) : icon
  const variant = look === "iosTinted" ? tintable(onDark) : onDark
  const defs = defsFor(ios ? 54 : 120)
  const shape = () =>
    defs.mask(`shape-${look}`, mark(silhouette(variant, look === "androidMonochrome"), defs))
  const art =
    look === "ios" || look === "androidForeground"
      ? mark(variant, defs)
      : look === "androidMonochrome"
        ? `<rect width="512" height="512" fill="#FFFFFF" mask="${shape()}"/>`
        : `<g mask="${shape()}"${look === "iosTinted" ? ` filter="${defs.grayscale()}"` : ""}>${mark(variant, defs)}</g>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 512 512">
  <defs>
    ${defs.markup()}
  </defs>
  ${look === "ios" ? `<rect width="512" height="512" fill="${variant.background}"/>` : ""}
  <g transform="${ios ? "" : "translate(256 256) scale(0.633) translate(-256 -256)"}">
    ${art}
  </g>
</svg>
`
}

const root = path.resolve(import.meta.dirname, "..")
const scratch = mkdtempSync(path.join(tmpdir(), "scryve-app-icons-"))
function render(variant: IconArt, outputs: Partial<Record<Look, string>>) {
  for (const [look, output] of Object.entries(outputs) as [Look, string][]) {
    const source = path.join(scratch, `${variant.name}-${look}.svg`)
    writeFileSync(source, svg(variant, look))
    execFileSync("inkscape", [source, "-o", path.join(root, output), "-w", "1024", "-h", "1024"], {
      stdio: "ignore",
    })
  }
}

mkdirSync(path.join(root, "assets/images/app-icons"), { recursive: true })
for (const variant of APP_ICON_VARIANTS) render(variant, appIconAssets(variant.name))
