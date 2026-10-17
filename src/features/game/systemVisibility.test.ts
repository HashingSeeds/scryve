import type * as Definitions from "../../../convex/lib/systems/definitions"
import { SYSTEM_IDS } from "../../../convex/lib/systems/definitions"

const mockEnvironment = { current: "production" }

jest.mock("@/utils/buildEnvironment", () => ({ buildEnvironment: () => mockEnvironment.current }))

jest.mock("../../../convex/lib/systems/definitions", () => {
  const actual: typeof Definitions = jest.requireActual("../../../convex/lib/systems/definitions")
  return {
    ...actual,
    SYSTEMS: { ...actual.SYSTEMS, pokemon: { ...actual.SYSTEMS.pokemon, release: "beta" } },
  }
})

async function loadIn(environment: string) {
  mockEnvironment.current = environment
  let loaded:
    | { visibility: typeof import("./systemVisibility"); gameTypes: typeof import("./gameTypes") }
    | undefined
  await jest.isolateModulesAsync(async () => {
    loaded = {
      visibility: await import("./systemVisibility"),
      gameTypes: await import("./gameTypes"),
    }
  })
  if (!loaded) throw new Error("modules did not load")
  return loaded
}

const gameTypeSystems = ({ FEATURED_GAME_TYPES, MORE_GAME_TYPES }: typeof import("./gameTypes")) =>
  new Set([...FEATURED_GAME_TYPES, ...MORE_GAME_TYPES].map((type) => type.system))

describe("system visibility", () => {
  it("hides beta systems from production builds", async () => {
    const { visibility, gameTypes } = await loadIn("production")

    expect(visibility.VISIBLE_SYSTEM_IDS).toEqual(["mtg", "ygo"])
    expect(visibility.isSystemVisible("pokemon")).toBe(false)
    expect(visibility.isSystemVisible("not-a-system")).toBe(false)
    expect(gameTypeSystems(gameTypes)).toEqual(new Set(["mtg", "ygo", undefined]))
    const { suggested, more } = gameTypes.newGameTypes({
      chosen: { system: "pokemon", format: "standard" },
      connected: false,
    })
    expect([...suggested, ...more].some((type) => type.system === "pokemon")).toBe(false)
  })

  it.each(["beta", "preview", "development"])("shows beta systems on %s", async (environment) => {
    const { visibility, gameTypes } = await loadIn(environment)

    expect(visibility.VISIBLE_SYSTEM_IDS).toEqual(SYSTEM_IDS)
    expect(gameTypeSystems(gameTypes)).toEqual(new Set([...SYSTEM_IDS, undefined]))
  })
})
