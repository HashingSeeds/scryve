import { fireEvent, render } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { AccountScreen } from "./AccountScreen"

const renderScreen = (props: Partial<React.ComponentProps<typeof AccountScreen>> = {}) =>
  render(
    <ThemeProvider initialContext="light">
      <AccountScreen onManageProfile={jest.fn()} onSignOut={jest.fn()} {...props} />
    </ThemeProvider>,
  )

describe("AccountScreen", () => {
  it("falls back to the email when no name is set", () => {
    const view = renderScreen({ email: "ada@example.com" })

    expect(view.getByText("ada@example.com")).toBeTruthy()
    expect(view.getByText("A")).toBeTruthy()
  })

  it("marks the account as signed in when nothing identifies it", () => {
    const view = renderScreen()

    expect(view.getByText("Signed in")).toBeTruthy()
    expect(view.getByText("?")).toBeTruthy()
  })

  it("disables sign out while it is in flight", () => {
    const onSignOut = jest.fn()
    const view = renderScreen({ isSigningOut: true, onSignOut })

    fireEvent.press(view.getByTestId("sign-out-button"))

    expect(view.getByText("Signing out…")).toBeTruthy()
    expect(onSignOut).not.toHaveBeenCalled()
  })
})
