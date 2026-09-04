import { StyleSheet } from "react-native"
import { act, fireEvent, render } from "@testing-library/react-native"

import { asPlayerId } from "@/features/game/domain"
import { ThemeProvider } from "@/theme/context"

import { commanderBoardSeats } from "./commanderDamageLayout"
import { getPlayerMarkCorner, LifeCard } from "./LifeCard"
import { lifeControlTestId } from "./LifeControls"
import { LIFE_TARGET_SIZE } from "./playerCardTypes"

const commanderIds = [asPlayerId("player-1"), asPlayerId("player-2")]
const commanderSeats = commanderBoardSeats([[0], [1]], commanderIds)

function card(life: number) {
  return (
    <ThemeProvider initialContext="light">
      <LifeCard playerName="Ada" seatNumber={1} life={life} color="#41476E" onChange={jest.fn()} />
    </ThemeProvider>
  )
}

function interactiveCard(life: number, onChange: jest.Mock) {
  return (
    <ThemeProvider initialContext="light">
      <LifeCard playerName="Ada" seatNumber={1} life={life} color="#41476E" onChange={onChange} />
    </ThemeProvider>
  )
}

const renderCard = (life: number) => render(card(life))

describe("LifeCard", () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it("sizes the life total in JavaScript rather than relying on native auto-shrink", () => {
    const twoDigits = StyleSheet.flatten(
      renderCard(20).getByTestId("life-total-seat-1").props.style,
    )
    const sixDigits = StyleSheet.flatten(
      renderCard(123456).getByTestId("life-total-seat-1").props.style,
    )

    expect(twoDigits.fontSize).toBe(120)
    expect(twoDigits.lineHeight).toBe(132)
    expect(sixDigits.fontSize).toBeLessThan(twoDigits.fontSize)
    expect(sixDigits.fontSize * 6 * 0.62).toBeLessThanOrEqual(LIFE_TARGET_SIZE)
  })

  it("keeps life controls unchanged until a life change happens", () => {
    const view = renderCard(20)
    expect(view.getByText("+")).toBeTruthy()
    expect(view.getByText("−")).toBeTruthy()
    expect(view.queryByTestId("life-delta-seat-1")).toBeNull()
  })

  it("uses a visual player mark while keeping the name available to assistive technology", () => {
    const view = renderCard(20)

    expect(view.queryByText("Ada")).toBeNull()
    const marker = view.getByTestId("player-mark-seat-1", { includeHiddenElements: true })
    expect(marker).toBeTruthy()
    expect(StyleSheet.flatten(marker.props.style)).toMatchObject({
      right: 8,
      bottom: 8,
    })
    expect(view.getByTestId("life-card-seat-1").props.accessibilityLabel).toBe("Seat 1, Ada")
  })

  it("pins each rotated player marker to the corner after its life total", () => {
    expect(getPlayerMarkCorner(0, 8)).toMatchObject({ right: 8, bottom: 8 })
    expect(getPlayerMarkCorner(180, 8)).toMatchObject({ left: 8, top: 8 })
    expect(getPlayerMarkCorner(90, 8)).toMatchObject({ left: 8, bottom: 8 })
    expect(getPlayerMarkCorner(-90, 8)).toMatchObject({ right: 8, top: 8 })
  })

  it.each([0, 90, -90, 180] as const)(
    "keeps life status below the total at %s degrees",
    (contentRotation) => {
      const view = render(
        <ThemeProvider initialContext="light">
          <LifeCard
            playerName="Ada"
            seatNumber={1}
            life={20}
            color="#41476E"
            contentRotation={contentRotation}
            pendingCount={1}
            onChange={jest.fn()}
          />
        </ThemeProvider>,
      )

      const statusLayer = StyleSheet.flatten(
        view.getByTestId("life-status-layer-seat-1").props.style,
      )
      expect(statusLayer.transform).toEqual([{ rotate: `${contentRotation}deg` }])
      expect(StyleSheet.flatten(view.getByTestId("life-status-seat-1").props.style)).toMatchObject({
        top: "50%",
        marginTop: 104,
      })
    },
  )

  it("hides the commander grid behind the player mark", () => {
    const view = render(
      <ThemeProvider initialContext="light">
        <LifeCard
          playerName="Ada"
          seatNumber={1}
          life={20}
          color="#41476E"
          commanderDamage={{
            ownerPlayerId: commanderIds[0],
            seats: commanderSeats.seats,
            rows: commanderSeats.rows,
            columns: commanderSeats.columns,
            incoming: {},
          }}
          onChange={jest.fn()}
        />
      </ThemeProvider>,
    )

    expect(view.queryByTestId("commander-board-seat-1")).toBeNull()
    expect(view.getByTestId("commander-mark-seat-1")).toBeTruthy()
  })

  it("expands the commander grid from the player mark and closes it again", () => {
    const view = render(
      <ThemeProvider initialContext="light">
        <LifeCard
          playerName="Ada"
          seatNumber={1}
          life={20}
          color="#41476E"
          commanderDamage={{
            ownerPlayerId: commanderIds[0],
            seats: commanderSeats.seats,
            rows: commanderSeats.rows,
            columns: commanderSeats.columns,
            incoming: {},
          }}
          onChange={jest.fn()}
        />
      </ThemeProvider>,
    )

    fireEvent.press(view.getByTestId("commander-mark-seat-1"))
    expect(view.getByTestId("commander-overview-seat-1")).toBeTruthy()
    expect(view.getByTestId("commander-board-seat-1")).toBeTruthy()
    expect(view.getByTestId("player-mark-close", { includeHiddenElements: true })).toBeTruthy()

    fireEvent.press(view.getByTestId("commander-overview-close-seat-1"))
    act(() => jest.runAllTimers())
    expect(view.queryByTestId("commander-board-seat-1")).toBeNull()
    expect(view.queryByTestId("commander-overview-seat-1")).toBeNull()
    expect(view.queryByTestId("player-mark-close", { includeHiddenElements: true })).toBeNull()
  })

  it("turns the whole defending card into commander damage controls", () => {
    const onStage = jest.fn()
    const view = render(
      <ThemeProvider initialContext="light">
        <LifeCard
          playerName="Grace"
          seatNumber={2}
          life={20}
          color="#397B61"
          commanderDamage={{
            ownerPlayerId: commanderIds[1],
            seats: commanderSeats.seats,
            rows: commanderSeats.rows,
            columns: commanderSeats.columns,
            incoming: { [commanderIds[0]]: 7 },
            armedPlayerId: commanderIds[0],
            attackerName: "Ada",
            stagedAgainstOwner: 4,
            onStage,
          }}
          onChange={jest.fn()}
        />
      </ThemeProvider>,
    )

    expect(view.getByTestId("commander-target-seat-2")).toBeTruthy()
    expect(view.getByText("11")).toBeTruthy()
    expect(view.getByText("↓")).toBeTruthy()
    expect(view.queryByText("from Ada")).toBeNull()
    expect(view.queryByTestId(lifeControlTestId(2, 1))).toBeNull()

    fireEvent.press(view.getByTestId("commander-stage-seat-2-1"))
    fireEvent.press(view.getByTestId("commander-stage-seat-2--1"))
    expect(onStage.mock.calls).toEqual([[1], [-1]])
  })

  it("turns the attacking card into the assignment exit", () => {
    const onPressSword = jest.fn()
    const view = render(
      <ThemeProvider initialContext="light">
        <LifeCard
          playerName="Ada"
          seatNumber={1}
          life={20}
          color="#41476E"
          commanderDamage={{
            ownerPlayerId: commanderIds[0],
            seats: commanderSeats.seats,
            rows: commanderSeats.rows,
            columns: commanderSeats.columns,
            incoming: {},
            armedPlayerId: commanderIds[0],
            onPressSword,
          }}
          onChange={jest.fn()}
        />
      </ThemeProvider>,
    )

    expect(view.getByText("Done")).toBeTruthy()
    fireEvent.press(view.getByTestId("commander-done-seat-1"))
    expect(onPressSword).toHaveBeenCalledTimes(1)
  })

  it("turns the defender's card into a claim decision", () => {
    const onConfirm = jest.fn()
    const onDecline = jest.fn()
    const view = render(
      <ThemeProvider initialContext="light">
        <LifeCard
          playerName="Ada"
          seatNumber={1}
          life={20}
          color="#41476E"
          commanderDamage={{
            ownerPlayerId: commanderIds[0],
            seats: commanderSeats.seats,
            rows: commanderSeats.rows,
            columns: commanderSeats.columns,
            incoming: {},
            pendingClaims: [
              {
                claimId: "claim-1",
                attackerName: "Grace",
                delta: 4,
                onConfirm,
                onDecline,
              },
            ],
          }}
          onChange={jest.fn()}
        />
      </ThemeProvider>,
    )

    expect(view.getByText("Grace dealt 4")).toBeTruthy()
    fireEvent.press(view.getByTestId("commander-confirm-seat-1-claim-1"))
    fireEvent.press(view.getByTestId("commander-decline-seat-1-claim-1"))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onDecline).toHaveBeenCalledTimes(1)
  })

  it("keeps claim text readable on the dark overlay for light seat colors", () => {
    const view = render(
      <ThemeProvider initialContext="light">
        <LifeCard
          playerName="Ada"
          seatNumber={1}
          life={20}
          color="#F5F0E6"
          commanderDamage={{
            ownerPlayerId: commanderIds[0],
            seats: commanderSeats.seats,
            rows: commanderSeats.rows,
            columns: commanderSeats.columns,
            incoming: {},
            pendingClaims: [
              {
                claimId: "claim-1",
                attackerName: "Grace",
                delta: 4,
                onConfirm: jest.fn(),
                onDecline: jest.fn(),
              },
            ],
          }}
          onChange={jest.fn()}
        />
      </ThemeProvider>,
    )

    const headline = StyleSheet.flatten(view.getByText("Grace dealt 4").props.style)
    const caption = StyleSheet.flatten(view.getByText("Confirm commander damage").props.style)
    expect(headline.color).toBe("#FFFFFF")
    expect(caption.color).toBe("#FFFFFF")
  })

  it("closes the life editor without saving once the card freezes", () => {
    const onChange = jest.fn()
    const unfrozen = (
      <ThemeProvider initialContext="light">
        <LifeCard playerName="Ada" seatNumber={1} life={20} color="#41476E" onChange={onChange} />
      </ThemeProvider>
    )
    const view = render(unfrozen)
    fireEvent(view.getByTestId("life-total-button-seat-1"), "longPress")
    fireEvent.changeText(view.getByTestId("life-editor-input-seat-1"), "37")
    expect(view.getByTestId("life-editor-dialog-seat-1")).toBeTruthy()

    view.rerender(
      <ThemeProvider initialContext="light">
        <LifeCard
          playerName="Ada"
          seatNumber={1}
          life={20}
          color="#41476E"
          eliminated
          onChange={onChange}
        />
      </ThemeProvider>,
    )

    expect(view.queryByTestId("life-editor-dialog-seat-1")).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
  })

  it("keeps the marker cornered instead of clamping it into a cramped card", () => {
    expect(getPlayerMarkCorner(90, 8)).toMatchObject({ left: 8, bottom: 8 })
    expect(getPlayerMarkCorner(180, 8)).toMatchObject({ left: 8, top: 8 })
  })

  it("keeps the marker cornered after measuring a cramped sideways card", () => {
    const view = render(
      <ThemeProvider initialContext="light">
        <LifeCard
          playerName="Ada"
          seatNumber={1}
          life={20}
          color="#41476E"
          contentRotation={90}
          onChange={jest.fn()}
        />
      </ThemeProvider>,
    )

    fireEvent(view.getByTestId("life-card-seat-1"), "layout", {
      nativeEvent: { layout: { width: 181, height: 400, x: 0, y: 0 } },
    })

    const marker = view.getByTestId("player-mark-seat-1", { includeHiddenElements: true })
    expect(StyleSheet.flatten(marker.props.style)).toMatchObject({
      left: 8,
      bottom: 8,
    })
  })

  it("temporarily moves positive feedback into the plus control", () => {
    const view = renderCard(20)
    view.rerender(card(21))
    view.rerender(card(22))
    expect(view.getByText("+2")).toBeTruthy()
    expect(view.getByText("−")).toBeTruthy()
    expect(view.queryByTestId("life-delta-seat-1")).toBeNull()
  })

  it("temporarily moves negative feedback into the minus control", () => {
    const view = renderCard(20)
    view.rerender(card(15))
    expect(view.getByText("-5")).toBeTruthy()
    expect(view.getByText("+")).toBeTruthy()
    act(() => jest.advanceTimersByTime(2000))
    expect(view.getByText("−")).toBeTruthy()
  })

  it("uses a circular life target to set a new total", () => {
    const onChange = jest.fn()
    const view = render(interactiveCard(20, onChange))
    const target = view.getByTestId("life-total-button-seat-1")

    expect(StyleSheet.flatten(target.props.style)).toMatchObject({
      width: 200,
      height: 200,
      borderRadius: 100,
    })
    expect(StyleSheet.flatten(target.props.style).borderWidth).toBeUndefined()
    expect(StyleSheet.flatten(view.getByTestId("life-readout-seat-1").props.style)).toMatchObject({
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      justifyContent: "center",
    })
    expect(view.getByTestId("life-total-seat-1").props.adjustsFontSizeToFit).toBeUndefined()
    fireEvent(target, "longPress")
    fireEvent.changeText(view.getByTestId("life-editor-input-seat-1"), "37")
    fireEvent.press(view.getByTestId("life-editor-apply-seat-1"))

    expect(onChange).toHaveBeenCalledWith(17)
    expect(view.queryByTestId("life-editor-dialog-seat-1")).toBeNull()
  })

  it.each([
    ["life-seat-1-1", "8", 8, "Add life"],
    ["life-seat-1--1", "6", -6, "Subtract life"],
  ])("opens custom amount editing from a long press on %s", (testID, value, delta, title) => {
    const onChange = jest.fn()
    const view = render(interactiveCard(20, onChange))

    fireEvent(view.getByTestId(testID), "longPress")
    expect(view.getAllByText(title)).toHaveLength(2)
    fireEvent.changeText(view.getByTestId("life-editor-input-seat-1"), value)
    fireEvent.press(view.getByTestId("life-editor-apply-seat-1"))

    expect(onChange).toHaveBeenCalledWith(delta)
  })

  it("rejects zero for add and subtract amounts", () => {
    const view = render(interactiveCard(20, jest.fn()))

    fireEvent(view.getByTestId("life-seat-1-1"), "longPress")
    fireEvent.changeText(view.getByTestId("life-editor-input-seat-1"), "0")

    expect(view.getByTestId("life-editor-apply-seat-1").props.accessibilityState.disabled).toBe(
      true,
    )
    expect(view.getByText("Enter a whole number from 1 to 999999.")).toBeTruthy()
  })

  it("mounts no commander board unless the game asks for one", () => {
    const view = renderCard(40)
    expect(view.queryByTestId("commander-board-seat-1")).toBeNull()
    expect(view.queryByTestId("life-eliminated-seat-1")).toBeNull()
  })

  it("freezes an eliminated card without ending the game", () => {
    const onChange = jest.fn()
    const view = render(
      <ThemeProvider initialContext="light">
        <LifeCard
          playerName="Ada"
          seatNumber={1}
          life={13}
          color="#41476E"
          eliminated
          onChange={onChange}
        />
      </ThemeProvider>,
    )
    expect(view.getByTestId("life-eliminated-seat-1")).toBeTruthy()
    act(() => {
      fireEvent.press(view.getByTestId(lifeControlTestId(1, -1)))
      fireEvent.press(view.getByTestId(lifeControlTestId(1, 1)))
    })
    expect(onChange).not.toHaveBeenCalled()
    expect(view.getByTestId("life-total-seat-1").props.children).toBe("13")
  })
})
