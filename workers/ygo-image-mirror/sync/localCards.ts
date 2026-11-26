import { pathToFileURL } from "node:url"
import { gzipSync } from "node:zlib"

import { upload } from "./mtgDataset"
import { FAB_CUBE_DATASET, fabLocalCard } from "../../../convex/lib/games/fleshAndBlood"
import {
  encodeLocalCards,
  isLocalCardGame,
  type LocalCard,
  type LocalCardGame,
  localCardsPath,
} from "../../../convex/lib/localCards"

import { mirrorOrigin } from "./index"

type Source = {
  minCards: number
  build: () => Promise<{ version: string; cards: LocalCard[] }>
}

/** why: Magic's file comes out of the Scryfall pass in mtgDataset.ts; other games build here from the loader Convex already uses. */
const SOURCES = {
  fab: {
    minCards: 4_000,
    build: async () => {
      const version = await FAB_CUBE_DATASET.version()
      return { version, cards: (await FAB_CUBE_DATASET.load(version)).map(fabLocalCard) }
    },
  },
} satisfies Record<Exclude<LocalCardGame, "mtg">, Source>

type SyncOptions = {
  game: keyof typeof SOURCES
  mirrorBaseUrl: string
  mirrorToken: string
  dryRun?: boolean
  minCards?: number
  fetch?: typeof fetch
  report?: (entry: Record<string, unknown>) => void
}

export async function syncLocalCards(options: SyncOptions) {
  const report = options.report ?? ((entry) => console.log(JSON.stringify(entry)))
  const source = SOURCES[options.game]
  const minCards = options.minCards ?? source.minCards
  const { version, cards } = await source.build()
  const gzip = gzipSync(encodeLocalCards(version, cards), { level: 9 })
  const result = { game: options.game, version, cards: cards.length, gzipBytes: gzip.byteLength }
  report({ event: "local_cards_built", ...result })

  if (cards.length < minCards) {
    throw new Error(`Refusing to upload ${cards.length} cards; expected at least ${minCards}`)
  }
  if (options.dryRun) return result
  if (!options.mirrorToken) throw new Error("YGO_MIRROR_TOKEN is required")
  await upload(options.fetch ?? fetch, {
    origin: mirrorOrigin(options.mirrorBaseUrl),
    token: options.mirrorToken,
    path: localCardsPath(options.game),
    gzip,
  })
  report({ event: "local_cards_uploaded", ...result })
  return result
}

async function main() {
  const game = process.argv.slice(2).find((arg) => !arg.startsWith("--")) ?? ""
  if (!isLocalCardGame(game) || game === "mtg") {
    throw new Error(`Pick a game to sync: ${Object.keys(SOURCES).join(", ")}`)
  }
  await syncLocalCards({
    game,
    mirrorBaseUrl: process.env.YGO_MIRROR_BASE_URL ?? "",
    mirrorToken: process.env.YGO_MIRROR_TOKEN ?? "",
    dryRun: process.argv.includes("--dry-run"),
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error: unknown) => {
    console.error(
      JSON.stringify({
        event: "sync_failed",
        error: error instanceof Error ? error.message : "Unknown error",
      }),
    )
    process.exitCode = 1
  })
}
