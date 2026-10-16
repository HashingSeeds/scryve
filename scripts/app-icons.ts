/** why: EAS builds have no Inkscape, so this draws the variants in APP_ICON_VARIANTS on the board and button from app-icon-source.svg and the PNGs it writes are committed. */
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import {
  APP_ICON_VARIANTS,
  appIconAssets,
  type AppIconSpec,
} from "../src/features/appIcon/appIconVariants"

const PENTAGON =
  "M241.44 174.58 Q256.00 164.00 270.56 174.58 L328.93 216.99 Q343.50 227.57 337.93 244.69 L315.64 313.31 Q310.08 330.43 292.08 330.43 L219.92 330.43 Q201.92 330.43 196.36 313.31 L174.07 244.69 Q168.50 227.57 183.07 216.99Z"
// why: seat order follows the in-game portrait board. The button must sit where seat corners meet, which five and six seats break.
const LAYOUTS: Record<number, readonly (readonly [number, number, number, number])[]> = {
  2: [
    [54, 54, 404, 194],
    [54, 264, 404, 194],
  ],
  3: [
    [54, 54, 404, 194],
    [54, 264, 194, 194],
    [264, 264, 194, 194],
  ],
  4: [
    [54, 54, 194, 194],
    [264, 54, 194, 194],
    [54, 264, 194, 194],
    [264, 264, 194, 194],
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

function tiles(variant: AppIconSpec) {
  const layout = LAYOUTS[variant.tiles.length]
  if (!layout) throw new Error(`${variant.name}: no board layout for ${variant.tiles.length} tiles`)
  return layout.flatMap(([x, y, width, height], index) => {
    const radius = Math.min(54, Math.round(height * 0.36))
    const shape = `x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}"`
    const color = variant.tiles[index]
    const tile = `<rect ${shape} fill="${color}"/>`
    // why: a stroked outline gets its outer corners cut off by Android's rounder board clip, so the hole is painted over inside an inset board clip instead.
    if (variant.outline) {
      const hole = `<rect x="${x + 10}" y="${y + 10}" width="${width - 20}" height="${height - 20}" rx="${radius - 10}" fill="${variant.background}" clip-path="url(#inner)"/>`
      return [tile, hole]
    }
    return variant.sheen ? [tile, `<rect ${shape} fill="url(#sheen)"/>`] : [tile]
  })
}

function mark(variant: AppIconSpec) {
  const sheen = variant.sheen
    ? `<defs><linearGradient id="sheen" x1="54" y1="54" x2="458" y2="458" gradientUnits="userSpaceOnUse">${SHEEN_STOPS.map(
        ([offset, opacity]) =>
          `<stop offset="${offset}" stop-color="#FFFFFF" stop-opacity="${opacity}"/>`,
      ).join("")}</linearGradient></defs>`
    : ""
  return `${sheen}
    <g clip-path="url(#board)">
      ${tiles(variant).join("\n      ")}
    </g>
    <path d="${PENTAGON}" fill="${variant.button ?? "#36333D"}" stroke="${variant.background}" stroke-width="20" stroke-linejoin="round" paint-order="stroke"/>
    <g fill="${variant.lines ?? "#F4F2F1"}">
      <rect x="221" y="225" width="70" height="10" rx="5"/>
      <rect x="221" y="251" width="70" height="10" rx="5"/>
      <rect x="221" y="277" width="70" height="10" rx="5"/>
    </g>`
}

// why: iOS fills the whole square; Android draws only the foreground layer, shrunk into the adaptive icon safe zone with rounder board corners so circle masks keep the whole mark.
function svg(variant: AppIconSpec, platform: "ios" | "android") {
  const ios = platform === "ios"
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 512 512">
  <defs>
    <clipPath id="board"><rect x="54" y="54" width="404" height="404" rx="${ios ? 54 : 120}"/></clipPath>
    <clipPath id="inner"><rect x="64" y="64" width="384" height="384" rx="${ios ? 44 : 110}"/></clipPath>
  </defs>
  ${ios ? `<rect width="512" height="512" fill="${variant.background}"/>` : ""}
  <g transform="${ios ? "" : "translate(256 256) scale(0.633) translate(-256 -256)"}">
    ${mark(variant)}
  </g>
</svg>
`
}

const root = path.resolve(import.meta.dirname, "..")
const scratch = mkdtempSync(path.join(tmpdir(), "scryve-app-icons-"))
mkdirSync(path.join(root, "assets/images/app-icons"), { recursive: true })
for (const variant of APP_ICON_VARIANTS) {
  const assets = appIconAssets(variant.name)
  for (const [platform, output] of [
    ["ios", assets.ios],
    ["android", assets.androidForeground],
  ] as const) {
    const source = path.join(scratch, `${variant.name}-${platform}.svg`)
    writeFileSync(source, svg(variant, platform))
    execFileSync("inkscape", [source, "-o", path.join(root, output), "-w", "1024", "-h", "1024"], {
      stdio: "ignore",
    })
  }
}
