import { useState } from "react"
import { Pressable } from "react-native"
import Stack from "expo-router/stack"
import { act, fireEvent, renderRouter, testRouter } from "expo-router/testing-library"

import { useCloseOnBack } from "./useCloseOnBack"
import { mockHardwareBack } from "../../test/support/hardwareBack"

describe("useCloseOnBack", () => {
  it("leaves Back to the navigator while the screen with the open overlay is covered", () => {
    const pressBack = mockHardwareBack()
    const onClose = jest.fn()
    function Board() {
      const [open, setOpen] = useState(false)
      useCloseOnBack(open, onClose)
      return <Pressable accessibilityLabel="Open overlay" onPress={() => setOpen(true)} />
    }
    const view = renderRouter({ _layout: () => <Stack />, index: Board, decks: () => null })
    fireEvent.press(view.getByLabelText("Open overlay"))

    testRouter.push("/decks")
    act(() => void pressBack())

    expect(onClose).not.toHaveBeenCalled()
    expect(view.getPathname()).toBe("/")

    act(() => void pressBack())

    expect(onClose).toHaveBeenCalledTimes(1)
    jest.restoreAllMocks()
  })
})
