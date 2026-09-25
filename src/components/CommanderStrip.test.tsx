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
  it("shows each opponent's damage without opening the grid", () => {
    const onToggle = jest.fn()
    const onPressSword = jest.fn()
    const view = renderStrip({ incoming: { [players[1].id]: 21 }, onToggle, onPressSword })

    expect(view.getByTestId("commander-own-seat-1")).toBeTruthy()
    expect(view.getByTestId(`commander-pip-seat-1-${players[1].id}`)).toHaveTextContent("21")
    expect(view.getByTestId(`commander-pip-seat-1-${players[2].id}`)).not.toHaveTextContent("0")

    const inspect = view.getByTestId("commander-inspect-seat-1")
    expect(inspect.props.accessibilityLabel).toBe(
      "Show commander damage for Seat 1, Ada, 21 from Bo",
    )
    fireEvent.press(inspect)
    fireEvent.press(view.getByTestId("commander-mark-seat-1"))
    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(onPressSword).toHaveBeenCalledTimes(1)
  })

  it("lays opponents out in the board's rows", () => {
    const view = renderStrip()
    const rows = view
      .getByTestId("commander-inspect-seat-1")
      .children.filter((child) => typeof child !== "string")
      .map((row) => [
        ...new Set(
          row
            .findAll((node) => typeof node.props?.testID === "string")
            .map((node) => node.props.testID as string)
            .filter((testID) => testID.startsWith("commander-")),
        ),
      ])
      .filter((row) => row.length > 0)

    expect(rows).toEqual([
      ["commander-own-seat-1", `commander-pip-seat-1-${players[1].id}`],
      [`commander-pip-seat-1-${players[2].id}`],
    ])
  })

  it("keeps the inspect and assign controls when player metadata is absent", () => {
    const onToggle = jest.fn()
    const onPressSword = jest.fn()
    const view = renderStrip({ players: [], onToggle, onPressSword })

    expect(view.getByTestId("commander-inspect-seat-1").props.accessibilityLabel).toBe(
      "Show commander damage for Seat 1, Ada, no commander damage",
    )
    fireEvent.press(view.getByTestId("commander-inspect-seat-1"))
    fireEvent.press(view.getByTestId("commander-mark-seat-1"))
    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(onPressSword).toHaveBeenCalledTimes(1)
  })
})
