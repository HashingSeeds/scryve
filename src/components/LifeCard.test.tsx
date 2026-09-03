import { StyleSheet } from "react-native"
import { act, fireEvent, render } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"
import { asPlayerId } from "@/features/game/domain"

import { getCommanderDamageLaneStyle, getPlayerMarkPlacement, LifeCard } from "./LifeCard"
import { lifeControlTestId } from "./LifeControls"
import { LIFE_TARGET_SIZE } from "./playerCardTypes"
import { commanderBoardSeats } from "./commanderDamageLayout"

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

    expect(twoDigits.fontSize).toBe(60)
    expect(twoDigits.lineHeight).toBe(66)
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
      left: "50%",
      marginLeft: -14,
      bottom: "50%",
      marginBottom: 74,
    })
    expect(view.getByTestId("life-card-seat-1").props.accessibilityLabel).toBe("Seat 1, Ada")
  })

  it("places each rotated player marker above its life total", () => {
    expect(getPlayerMarkPlacement(0, 44, 66, 8)).toMatchObject({
      bottom: "50%",
      marginBottom: 74,
      marginLeft: -14,
    })
    expect(getPlayerMarkPlacement(180, 44, 66, 8)).toMatchObject({
      top: "50%",
      marginTop: 74,
      marginLeft: -14,
    })
    expect(getPlayerMarkPlacement(90, 44, 66, 8)).toMatchObject({
      left: "50%",
      marginLeft: 74,
      marginTop: -14,
    })
    expect(getPlayerMarkPlacement(-90, 44, 66, 8)).toMatchObject({
      right: "50%",
      marginRight: 74,
      marginTop: -14,
    })
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
        marginTop: 62,
      })
    },
  )

  it("keeps commander steppers inward from the card edge", () => {
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

    expect(
      StyleSheet.flatten(view.getByTestId("commander-position-seat-1").props.style),
    ).toMatchObject({
      bottom: 0,
      height: "50%",
      justifyContent: "center",
    })
  })

  it.each([
    [0, { left: 0, right: 0, bottom: 0, height: 242, paddingBottom: 29 }],
    [90, { left: 0, top: 0, bottom: 0, width: 170, paddingLeft: 29 }],
    [-90, { right: 0, top: 0, bottom: 0, width: 170, paddingRight: 29 }],
    [180, { left: 0, right: 0, top: 0, height: 242, paddingTop: 29 }],
  ] as const)("places the commander lane in the outer half at %s degrees", (rotation, style) => {
    expect(getCommanderDamageLaneStyle(rotation, { width: 456, height: 600 }, 58)).toEqual(style)
  })

  it("uses the same centered outer lane for compact commander boards", () => {
    const view = render(
      <ThemeProvider initialContext="light">
        <LifeCard
          playerName="Ada"
          seatNumber={1}
          life={20}
          color="#41476E"
          compact
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

    expect(
      StyleSheet.flatten(view.getByTestId("commander-position-seat-1").props.style),
    ).toMatchObject({
      bottom: 0,
      height: "50%",
      justifyContent: "center",
    })
  })

  it("keeps a player marker inside a cramped card edge", () => {
    expect(getPlayerMarkPlacement(90, 44, 66, 8, 181)).toMatchObject({
      left: "50%",
      marginLeft: 38.5,
      marginTop: -14,
    })
    expect(getPlayerMarkPlacement(180, 44, 66, 8, 170)).toMatchObject({
      top: "50%",
      marginTop: 33,
      marginLeft: -14,
    })
  })

  it("repositions the marker after measuring a cramped sideways card", () => {
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
      left: "50%",
      marginLeft: 38.5,
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
      width: 116,
      height: 116,
      borderRadius: 58,
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
