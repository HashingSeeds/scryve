import { Alert, Linking } from "react-native"

import { GAME_RULES, gameRules, openRules } from "./gameRules"
import { SYSTEMS } from "../../../convex/lib/systems"

it("gameRules gives Magic and Flesh and Blood their text, links the other games, and skips unknown systems", () => {
  expect(gameRules("mtg")?.kind).toBe("text")
  expect(gameRules("fab")?.kind).toBe("text")
  expect(gameRules("pokemon")?.kind).toBe("link")
  expect(gameRules("ygo")?.kind).toBe("link")
  expect(gameRules("lorcana")?.kind).toBe("link")
  expect(gameRules("chess")).toBeUndefined()
  expect(gameRules(undefined)).toBeUndefined()
})

it("openRules opens a link game's page and shows text rules in the app", () => {
  const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(true)
  const showText = jest.fn()
  openRules(GAME_RULES.pokemon, showText)
  expect(openURL).toHaveBeenCalledWith(GAME_RULES.pokemon.pageUrl)
  expect(showText).not.toHaveBeenCalled()
  openRules(GAME_RULES.mtg, showText)
  expect(showText).toHaveBeenCalledTimes(1)
  expect(openURL).toHaveBeenCalledTimes(1)
})

it("openRules tells the player when the official page can't open", async () => {
  jest.spyOn(Linking, "openURL").mockRejectedValue(new Error("no browser"))
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined)
  openRules(GAME_RULES.ygo)
  await new Promise(process.nextTick)
  expect(alert).toHaveBeenCalledWith(expect.any(String), GAME_RULES.ygo.pageUrl)
})

it("Magic table item rules name real counters or designations and rule numbers", () => {
  const { counters, designations } = SYSTEMS.mtg.table
  const ids: string[] = [...counters, ...designations].map(({ id }) => id)
  for (const [id, rule] of Object.entries(GAME_RULES.mtg.tableItemRules)) {
    expect(ids).toContain(id)
    expect(rule).toMatch(/^\d{3}(\.\d+[a-z]?)?$/)
  }
})
