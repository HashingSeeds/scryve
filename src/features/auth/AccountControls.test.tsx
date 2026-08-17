import { fireEvent, render } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { AccountProfile } from "./AccountControls"

jest.mock("@clerk/expo/native", () => {
  const { View } = jest.requireActual("react-native")
  return {
    UserProfileView: (props: object) => <View testID="native-user-profile" {...props} />,
  }
})

describe("AccountControls", () => {
  it("fills the account route and owns its back navigation", () => {
    const onBack = jest.fn()
    const view = render(
      <ThemeProvider initialContext="light">
        <AccountProfile onBack={onBack} />
      </ThemeProvider>,
    )
    expect(view.getByTestId("native-user-profile")).toHaveStyle({ flex: 1 })
    expect(view.getByTestId("native-user-profile").props.isDismissible).toBe(false)
    fireEvent.press(view.getByRole("button", { name: "Back" }))
    expect(onBack).toHaveBeenCalledTimes(1)
  })
})
