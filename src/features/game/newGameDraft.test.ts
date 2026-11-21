import { createLocalGame, PLAYER_COLORS } from "@/features/game/domain"
import { DEFAULT_LOCAL_SETTINGS } from "@/features/game/localPersistence"
import {
  deriveGameSetup,
  gameDraftReducer,
  initialGameDraft,
  type GameDraft,
  type GameDraftAction,
} from "@/features/game/newGameDraft"

import { NO_SYSTEM_SETTINGS } from "../../../test/fixtures/localSettings"

const commanderPod = () => initialGameDraft({ defaults: DEFAULT_LOCAL_SETTINGS })
const apply = (draft: GameDraft, ...actions: GameDraftAction[]) =>
  actions.reduce(gameDraftReducer, draft)
const local = { connected: false }
const connected = { connected: true }

const twoHeadedGiant = {
  id: "2hg",
  system: "mtg",
  format: "commander",
  variant: "twoHeadedGiant",
} as const
const treachery = {
  id: "treachery",
  system: "mtg",
  format: "commander",
  variant: "treachery",
} as const
const standard = { id: "standard", system: "mtg", format: "standard" } as const

describe("initialGameDraft", () => {
  it("starts from the saved defaults", () => {
    expect(commanderPod()).toMatchObject({
      system: "mtg",
      format: "commander",
      playerCount: 4,
      startingLife: 40,
      matchOn: false,
      clockMode: "off",
      formatPicked: false,
    })
    expect(initialGameDraft({ defaults: NO_SYSTEM_SETTINGS })).toMatchObject({
      system: undefined,
      format: undefined,
      playerCount: 2,
      startingLife: 20,
    })
  })

  it("seeds names, match and clock from the game being set up, and claims its seat", () => {
    const initialGame = createLocalGame({
      startingLife: 20,
      system: "mtg",
      format: "standard",
      match: { bestOf: 5 },
      clock: { mode: "countdown", minutes: 25 },
      account: { ownerId: "owner", meSeat: 1 },
      players: [
        { name: "Ana", color: PLAYER_COLORS[0] },
        { name: "Ben", color: PLAYER_COLORS[0] },
      ],
    })
    const draft = initialGameDraft({ defaults: DEFAULT_LOCAL_SETTINGS, initialGame })
    expect(draft).toMatchObject({
      format: "standard",
      playerCount: 2,
      matchOn: true,
      chosenBestOf: 5,
      clockMode: "countdown",
      chosenClockMinutes: 25,
      meSeat: 1,
    })
    expect(draft.names.slice(0, 3)).toEqual(["Ana", "Ben", ""])
    expect(draft.appearances[1].color).not.toBe(draft.appearances[0].color)
  })

  it("a 2HG game's shared team colors split back into one color per seat once teams are off", () => {
    const initialGame = createLocalGame({
      startingLife: 60,
      system: "mtg",
      format: "commander",
      teams: [
        [0, 1],
        [2, 3],
      ],
      players: [0, 0, 1, 1].map((color, seat) => ({
        name: `Player ${seat + 1}`,
        color: PLAYER_COLORS[color],
      })),
    })
    const teamsOff = apply(initialGameDraft({ defaults: DEFAULT_LOCAL_SETTINGS, initialGame }), {
      type: "chooseGameType",
      gameType: { id: "commander", system: "mtg", format: "commander" },
      confirmedFree: false,
    })
    expect(deriveGameSetup(teamsOff, local).teams).toBeUndefined()
    const colors = teamsOff.appearances.slice(0, 4).map(({ color }) => color.toUpperCase())
    expect(new Set(colors).size).toBe(4)
  })

  it("replays a connected setup's variant", () => {
    const draft = initialGameDraft({
      defaults: NO_SYSTEM_SETTINGS,
      replaying: {
        savedAt: 1,
        mode: "connected",
        lobby: {
          playerCount: 5,
          startingLife: 40,
          ruleset: "commander",
          system: "mtg",
          format: "commander",
          variant: "treachery",
          layout: "auto",
          lifeStep: 1,
        },
      },
    })
    expect(draft).toMatchObject({ system: "mtg", playerCount: 5, treacheryChosen: true })
    expect(deriveGameSetup(draft, connected).gameSetup.variant).toBe("treachery")
  })
})

