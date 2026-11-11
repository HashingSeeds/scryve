import type { ComponentProps, ReactElement } from "react"
import { act, render, renderHook, screen } from "@testing-library/react-native"

import { COMPACT_MENU_BUTTON_SIZE, MENU_BUTTON_SIZE } from "@/components/GameRadialMenu"
import type { ModeSeam } from "@/components/modes/ModeSeam"
import {
  getMenuSeamNeighbors,
  getPlayerGridLayout,
  getPlayerGridMenuAnchor,
  getPlayerSlotFacings,
} from "@/components/playerGridGeometry"
import { teamChipCrowded, teamGridLayout } from "@/components/teamGridGeometry"
import { ThemeProvider } from "@/theme/context"

import { bagWithPlane, modeSeamFor, teamSeat } from "./modeSeamFor"
import { useBoardModes } from "./useBoardModes"
import { PLANAR_DECKS, SCHEME_DECKS } from "../../../convex/lib/modeDecks"
import { startModes, type ModeSetup } from "../../../convex/lib/tableModes"

const seats = ["ada", "bo", "cy", "dee"]

describe("modeSeamFor", () => {
  it.each<[string, ModeSetup]>([
    ["Archenemy", { archenemy: { seat: 1, deck: SCHEME_DECKS[0].id } }],
    [
      "Archenemy and Planechase",
      {
        archenemy: { seat: 1, deck: SCHEME_DECKS[0].id },
        planechase: { decks: [PLANAR_DECKS[0].id] },
      },
    ],
  ])("keeps the archenemy's scheme control on the seam when Turns are off, with %s", (_, setup) => {
    const { modes, turnGroups } = startModes(setup, seats)
    const { result } = renderHook(() =>
      useBoardModes({
        modes,
        turn: { playerId: "ada", number: 1, startedAt: 0, operationId: "turn-1", waiting: true },
        groups: turnGroups,
        players: seats.map((id) => ({ id, name: id })),
        controls: () => true,
        act: () => true,
        turnsOn: true,
      }),
    )
    const [width, height] = [390, 844]
    const layout = getPlayerGridLayout({ playerCount: 4, width, height })
    const seam = modeSeamFor(result.current, {
      dieOnChip: false,
      turnChips: false,
      slotOf: (playerId) => ({ slot: seats.indexOf(playerId) }),
    })
    const element = seam?.({
      anchor: getPlayerGridMenuAnchor(4, layout),
      facings: getPlayerSlotFacings(4, layout),
      edgeTabs: false,
      sides: getMenuSeamNeighbors(4, layout),
      width,
      menuSize: COMPACT_MENU_BUTTON_SIZE,
    }) as ReactElement<ComponentProps<typeof ModeSeam>>
    const { left, right } = element.props.plan
    const sides = [left?.items ?? [], right?.items ?? []]
    const schemeSide = sides.findIndex((items) => items.some((item) => item.startsWith("scheme")))
    expect(schemeSide).toBeGreaterThanOrEqual(0)
    if (setup.planechase) expect(sides[1 - schemeSide]).toContain("plane")
  })

  it("signals a due scheme on a narrow board where the turn chip has no room for it", () => {
    const players = seats.slice(0, 3)
    const { modes, turnGroups } = startModes(
      {
        archenemy: { seat: 1, deck: SCHEME_DECKS[0].id },
        planechase: { decks: [PLANAR_DECKS[0].id] },
      },
      players,
    )
    const { result } = renderHook(() =>
      useBoardModes({
        modes,
        turn: { playerId: "ada", number: 1, startedAt: 0, operationId: "turn-1", waiting: true },
        groups: turnGroups,
        players: players.map((id) => ({ id, name: id })),
        controls: () => true,
        act: () => true,
        turnsOn: true,
      }),
    )
    const [width, height] = [320, 568]
    const layout = getPlayerGridLayout({ playerCount: 3, width, height })
    const seam = modeSeamFor(result.current, {
      dieOnChip: true,
      turnChips: true,
      slotOf: (playerId) => ({ slot: players.indexOf(playerId) }),
    })
    render(
      <ThemeProvider initialContext="dark">
        {seam?.({
          anchor: getPlayerGridMenuAnchor(3, layout),
          facings: getPlayerSlotFacings(3, layout),
          edgeTabs: false,
          sides: getMenuSeamNeighbors(3, layout),
          width,
          menuSize: COMPACT_MENU_BUTTON_SIZE,
        })}
      </ThemeProvider>,
    )
    expect(screen.getByTestId("scheme-due-plate").props.accessibilityLabel).toBe(
      "Archenemy: Scheme due",
    )
    expect(screen.getByTestId("plane-plate")).toBeTruthy()
  })

  it.each(["auto", "featured-last"] as const)(
    "moves the planar die to the seam only for the team whose zone the menu sits on, six players, %s",
    (layoutVariant) => {
      const players = ["ada", "bo", "cy", "dee", "eve", "fay"]
      const teams = [
        ["ada", "bo"],
        ["cy", "dee"],
        ["eve", "fay"],
      ]
      const { modes } = startModes({ planechase: { decks: [PLANAR_DECKS[0].id] } }, players)
      const [width, height] = [390, 844]
      const layout = teamGridLayout({ playerCount: 3, width, height, layoutVariant })
      const featured = layoutVariant === "auto" ? "ada" : "eve"
      for (const [active] of teams) {
        const { result } = renderHook(() =>
          useBoardModes({
            modes,
            turn: { playerId: active!, number: 1, startedAt: 0, operationId: "t", waiting: true },
            groups: teams,
            players: players.map((id) => ({ id, name: id })),
            controls: () => true,
            act: () => true,
            turnsOn: true,
          }),
        )
        const seam = modeSeamFor(result.current, {
          dieOnChip: true,
          turnChips: true,
          slotOf: (playerId) => teamSeat(teams, playerId),
        })
        const element = seam?.({
          anchor: getPlayerGridMenuAnchor(3, layout),
          facings: getPlayerSlotFacings(3, layout),
          edgeTabs: false,
          sides: getMenuSeamNeighbors(3, layout),
          width,
          menuSize: COMPACT_MENU_BUTTON_SIZE,
          teamChipCrowded: (slot) => teamChipCrowded(3, layout, slot),
        }) as ReactElement<ComponentProps<typeof ModeSeam>>
        const { left, right } = element.props.plan
        expect([...(left?.items ?? []), ...(right?.items ?? [])].sort()).toEqual(
          active === featured ? ["die", "plane"] : ["plane"],
        )
      }
    },
  )

  it.each([
    [4, false, 320],
    [5, false, 375],
    [6, false, 320],
    [4, true, 390],
  ] as const)(
    "keeps the plane one tap away when a %i-seat board (teams: %s) at %ipt has no seam room",
    (count, team, width) => {
      const players = Array.from({ length: count }, (_, index) => `p${index}`)
      const teams = team
        ? Array.from({ length: count / 2 }, (_, index) => players.slice(2 * index, 2 * index + 2))
        : undefined
      const cells = teams?.length ?? count
      const layout = (team ? teamGridLayout : getPlayerGridLayout)({
        playerCount: cells,
        width,
        height: 700,
      })
      const { modes, turnGroups } = startModes(
        { planechase: { decks: [PLANAR_DECKS[0].id] } },
        players,
      )
      for (const turnsOn of [true, false]) {
        const { result } = renderHook(() =>
          useBoardModes({
            modes,
            turn: turnsOn
              ? { playerId: "p0", number: 1, startedAt: 0, operationId: "t", waiting: true }
              : undefined,
            groups: teams ?? turnGroups,
            players: players.map((id) => ({ id, name: id })),
            controls: () => true,
            act: () => true,
            turnsOn,
          }),
        )
        const seam = modeSeamFor(result.current, {
          dieOnChip: turnsOn,
          turnChips: turnsOn,
          slotOf: (playerId) =>
            teams ? teamSeat(teams, playerId) : { slot: players.indexOf(playerId) },
        })
        const element = seam?.({
          anchor: getPlayerGridMenuAnchor(cells, layout),
          facings: getPlayerSlotFacings(cells, layout),
          edgeTabs: false,
          sides: getMenuSeamNeighbors(cells, layout),
          width,
          menuSize: cells > 2 ? COMPACT_MENU_BUTTON_SIZE : MENU_BUTTON_SIZE,
          ...(teams
            ? {
                teamChipCrowded: (slot: number) => teamChipCrowded(cells, layout, slot),
              }
            : {}),
        }) as ReactElement<ComponentProps<typeof ModeSeam>>
        const { left, right } = element.props.plan
        expect([...(left?.items ?? []), ...(right?.items ?? [])]).not.toContain("plane")
        const bag = bagWithPlane({ tools: [], rollFor: () => {} }, result.current)
        act(() => bag?.openPlane?.({ id: "p0" }))
        expect(result.current.dialog).toBe("planar")
      }
    },
  )
})
