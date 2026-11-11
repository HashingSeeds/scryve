import { AccessibilityInfo, StyleSheet } from "react-native"
import * as Haptics from "expo-haptics"
import { act, fireEvent, render, within } from "@testing-library/react-native"

import { localGameRepository } from "@/features/game/localPersistence"
import { ThemeProvider } from "@/theme/context"
import { resetReducedMotionCacheForTests } from "@/utils/useReducedMotion"

import { LifeEditor, lifeEditorValueLayout } from "./LifeEditor"

function editor(
  size: Partial<
    Pick<Parameters<typeof LifeEditor>[0], "cardWidth" | "cardHeight" | "rotation">
  > = {},
) {
  const onChange = jest.fn()
  const onClose = jest.fn()
  const view = render(
    <ThemeProvider initialContext="dark">
      <LifeEditor
        seatNumber={1}
        playerName="Ada"
        life={40}
        sourceFontSize={96}
        system="mtg"
        color="#41476E"
        rotation={0}
        cardWidth={360}
        cardHeight={320}
        {...size}
        onChange={onChange}
        onClose={onClose}
      />
    </ThemeProvider>,
  )
  return { view, onChange, onClose }
}

describe("LifeEditor", () => {
  it("reaches -7 in three taps with Magic's 1, 5 and 10 steps", () => {
    const { view, onChange, onClose } = editor()
    for (const step of [-5, -1, -1]) fireEvent.press(view.getByTestId(`life-editor-step-1-${step}`))
    expect(onChange.mock.calls).toEqual([[-5], [-1], [-1]])
    expect(view.getByTestId("life-editor-step-1-10")).toBeTruthy()
    expect(onClose).not.toHaveBeenCalled()
  })

  it("closes on a tap on its backdrop, and on the X", () => {
    const backdrop = editor()
    fireEvent(backdrop.view.getByTestId("life-editor-seat-1"), "responderRelease")
    expect(backdrop.onClose).toHaveBeenCalledTimes(1)

    const close = editor()
    fireEvent.press(close.view.getByTestId("life-editor-close-seat-1"))
    expect(close.onClose).toHaveBeenCalledTimes(1)
  })

  it("keeps the total at the seat's board size when the seat has room", () => {
    const { view } = editor()
    const value = within(view.getByTestId("life-editor-value-seat-1")).getByText("40")
    expect(StyleSheet.flatten(value.props.style).fontSize).toBe(96)
  })

  it("shrinks the total on a short sideways seat only as far as the controls need", () => {
    const header = { top: 12, left: 12, right: 12 }
    const short = lifeEditorValueLayout({
      width: 430,
      height: 197,
      compact: true,
      sourceFontSize: 120,
      digits: 2,
      header,
    })
    expect(short.fontSize).toBe(105)
    expect(short.titleRoom).toBeCloseTo((430 - 105 * 1.28) / 2 - 12 - 8)
    expect(
      lifeEditorValueLayout({
        width: 394,
        height: 425,
        compact: false,
        sourceFontSize: 150,
        digits: 2,
        header: { top: 16, left: 20, right: 20 },
      }),
    ).toEqual({ fontSize: 150, titleRoom: undefined })

    const { view } = editor({ cardWidth: 197, cardHeight: 430, rotation: 90 })
    const value = within(view.getByTestId("life-editor-value-seat-1")).getByText("40")
    expect(StyleSheet.flatten(value.props.style).fontSize).toBe(
      lifeEditorValueLayout({
        width: 430,
        height: 197,
        compact: true,
        sourceFontSize: 96,
        digits: 2,
        header,
      }).fontSize,
    )
  })

  it("drags to -7 in whole steps, showing the amount and ticking each step", async () => {
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(false)
    resetReducedMotionCacheForTests()
    jest.mocked(Haptics.selectionAsync).mockClear()
    const settings = localGameRepository.loadSettings()
    localGameRepository.saveSettings({ ...settings, hapticsEnabled: true })
    const { view, onChange } = editor()
    await act(async () => undefined)
    const slider = view.getByTestId("life-editor-slider-seat-1")
    fireEvent(slider, "layout", { nativeEvent: { layout: { width: 400 } } })
    expect(view.getByTestId("life-editor-ticks-seat-1").children).toHaveLength(41)
    fireEvent(slider, "responderGrant", { nativeEvent: { pageX: 300, pageY: 100 } })
    fireEvent(slider, "responderMove", { nativeEvent: { pageX: 230, pageY: 100 } })
    expect(view.getByTestId("life-editor-balloon-seat-1")).toHaveTextContent("-7")
    expect(view.getByTestId("life-editor-value-seat-1")).toHaveTextContent("33")
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1)
    fireEvent(slider, "responderMove", { nativeEvent: { pageX: 227, pageY: 100 } })
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1)
    fireEvent(slider, "responderMove", { nativeEvent: { pageX: 222, pageY: 100 } })
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(2)
    fireEvent(slider, "responderRelease")
    expect(onChange).toHaveBeenCalledWith(-8)
    localGameRepository.saveSettings(settings)
    jest.restoreAllMocks()
    resetReducedMotionCacheForTests()
  })

  it("spaces steps a finger apart on a short track", () => {
    const { view, onChange } = editor()
    const slider = view.getByTestId("life-editor-slider-seat-1")
    fireEvent(slider, "layout", { nativeEvent: { layout: { width: 160 } } })
    expect(view.getByTestId("life-editor-ticks-seat-1").children).toHaveLength(21)
    fireEvent(slider, "responderGrant", { nativeEvent: { pageX: 100, pageY: 100 } })
    fireEvent(slider, "responderMove", { nativeEvent: { pageX: 124, pageY: 100 } })
    fireEvent(slider, "responderRelease")
    expect(onChange).toHaveBeenCalledWith(3)
  })
})
