import { useState } from "react"
import { act, render } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { Sheet } from "./Sheet.android"
import { Text } from "./Text"

const mockPresented = jest.fn()

jest.mock("@expo/ui/jetpack-compose", () => {
  const { forwardRef, useEffect, useImperativeHandle } =
    jest.requireActual<typeof import("react")>("react")
  const { View } = jest.requireActual<typeof import("react-native")>("react-native")
  const Pass = ({ children }: { children?: React.ReactNode }) => <View>{children}</View>
  return {
    Host: Pass,
    Column: Pass,
    RNHostView: Pass,
    // why: the native sheet presents on mount and stays hidden after hide(), so only a remount shows it again.
    ModalBottomSheet: forwardRef(function ModalBottomSheet(
      { children }: { children?: React.ReactNode },
      ref,
    ) {
      useImperativeHandle(ref, () => ({ hide: () => Promise.resolve() }))
      useEffect(() => mockPresented(), [])
      return <View>{children}</View>
    }),
  }
})
jest.mock("@expo/ui/jetpack-compose/modifiers", () => ({ fillMaxHeight: () => ({}) }))

function Menu() {
  const [visible, setVisible] = useState(true)
  const [reopened, setReopened] = useState(false)
  return (
    <ThemeProvider initialContext="dark">
      <Sheet
        visible={visible}
        onClose={() => setVisible(false)}
        onDismissed={() => {
          if (reopened) return
          setReopened(true)
          setVisible(true)
        }}
      >
        <Text
          text={reopened ? "Systems" : "Actions"}
          testID="close"
          onPress={() => setVisible(false)}
        />
      </Sheet>
    </ThemeProvider>
  )
}

it("presents a new native sheet when onDismissed reopens it", async () => {
  const view = render(<Menu />)
  expect(mockPresented).toHaveBeenCalledTimes(1)

  await act(async () => view.getByTestId("close").props.onPress())

  expect(view.getByText("Systems")).toBeTruthy()
  expect(mockPresented).toHaveBeenCalledTimes(2)
})
