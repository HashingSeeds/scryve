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
        color={players[0].color}
        foreground="#FFFFFF"
        contentRotation={0}
        open={false}
        onToggle={jest.fn()}
        onPressSword={jest.fn()}
        {...props}
      />
    </ThemeProvider>,
  )
}

describe("CommanderStrip", () => {
  it("collapses to the assign sword until someone deals damage", () => {
    const onPressSword = jest.fn()
    const view = renderStrip({ onPressSword })

    expect(view.queryByTestId("commander-map-seat-1")).toBeNull()
    fireEvent.press(view.getByTestId("commander-mark-seat-1"))
    expect(onPressSword).toHaveBeenCalledTimes(1)
  })

  it("clears the card's safe-area inset on its edge", () => {
    const view = renderStrip({
      contentRotation: 180,
      contentInsets: { top: 47, bottom: 0, left: 0, right: 0 },
    })

    expect(view.getByTestId("commander-strip-seat-1")).toHaveStyle({ top: 55 })
  })

  it("maps damage to board positions and opens the grid from a damage disc", () => {
    const onToggle = jest.fn()
    const onPressSword = jest.fn()
    const view = renderStrip({ incoming: { [players[2].id]: 21 }, onToggle, onPressSword })

    const rows = view.getByTestId("commander-map-seat-1").children.map((row) =>
      typeof row === "string"
        ? []
        : [
            ...new Set(
              row
                .findAll((node) => typeof node.props?.testID === "string")
                .map((node) => node.props.testID as string)
                .filter((testID) => testID.startsWith("commander-")),
            ),
          ],
    )
    expect(rows).toEqual([["commander-mark-seat-1"], [`commander-pip-seat-1-${players[2].id}`]])

    const pip = view.getByTestId(`commander-pip-seat-1-${players[2].id}`)
    expect(pip).toHaveTextContent("21")
    expect(pip.props.accessibilityLabel).toBe("Show commander damage for Seat 1, Ada, 21 from Cy")
    fireEvent.press(pip)
    fireEvent.press(view.getByTestId("commander-mark-seat-1"))
    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(onPressSword).toHaveBeenCalledTimes(1)
  })
})
