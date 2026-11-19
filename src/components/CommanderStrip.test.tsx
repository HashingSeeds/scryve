import { render, within } from "@testing-library/react-native"

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

  it("shows the whole board, with the card's own seat holding its plain mark, and reads out the damage taken", () => {
    const view = renderStrip({ incoming: damaged })

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
      within(
        view.getByTestId("commander-own-seat-1", { includeHiddenElements: true }),
      ).queryByTestId("player-mark-sword", { includeHiddenElements: true }),
    ).toBeNull()
    expect(
      view.getByTestId(`commander-pip-seat-1-${players[2].id}`, { includeHiddenElements: true }),
    ).toHaveTextContent("21")
    expect(view.getByLabelText("Seat 1, Ada, 21 from Cy")).toBeTruthy()
    expect(view.queryAllByRole("button")).toHaveLength(0)
  })

  it("sits in the head corner, tucked into a screen corner but clear of a mid-edge notch", () => {
    const props = {
      incoming: damaged,
      contentInsets: { top: 47, bottom: 0, left: 0, right: 0 },
    }
    const corner = renderStrip({
      ...props,
      screenEdges: { top: true, bottom: false, left: true, right: false },
    })
    expect(corner.getByTestId("commander-strip-seat-1")).toHaveStyle({ top: 24, left: 12 })
    corner.unmount()

    const inner = renderStrip({
      ...props,
      screenEdges: { top: true, bottom: false, left: false, right: true },
    })
    expect(inner.getByTestId("commander-strip-seat-1")).toHaveStyle({ top: 59 })
  })

  it("steps along its edge by half the pentagon when the menu sits on its corner", () => {
    const upright = renderStrip({ incoming: damaged, menuCorner: "topLeft" })
    expect(upright.getByTestId("commander-strip-seat-1")).toHaveStyle({ top: 12, left: 52 })
    upright.unmount()

    const sideways = renderStrip({ incoming: damaged, contentRotation: 90, menuCorner: "topRight" })
    expect(sideways.getByTestId("commander-strip-seat-1")).toHaveStyle({ right: 12, top: 52 })
    sideways.unmount()

    const elsewhere = renderStrip({ incoming: damaged, menuCorner: "bottomRight" })
    expect(elsewhere.getByTestId("commander-strip-seat-1")).toHaveStyle({ top: 12, left: 12 })
  })

  it("lights the attacker's square and labels its total while it attacks", () => {
    const view = renderStrip({ attack: { attackerId: players[1].id } })
    expect(view.getByTestId("commander-lit-seat-1")).toBeTruthy()
    expect(view.getByLabelText("0 commander damage from Bo")).toBeTruthy()
  })

  it("cuts one square across for partners that have both dealt damage, each half tiered against lethal on its own", () => {
    const cy = players[2].id
    const view = renderStrip({ incoming: damaged, split: { [cy]: [21, 5] } })
    const half = (suffix: string) =>
      view.getByTestId(`commander-pip-seat-1-${cy}${suffix}`, { includeHiddenElements: true })
    expect(half("")).toHaveTextContent("21")
    expect(half("-partner")).toHaveTextContent("5")
    // why: a 26pt square cut across by a 1pt gap.
    expect(half("")).toHaveStyle({ height: 12.5, borderBottomWidth: 0 })
    expect(half("-partner")).toHaveStyle({ height: 12.5, borderTopWidth: 0 })
    expect(half("")).toHaveStyle({ borderWidth: 2.5, backgroundColor: "#FFFFFF" })
    expect(half("-partner")).toHaveStyle({ borderWidth: 1, backgroundColor: "#3A7358" })
    view.unmount()

    const one = renderStrip({ incoming: damaged, split: { [cy]: [21, 0] } })
    expect(
      one.queryByTestId(`commander-pip-seat-1-${cy}-partner`, { includeHiddenElements: true }),
    ).toBeNull()
  })

  it("rims an attacker from half of lethal and fills its disc with the seat's ink within five of it", () => {
    const [, bo, cy] = players.map(({ id }) => id)
    const count = (view: ReturnType<typeof renderStrip>, id: string, total: string) =>
      within(
        view.getByTestId(`commander-pip-seat-1-${id}`, { includeHiddenElements: true }),
      ).getByText(total, { includeHiddenElements: true })
    const view = renderStrip({ incoming: { [bo]: 12, [cy]: 17 } })
    expect(
      view.getByTestId(`commander-pip-seat-1-${bo}`, { includeHiddenElements: true }),
    ).toHaveStyle({ borderWidth: 2.5, backgroundColor: "#B85535" })
    expect(
      view.getByTestId(`commander-pip-seat-1-${cy}`, { includeHiddenElements: true }),
    ).toHaveStyle({ backgroundColor: "#FFFFFF" })
    expect(count(view, cy, "17")).toHaveStyle({ color: "#3A7358" })
    view.unmount()

    const pale = renderStrip({
      players: [players[0], { ...players[1], color: "#F2D45C" }, players[2]],
      incoming: { [bo]: 19 },
    })
    expect(count(pale, bo, "19")).toHaveStyle({ color: "#000000" })
    pale.unmount()

    const dark = renderStrip({ foreground: "#000000", incoming: { [bo]: 19 } })
    expect(count(dark, bo, "19")).toHaveStyle({ color: "#FFFFFF" })
  })

  it("tiers an attacker's total at half of lethal and within five of it", () => {
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