describe("gameDraftReducer", () => {
  it("moving to Two-Headed Giant fills four seats and starts at team life", () => {
    const draft = apply(
      commanderPod(),
      { type: "choosePlayerCount", count: 3, confirmedFree: false },
      { type: "chooseGameType", gameType: twoHeadedGiant, confirmedFree: false },
    )
    expect(draft).toMatchObject({
      playerCount: 4,
      startingLife: 60,
      teamsChosen: true,
      formatPicked: true,
    })
  })

  it("a new variant in the same format keeps a custom life", () => {
    const custom = apply(commanderPod(), { type: "set", patch: { startingLife: 33 } })
    const sameFormat = apply(custom, {
      type: "chooseGameType",
      gameType: { id: "archenemy", system: "mtg", format: "commander", variant: "archenemy" },
      confirmedFree: false,
    })
    expect(sameFormat.startingLife).toBe(33)
    expect(sameFormat.archenemyChosen).toBe(true)
  })

  it("a new format drops the chosen deck", () => {
    const deck = { name: "Atraxa", system: "mtg", deckKey: "deck" } as const
    const withDeck = apply(commanderPod(), { type: "set", patch: { deck } })
    expect(
      apply(withDeck, { type: "chooseGameType", gameType: standard, confirmedFree: false }).deck,
    ).toBeUndefined()
    expect(
      apply(withDeck, { type: "chooseGameType", gameType: treachery, confirmedFree: false }).deck,
    ).toBe(deck)
  })

  it("a default starting life follows the player count, a custom one stays", () => {
    const brawl = apply(commanderPod(), {
      type: "chooseGameType",
      gameType: { id: "brawl", system: "mtg", format: "brawl" },
      confirmedFree: false,
    })
    expect(brawl.startingLife).toBe(30)
    expect(
      apply(brawl, { type: "choosePlayerCount", count: 2, confirmedFree: false }).startingLife,
    ).toBe(25)
    const custom = apply(brawl, { type: "set", patch: { startingLife: 33 } })
    expect(
      apply(custom, { type: "choosePlayerCount", count: 2, confirmedFree: false }).startingLife,
    ).toBe(33)
  })

  it("leaving treachery's seat range turns treachery off", () => {
    const draft = apply(commanderPod(), {
      type: "chooseGameType",
      gameType: treachery,
      confirmedFree: false,
    })
    expect(
      apply(draft, { type: "choosePlayerCount", count: 6, confirmedFree: false }).treacheryChosen,
    ).toBe(true)
    expect(
      apply(draft, { type: "choosePlayerCount", count: 7, confirmedFree: false }).treacheryChosen,
    ).toBe(false)
  })

  it("added seats get their own colors, and an archenemy seat that no longer exists rolls", () => {
    const shrunk = apply(
      commanderPod(),
      { type: "set", patch: { modeChoices: { planar: "off", archenemy: "4", schemes: "off" } } },
      { type: "choosePlayerCount", count: 3, confirmedFree: false },
    )
    expect(shrunk.modeChoices.archenemy).toBe("roll")
    const clashing = shrunk.appearances.map((appearance, seat) =>
      seat === 4 ? { ...appearance, color: shrunk.appearances[0].color } : appearance,
    )
    const grown = apply(
      shrunk,
      { type: "set", patch: { appearances: clashing } },
      { type: "choosePlayerCount", count: 8, confirmedFree: true },
    )
    const colors = grown.appearances.slice(0, 8).map(({ color }) => color.toUpperCase())
    expect(new Set(colors).size).toBe(8)
  })

  it("swapping two seats trades their teams", () => {
    const draft = apply(
      commanderPod(),
      { type: "chooseGameType", gameType: twoHeadedGiant, confirmedFree: false },
      { type: "swapSeats", first: 1, second: 2, teamColors: ["#111", "#222"] },
    )
    expect(draft.teamDraft).toEqual([
      [0, 2],
      [1, 3],
    ])
    expect(draft.teamColorDraft).toEqual(["#111", "#222"])
  })

  it("leaving the seat leaves the deck too", () => {
    const deck = { name: "Atraxa", system: "mtg", deckKey: "deck" } as const
    const seated = apply(
      commanderPod(),
      { type: "chooseMeSeat", seat: 2 },
      { type: "set", patch: { deck } },
    )
    expect(apply(seated, { type: "chooseMeSeat", seat: 3 }).deck).toBe(deck)
    expect(apply(seated, { type: "chooseMeSeat", seat: undefined }).deck).toBeUndefined()
    expect(apply(seated, { type: "changeAccount", meSeat: 0 })).toMatchObject({
      meSeat: 0,
      deck: undefined,
    })
  })

  it("turning a match on forgets the old best-of", () => {
    const draft = apply(
      commanderPod(),
      { type: "set", patch: { chosenBestOf: 5 } },
      { type: "toggleMatch", on: true },
    )
    expect(draft).toMatchObject({ matchOn: true, chosenBestOf: undefined })
  })
})

