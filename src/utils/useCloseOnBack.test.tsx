import { type ContextType } from "react"
import { act, render } from "@testing-library/react-native"
import { NavigationContext } from "expo-router/react-navigation"

import { useCloseOnBack } from "./useCloseOnBack"
import { mockHardwareBack } from "../../test/support/hardwareBack"

type Navigation = NonNullable<ContextType<typeof NavigationContext>>

function fakeScreen() {
  let focused = true
  const listeners = new Set<() => void>()
  const screen = {
    isFocused: () => focused,
    addListener: (_event: "focus" | "blur", listener: () => void) => {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
  }
  return {
    navigation: screen as unknown as Navigation,
    setFocused(next: boolean) {
      focused = next
      listeners.forEach((listener) => listener())
    },
  }
}

function Board({ onClose }: { onClose: () => void }) {
  useCloseOnBack(true, onClose)
  return null
}

describe("useCloseOnBack", () => {
  afterEach(() => jest.restoreAllMocks())

  it("leaves Back to the navigator while the screen with the open overlay is covered", () => {
    const pressBack = mockHardwareBack()
    const onClose = jest.fn()
    const screen = fakeScreen()
    render(
      <NavigationContext.Provider value={screen.navigation}>
        <Board onClose={onClose} />
      </NavigationContext.Provider>,
    )

    act(() => screen.setFocused(false))

    expect(pressBack()).toBe(false)
    expect(onClose).not.toHaveBeenCalled()

    act(() => screen.setFocused(true))

    expect(pressBack()).toBe(true)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
