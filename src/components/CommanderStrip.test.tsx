import { fireEvent, render } from "@testing-library/react-native"
import { makeMutable } from "react-native-reanimated"

import { asPlayerId } from "@/features/game/domain"
import type { GamePlayer } from "@/features/game/types"
import { ThemeProvider } from "@/theme/context"

import { commanderBoardSeats } from "./commanderDamageLayout"
import { CommanderStrip, commanderDamageTier, type CommanderStripProps } from "./CommanderStrip"

const players: GamePlayer[] = [
  { id: asPlayerId("ada"), name: "Ada", color: "#41476E", life: 40, seat: 0 },
  { id: asPlayerId("bo"), name: "Bo", color: "#B85535", life: 40, seat: 1 },
  { id: asPlayerId("cy"), name: "Cy", color: "#3A7358", life: 40, seat: 2 },
]
const { seats } = commanderBoardSeats(
  [[0, 1], [2]],
  players.map(({ id }) => id),
)

function renderStrip(props: Partial<CommanderStripProps> = {}) {
  return render(
    <ThemeProvider initialContext="dark">
      <CommanderStrip
        seatNumber={1}
        identity="Seat 1, Ada"
        ownerPlayerId={players[0].id}
        players={players}
        seats={seats}
        incoming={{}}
        lethal={21}
        foreground="#FFFFFF"
        contentRotation={0}
        onPress={jest.fn()}
        {...props}
      />
    </ThemeProvider>,
  )
}

const damaged = { [players[2].id]: 21 }

describe("CommanderStrip", () => {
  it("stays hidden until someone deals damage", () => {
    const view = renderStrip()
    expect(view.queryByTestId("commander-strip-seat-1")).toBeNull()
  })

  it("shows the whole board, with the card's own seat holding its mark, and opens an attack when tapped", () => {
    const onPress = jest.fn()
    const view = renderStrip({ incoming: damaged, onPress })

    const rows = view.getByTestId("commander-map-seat-1").children.map((row) =>
      typeof row === "string"
        ? []
        : [
            ...new Set(
              row
                .findAll((node) => typeof node.props?.testID === "string")
                .map((node) => node.props.testID as string)
                .filter((testID) => /^commander-(own|pip)-/.test(testID)),
            ),
          ],
    )
    expect(rows.filter((row) => row.length > 0)).toEqual([
      ["commander-own-seat-1", `commander-pip-seat-1-${players[1].id}`],
      [`commander-pip-seat-1-${players[2].id}`],
    ])
    expect(
      view.getByTestId(`commander-pip-seat-1-${players[2].id}`, { includeHiddenElements: true }),
    ).toHaveTextContent("21")
    const grid = view.getByRole("button", {
      name: "Assign commander damage from Seat 1, Ada. Taken: 21 from Cy",
    })
    expect(view.getAllByRole("button")).toHaveLength(1)
    fireEvent.press(grid)
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it("sits in the mark's corner, tucked into a screen corner but clear of a mid-edge notch", () => {
    const props = {
      incoming: damaged,
      contentRotation: 180 as const,
      contentInsets: { top: 47, bottom: 0, left: 0, right: 0 },
    }
    const corner = renderStrip({
      ...props,
      screenEdges: { top: true, bottom: false, left: false, right: true },
    })
    expect(corner.getByTestId("commander-strip-seat-1")).toHaveStyle({ top: 24, right: 12 })
    corner.unmount()

    const inner = renderStrip({
      ...props,
      screenEdges: { top: true, bottom: false, left: true, right: false },
    })
    expect(inner.getByTestId("commander-strip-seat-1")).toHaveStyle({ top: 59 })
  })

  it("turns the attacker's own cell into the finish button", () => {
    const onSubmit = jest.fn()
    const view = renderStrip({
      source: { active: true, flight: makeMutable(1), submit: "done", acted: false, onSubmit },
    })
    const finish = view.getByRole("button", {
      name: "Done assigning commander damage from seat 1",
    })
    expect(finish).toBe(view.getByTestId("commander-exit-seat-1"))
    fireEvent.press(finish)
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it("rings an attacker orange from half of lethal and oxblood within five of it", () => {
    expect([0, 10, 11, 15, 16, 21].map((total) => commanderDamageTier(total, 21))).toEqual([
      "calm",
      "calm",
      "significant",
      "significant",
      "nearLethal",
      "nearLethal",
    ])
  })
})
