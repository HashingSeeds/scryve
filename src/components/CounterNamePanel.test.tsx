import { StyleSheet, View } from "react-native"
import { fireEvent, render } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import {
  CounterNameHostContext,
  CounterNameSlot,
  namePanelLayout,
  useCounterNameBoard,
  type CounterNameRequest,
} from "./CounterNamePanel"

const board = { x: 0, y: 0, width: 393, height: 852 }

function request(closeTop: number): CounterNameRequest {
  return {
    seatNumber: 1,
    color: "#3a6",
    rotation: 90,
    close: { left: 160, top: closeTop, size: 30, glyph: 15, slop: {} },
    taken: [],
    onAdd: jest.fn(),
    onClose: jest.fn(),
  }
}

function Board({ open }: { open?: CounterNameRequest }) {
  const names = useCounterNameBoard({ area: board, safe: board })
  return (
    <ThemeProvider initialContext="dark">
      <View testID="row" onLayout={names.onRowLayout(0)}>
        <View testID="cell" onLayout={names.onCellLayout("a", 0)}>
          <CounterNameHostContext.Provider value={names.hostFor("a")}>
            {open ? (
              <CounterNameSlot request={open} cardSize={{ width: 195, height: 424 }} />
            ) : null}
          </CounterNameHostContext.Provider>
        </View>
      </View>
      {names.panels}
    </ThemeProvider>
  )
}

const safe = { x: 0, y: 59, width: 393, height: 759 }
const contains = (
  outer: { x: number; y: number; width: number; height: number },
  inner: typeof outer,
) =>
  outer.x <= inner.x &&
  outer.y <= inner.y &&
  outer.x + outer.width >= inner.x + inner.width &&
  outer.y + outer.height >= inner.y + inner.height

describe("namePanelLayout", () => {
  it("stretches a short side seat along its column to full-size keys", () => {
    const seat = { x: 0, y: 0, width: 195, height: 280 }
    const layout = namePanelLayout({
      seat,
      board,
      safe,
      rotation: 90,
      close: { left: 236, top: 153, size: 30 },
    })

    expect(layout.keyWidth).toBe(44)
    expect(contains(layout.rect, seat)).toBe(true)
    expect(contains(board, layout.rect)).toBe(true)
    expect(layout.rect.height).toBeGreaterThan(470)
    expect(layout.rect.width - seat.width).toBeGreaterThan(40)
    expect(layout.rect.width - seat.width).toBeLessThan(70)
  })

  it("gives an upright end seat the ten keys its width allows and grows it toward the centre", () => {
    const seat = { x: 0, y: 0, width: 393, height: 100 }
    const layout = namePanelLayout({
      seat,
      board,
      safe,
      rotation: 180,
      close: { left: 351, top: 58, size: 30 },
    })

    expect(layout.keyWidth).toBeGreaterThan(33)
    expect(layout.keyWidth).toBeLessThan(35)
    expect(layout.rect).toMatchObject({ x: 0, y: 0, width: 393 })
    expect(layout.rect.height).toBeGreaterThan(230)
  })
})

const layout = (width: number, height: number) => ({
  nativeEvent: { layout: { x: 0, y: 0, width, height } },
})

describe("CounterNameSlot", () => {
  it("moves an open panel's close button when its seat resizes", () => {
    const view = render(<Board />)
    fireEvent(view.getByTestId("row"), "layout", layout(393, 424))
    fireEvent(view.getByTestId("cell"), "layout", layout(195, 424))
    view.rerender(<Board open={request(382)} />)
    const top = () => StyleSheet.flatten(view.getByTestId("counter-close-1").props.style).top
    const before = top()

    view.rerender(<Board open={request(282)} />)

    expect(top()).toBe(before - 100)
  })
})
