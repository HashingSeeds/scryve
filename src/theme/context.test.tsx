import { StyleSheet, View, type ViewStyle } from "react-native"
import { render } from "@testing-library/react-native"

import { ThemeProvider, useAppTheme } from "./context"

const registered = StyleSheet.create({ base: { flex: 1, opacity: 0.8 } })

function ThemedView() {
  const { themed } = useAppTheme()
  return (
    <View
      testID="themed-view"
      style={themed<ViewStyle>([
        registered.base,
        false,
        [({ colors }) => ({ backgroundColor: colors.background }), { opacity: 1 }],
      ])}
    />
  )
}

describe("ThemeProvider", () => {
  it("resolves theme functions with React Native style flattening semantics", () => {
    const view = render(
      <ThemeProvider initialContext="dark">
        <ThemedView />
      </ThemeProvider>,
    )

    expect(view.getByTestId("themed-view").props.style).toMatchObject({
      flex: 1,
      opacity: 1,
      backgroundColor: "#191015",
    })
  })
})
