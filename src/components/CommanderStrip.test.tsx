import { fireEvent, render } from "@testing-library/react-native"

import { asPlayerId } from "@/features/game/domain"
import type { GamePlayer } from "@/features/game/types"
import { ThemeProvider } from "@/theme/context"

import { commanderBoardSeats } from "./commanderDamageLayout"
import { CommanderStrip, type CommanderStripProps } from "./CommanderStrip"

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
        foreground="#FFFFFF"
        contentRotation={0}
        open={false}
        onToggle={jest.fn()}
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

  it("tucks into the screen corner instead of clearing the full notch inset", () => {
    const view = renderStrip({
      incoming: damaged,
      contentRotation: 180,
      contentInsets: { top: 47, bottom: 0, left: 0, right: 0 },
    })

    expect(view.getByTestId("commander-strip-seat-1")).toHaveStyle({ top: 24, left: 8, right: 8 })
  })

  it("shows the whole board, with the card's own seat as a muted mark", () => {
    const onToggle = jest.fn()
    const view = renderStrip({ incoming: damaged, onToggle })

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
    expect(view.queryByTestId("commander-mark-seat-1")).toBeNull()
    expect(view.getByTestId(`commander-pip-seat-1-${players[2].id}`)).toHaveTextContent("21")

    const idle = view.getByTestId(`commander-pip-seat-1-${players[1].id}`)
    expect(idle).not.toHaveTextContent("0")
    expect(idle.props.accessibilityLabel).toBe("Show commander damage for Seat 1, Ada, 0 from Bo")
    fireEvent.press(idle)
    expect(onToggle).toHaveBeenCalledTimes(1)
  })
})
