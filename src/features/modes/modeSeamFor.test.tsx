import type { ComponentProps, ReactElement } from "react"
import { renderHook } from "@testing-library/react-native"

import { COMPACT_MENU_BUTTON_SIZE } from "@/components/GameRadialMenu"
import type { ModeSeam } from "@/components/modes/ModeSeam"
import {
  getMenuSeamNeighbors,
  getPlayerGridLayout,
  getPlayerGridMenuAnchor,
  getPlayerSlotFacings,
} from "@/components/playerGridGeometry"

import { modeSeamFor } from "./modeSeamFor"
import { useBoardModes } from "./useBoardModes"
import { SCHEME_DECKS } from "../../../convex/lib/modeDecks"
import { startModes } from "../../../convex/lib/tableModes"

const seats = ["ada", "bo", "cy", "dee"]

describe("modeSeamFor", () => {
  it("keeps the archenemy's scheme control on the seam when Turns are off", () => {
    const { modes, turnGroups } = startModes(
      { archenemy: { seat: 1, deck: SCHEME_DECKS[0].id } },
      seats,
    )
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
    expect([...(left?.items ?? []), ...(right?.items ?? [])]).toContainEqual(
      expect.stringMatching(/^scheme/),
    )
  })
})
