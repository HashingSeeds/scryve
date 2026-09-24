import { StyleSheet } from "react-native"
import { act, fireEvent, render } from "@testing-library/react-native"

import { asPlayerId, PLAYER_COLORS } from "@/features/game/domain"
import { ThemeProvider } from "@/theme/context"
import { darkTheme } from "@/theme/theme"
import { accessibleForeground, contrastRatio, relativeLuminance } from "@/utils/colorContrast"

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

  it.each([false, true])(
    "preserves seat colors and theme rounding in local commander modes, compact=%s",
    (compact) => {
      const color = darkTheme.colors.palette.primary200
      const props = {
        playerName: "Ada",
        seatNumber: 1,
        life: 40,
        color,
        compact,
        onChange: jest.fn(),
        commanderDamage: {
          ownerPlayerId: commanderIds[0],
          seats: commanderSeats.seats,
          rows: commanderSeats.rows,
          columns: commanderSeats.columns,
          incoming: {},
          inspection: { open: false, onToggle: jest.fn() },
        },
      }
      const view = render(
        <ThemeProvider initialContext="dark">
          <LifeCard {...props} />
        </ThemeProvider>,
      )
      const radius = compact ? darkTheme.spacing.md : darkTheme.spacing.lg
      expect(StyleSheet.flatten(view.getByTestId("life-card-seat-1").props.style)).toMatchObject({
        backgroundColor: color,
        borderWidth: 0,
        borderRadius: radius,
      })
      expect(StyleSheet.flatten(view.getByTestId("life-total-seat-1").props.style).color).toBe(
        accessibleForeground(color),
      )
      view.rerender(
        <ThemeProvider initialContext="dark">
          <LifeCard
            {...props}
            commanderDamage={{
              ...props.commanderDamage,
              inspection: { open: true, onToggle: jest.fn() },
            }}
          />
        </ThemeProvider>,
      )
      expect(
        StyleSheet.flatten(view.getByTestId("commander-overview-seat-1").props.style),
      ).toMatchObject({ backgroundColor: color, borderRadius: radius })
      for (const armedPlayerId of commanderIds) {
        view.rerender(
          <ThemeProvider initialContext="dark">
            <LifeCard {...props} commanderDamage={{ ...props.commanderDamage, armedPlayerId }} />
          </ThemeProvider>,
        )
        expect(
          StyleSheet.flatten(view.getByTestId("commander-card-mode-seat-1").props.style),
        ).toMatchObject({
          backgroundColor: darkTheme.colors.transparent,
          borderRadius: radius,
          borderWidth: 0,
        })
      }
    },
  )

  it("contains rotated commander labels and controls inside the padded safe area", () => {
    const view = render(
      <ThemeProvider initialContext="dark">
        <LifeCard
          playerName="Ada"
          seatNumber={1}
          life={40}
          color="#41476E"
          compact
          contentRotation={180}
          contentInsets={{ top: 59, bottom: 0, left: 0, right: 0 }}
          onChange={jest.fn()}
          commanderDamage={{
            ownerPlayerId: commanderIds[0],
            seats: commanderSeats.seats,
            rows: commanderSeats.rows,
            columns: commanderSeats.columns,
            incoming: {},
            inspection: { open: false, onToggle: jest.fn() },
            armedPlayerId: commanderIds[1],
            attackerName: "Bo",
            onStage: jest.fn(),
            onPressSword: jest.fn(),
          }}
        />
      </ThemeProvider>,
    )
    expect(
      StyleSheet.flatten(view.getByTestId("commander-card-mode-seat-1").props.style),
    ).toMatchObject({ paddingTop: 59, paddingBottom: 0, paddingLeft: 0, paddingRight: 0 })
    const content = view.getByTestId("commander-card-content-seat-1")
    expect(StyleSheet.flatten(content.props.style)).toMatchObject({ flex: 1 })
    expect(content.findByProps({ testID: "commander-target-seat-1" })).toBeTruthy()
    expect(content.findByProps({ testID: "commander-life-seat-1" })).toBeTruthy()
  })

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

  it("uses a visual player mark alongside a visible name pill", () => {
    const view = renderCard(20)

    expect(view.getByTestId("player-name-seat-1")).toHaveTextContent("Ada")
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

  it("closes the life editor when the card freezes", () => {
    const view = render(interactiveCard(20, jest.fn()))
    fireEvent(view.getByTestId("life-seat-1-1"), "longPress")
    expect(view.getByTestId("life-editor-seat-1")).toBeTruthy()
    view.rerender(
      <ThemeProvider initialContext="light">
        <LifeCard
          playerName="Ada"
          seatNumber={1}
          life={20}
          color="#41476E"
          eliminated
          onChange={jest.fn()}
        />
      </ThemeProvider>,
    )
    expect(view.queryByTestId("life-editor-seat-1")).toBeNull()
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

  it("lets the control zones handle touches at the life total", () => {
    const view = render(interactiveCard(20, jest.fn()))
    expect(view.queryByTestId("life-total-button-seat-1")).toBeNull()
    expect(StyleSheet.flatten(view.getByTestId("life-readout-seat-1").props.style)).toMatchObject({
      justifyContent: "center",
    })
    expect(view.getByTestId("life-readout-seat-1").props.pointerEvents).toBe("none")
  })

  it("opens the seat editor from either control long press", () => {
    const view = render(interactiveCard(20, jest.fn()))
    fireEvent(view.getByTestId("life-seat-1-1"), "longPress")
    expect(view.getByTestId("life-editor-seat-1")).toBeTruthy()
    fireEvent.press(view.getByLabelText("Close life controls"))
    fireEvent(view.getByTestId("life-seat-1--1"), "longPress")
    expect(view.getByTestId("life-editor-seat-1")).toBeTruthy()
  })

  it.each([
    { rotation: 0, menuCorner: "topLeft", top: 66, left: 52, right: 44 },
    { rotation: 90, menuCorner: "topRight", top: 36, left: 74, right: 54 },
    { rotation: -90, menuCorner: "topLeft", top: 26, left: 54, right: 74 },
    { rotation: 180, menuCorner: "bottomRight", top: 46, left: 52, right: 34 },
  ] as const)("keeps the $rotation° editor header clear of the menu and safe area", (entry) => {
    const view = render(
      <ThemeProvider initialContext="dark">
        <LifeCard
          playerName="Ada"
          seatNumber={1}
          life={20}
          color="#41476E"
          contentRotation={entry.rotation}
          contentInsets={{ top: 50, bottom: 30, left: 10, right: 20 }}
          menuCorner={entry.menuCorner}
          onChange={jest.fn()}
        />
      </ThemeProvider>,
    )
    fireEvent(view.getByTestId("life-card-seat-1"), "layout", {
      nativeEvent: { layout: { width: 400, height: 300 } },
    })
    fireEvent(view.getByTestId("life-seat-1-1"), "longPress")
    expect(
      StyleSheet.flatten(view.getByTestId("life-editor-header-seat-1").props.style),
    ).toMatchObject({
      top: entry.top,
      left: entry.left,
      right: entry.right,
    })
  })

  it("aligns a compact editor title with its quick actions", () => {
    const view = render(interactiveCard(20, jest.fn()))
    fireEvent(view.getByTestId("life-card-seat-1"), "layout", {
      nativeEvent: { layout: { width: 200, height: 300 } },
    })
    fireEvent(view.getByTestId("life-seat-1-1"), "longPress")
    const overlay = StyleSheet.flatten(view.getByTestId("life-editor-seat-1").props.style)
    const header = StyleSheet.flatten(view.getByTestId("life-editor-header-seat-1").props.style)
    const actions = StyleSheet.flatten(view.getByTestId("life-editor-actions-seat-1").props.style)
    expect(header.left).toBe(overlay.padding + actions.marginHorizontal)
  })

  it.each(PLAYER_COLORS)("keeps the life editor visibly tied to seat color %s", (color) => {
    const view = render(
      <ThemeProvider initialContext="dark">
        <LifeCard playerName="Ada" seatNumber={1} life={20} color={color} onChange={jest.fn()} />
      </ThemeProvider>,
    )
    fireEvent(view.getByTestId("life-seat-1-1"), "longPress")
    const editor = view.getByTestId("life-editor-seat-1")
    const editorColor = StyleSheet.flatten(editor.props.style).backgroundColor as string
    expect(relativeLuminance(editorColor)).toBeLessThan(relativeLuminance(color) * 0.25)
    expect(contrastRatio("#FFFFFF", editorColor)).toBeGreaterThan(7)
    const title = view.getByTestId("life-editor-title-seat-1")
    expect(title.props.children).toBe("Ada")
    expect(title.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ color: accessibleForeground(editorColor) }),
      ]),
    )
  })

  it("uses Magic quick amounts", () => {
    const onChange = jest.fn()
    const view = render(interactiveCard(20, onChange))
    fireEvent(view.getByTestId("life-seat-1-1"), "longPress")
    fireEvent.press(view.getByTestId("life-editor-step-1--5"))
    expect(onChange).toHaveBeenCalledWith(-5)
    expect(view.getByText("15")).toBeTruthy()
  })

  it("scrubs Magic life one point per step without applying twice", () => {
    const onChange = jest.fn()
    const view = render(interactiveCard(20, onChange))
    fireEvent(view.getByTestId("life-seat-1-1"), "longPress")
    const slider = view.getByTestId("life-editor-slider-seat-1")
    fireEvent(slider, "layout", { nativeEvent: { layout: { width: 200 } } })
    fireEvent(slider, "responderGrant", { nativeEvent: { pageX: 100, pageY: 100 } })
    fireEvent(slider, "responderMove", { nativeEvent: { pageX: 105, pageY: 100 } })
    fireEvent(slider, "responderRelease")
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(1)
    expect(view.getByText("21")).toBeTruthy()
  })

  it("keeps scrubbing while held at the end and stops on release", () => {
    const onChange = jest.fn()
    const view = render(interactiveCard(20, onChange))
    fireEvent(view.getByTestId("life-seat-1-1"), "longPress")
    const slider = view.getByTestId("life-editor-slider-seat-1")
    fireEvent(slider, "layout", { nativeEvent: { layout: { width: 200 } } })
    fireEvent(slider, "responderGrant", { nativeEvent: { pageX: 100, pageY: 100 } })
    fireEvent(slider, "responderMove", { nativeEvent: { pageX: 200, pageY: 100 } })
    expect(
      StyleSheet.flatten(view.getByTestId("life-editor-balloon-pointer-seat-1").props.style),
    ).toMatchObject({ borderTopWidth: 10, borderLeftWidth: 8, borderRightWidth: 8 })
    act(() => jest.advanceTimersByTime(350 + 3 * 110))
    expect(view.getByText("+23")).toBeTruthy()
    fireEvent(slider, "responderRelease")
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(23)
    act(() => jest.advanceTimersByTime(1000))
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it("uses Yu-Gi-Oh! quick amounts and 100 point scrub steps", () => {
    const onChange = jest.fn()
    const view = render(
      <ThemeProvider initialContext="light">
        <LifeCard
          playerName="Ada"
          seatNumber={1}
          life={8000}
          color="#41476E"
          system="ygo"
          onChange={onChange}
        />
      </ThemeProvider>,
    )
    fireEvent(view.getByTestId("life-seat-1-100"), "longPress")
    fireEvent.press(view.getByTestId("life-editor-step-1--50"))
    expect(onChange).toHaveBeenCalledWith(-50)
    const slider = view.getByTestId("life-editor-slider-seat-1")
    fireEvent(slider, "layout", { nativeEvent: { layout: { width: 200 } } })
    fireEvent(slider, "responderGrant", { nativeEvent: { pageX: 100, pageY: 100 } })
    fireEvent(slider, "responderMove", { nativeEvent: { pageX: 101, pageY: 100 } })
    fireEvent(slider, "responderRelease")
    expect(onChange).toHaveBeenLastCalledWith(100)
  })

  it.each([-1, 1])("scrubs Yu-Gi-Oh! by %i × 8,000 at the slider end", (direction) => {
    const onChange = jest.fn()
    const view = render(
      <ThemeProvider initialContext="light">
        <LifeCard
          playerName="Ada"
          seatNumber={1}
          life={8000}
          color="#41476E"
          system="ygo"
          onChange={onChange}
        />
      </ThemeProvider>,
    )
    fireEvent(view.getByTestId("life-seat-1-100"), "longPress")
    expect(view.getByTestId("life-editor-title-seat-1").props.children).toBe("Ada")
    const slider = view.getByTestId("life-editor-slider-seat-1")
    fireEvent(slider, "layout", { nativeEvent: { layout: { width: 200 } } })
    fireEvent(slider, "responderGrant", { nativeEvent: { pageX: 100, pageY: 100 } })
    fireEvent(slider, "responderMove", {
      nativeEvent: { pageX: 100 + direction * 100, pageY: 100 },
    })
    fireEvent(slider, "responderRelease")
    expect(onChange).toHaveBeenCalledWith(direction * 8000)
  })

  it("removes steppers from a view-only card instead of dimming them", () => {
    const view = render(
      <ThemeProvider initialContext="light">
        <LifeCard
          playerName="Grace"
          seatNumber={1}
          life={40}
          color="#41476E"
          ownership="unowned"
          onChange={jest.fn()}
        />
      </ThemeProvider>,
    )
    expect(view.queryByTestId("life-seat-1-1")).toBeNull()
    expect(view.queryByTestId("life-seat-1--1")).toBeNull()
    expect(view.getByTestId("life-total-seat-1")).toBeTruthy()
  })

  it("shows the player name as plain text under the life total", () => {
    const view = renderCard(40)
    const name = view.getByTestId("player-name-seat-1")
    expect(name).toHaveTextContent("Ada")
    expect(StyleSheet.flatten(name.props.style)).toMatchObject({ color: "#FFFFFF" })
    expect(StyleSheet.flatten(name.props.style).backgroundColor).toBeUndefined()
  })

  it("spans the under-total column full width so names truncate late", () => {
    const view = renderCard(20)
    expect(StyleSheet.flatten(view.getByTestId("life-status-seat-1").props.style)).toMatchObject({
      left: 0,
      right: 0,
      top: "50%",
    })
    expect(view.getByTestId("player-name-seat-1")).toHaveTextContent("Ada")
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
