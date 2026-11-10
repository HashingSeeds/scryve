import type { ComponentProps, ReactElement } from "react"
import { render, renderHook, screen } from "@testing-library/react-native"

import { COMPACT_MENU_BUTTON_SIZE } from "@/components/GameRadialMenu"
import type { ModeSeam } from "@/components/modes/ModeSeam"
import {
  getMenuSeamNeighbors,
  getPlayerGridLayout,
  getPlayerGridMenuAnchor,
  getPlayerSlotFacings,
} from "@/components/playerGridGeometry"
import { ThemeProvider } from "@/theme/context"

import { modeSeamFor } from "./modeSeamFor"
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
      }),
    )
    const [width, height] = [390, 844]
    const layout = getPlayerGridLayout({ playerCount: 4, width, height })
    const seam = modeSeamFor(result.current, {
      dieOnChip: false,
      turnChips: false,
      slotOf: (playerId) => seats.indexOf(playerId),
    })
    const element = seam?.({
      anchor: getPlayerGridMenuAnchor(4, layout),
      facings: getPlayerSlotFacings(4, layout),
      edgeTabs: false,
      sides: getMenuSeamNeighbors(4, layout),
      width,
      menuSize: COMPACT_MENU_BUTTON_SIZE,
      rivets: [],
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
      }),
    )
    const [width, height] = [320, 568]
    const layout = getPlayerGridLayout({ playerCount: 3, width, height })
    const seam = modeSeamFor(result.current, {
      dieOnChip: true,
      turnChips: true,
      slotOf: (playerId) => players.indexOf(playerId),
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
          rivets: [],
        })}
      </ThemeProvider>,
    )
    expect(screen.getByTestId("scheme-due-plate").props.accessibilityLabel).toBe(
      "Archenemy: Scheme due",
    )
    expect(screen.getByTestId("plane-plate")).toBeTruthy()
  })
})