describe("deriveGameSetup", () => {
  it("pairs neighbors when the team draft does not fit the seats", () => {
    const draft = {
      ...apply(commanderPod(), {
        type: "chooseGameType",
        gameType: twoHeadedGiant,
        confirmedFree: false,
      }),
      teamDraft: [[0, 1]],
    }
    const setup = deriveGameSetup(draft, local)
    expect(setup.teams).toEqual([
      [0, 1],
      [2, 3],
    ])
    expect(setup.lifeOptions).toContain(60)
    expect(setup.gameSetup).toMatchObject({ variant: "twoHeadedGiant", teams: setup.teams })
    expect(setup.gameSetup).not.toHaveProperty("teamVariant")
    expect(deriveGameSetup(draft, connected).gameSetup).not.toHaveProperty("teams")
  })

  it("names 2v2 for local games", () => {
    const draft = apply(initialGameDraft({ defaults: NO_SYSTEM_SETTINGS }), {
      type: "chooseGameType",
      gameType: { id: "2v2", system: "riftbound", format: "constructed", variant: "twoVsTwo" },
      confirmedFree: false,
    })
    expect(deriveGameSetup(draft, local).gameSetup).toMatchObject({
      variant: "twoVsTwo",
      teamVariant: "twoVsTwo",
    })
  })

  it("offers treachery only to connected games", () => {
    const draft = apply(commanderPod(), {
      type: "chooseGameType",
      gameType: treachery,
      confirmedFree: false,
    })
    expect(deriveGameSetup(draft, connected).gameSetup.variant).toBe("treachery")
    expect(deriveGameSetup(draft, local).gameSetup.variant).toBeUndefined()
  })

  it("defaults a match to one game for Commander and three for a duel", () => {
    const matchOn = { type: "toggleMatch", on: true } as const
    expect(deriveGameSetup(apply(commanderPod(), matchOn), local).matchBestOf).toBe(1)
    const duel = apply(
      commanderPod(),
      { type: "chooseGameType", gameType: standard, confirmedFree: false },
      { type: "choosePlayerCount", count: 2, confirmedFree: false },
      matchOn,
    )
    expect(deriveGameSetup(duel, local).matchBestOf).toBe(3)
    expect(deriveGameSetup(commanderPod(), local).matchBestOf).toBeUndefined()
  })

  it("builds the clock from its mode", () => {
    const pod = commanderPod()
    expect(deriveGameSetup(pod, local).clock).toBeUndefined()
    expect(
      deriveGameSetup(apply(pod, { type: "set", patch: { clockMode: "countdown" } }), local).clock,
    ).toEqual({ mode: "countdown", minutes: 50 })
    expect(
      deriveGameSetup(
        apply(pod, { type: "set", patch: { clockMode: "countdown", chosenClockMinutes: 20 } }),
        local,
      ).clock,
    ).toEqual({ mode: "countdown", minutes: 20 })
    expect(
      deriveGameSetup(apply(pod, { type: "set", patch: { clockMode: "stopwatch" } }), local).clock,
    ).toEqual({ mode: "stopwatch" })
  })

  it("carries planechase choices only where the system offers them", () => {
    const planes = { planar: "own", archenemy: "roll", schemes: "own" }
    const pod = apply(commanderPod(), { type: "set", patch: { modeChoices: planes } })
    expect(deriveGameSetup(pod, local).gameSetup.modeSetup).toBeDefined()
    const noSystem = { ...initialGameDraft({ defaults: NO_SYSTEM_SETTINGS }), modeChoices: planes }
    expect(deriveGameSetup(noSystem, local).gameSetup.modeSetup).toBeUndefined()
  })

  it("forgets a claimed seat the player count no longer has", () => {
    const seated = apply(commanderPod(), { type: "chooseMeSeat", seat: 3 })
    expect(deriveGameSetup(seated, local).effectiveMeSeat).toBe(3)
    const fewer = apply(seated, { type: "choosePlayerCount", count: 2, confirmedFree: false })
    expect(deriveGameSetup(fewer, local).effectiveMeSeat).toBeUndefined()
  })
})
