import { fireEvent, render } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { SupportScreen } from "./SupportScreen"

describe("SupportScreen", () => {
  it("renders help content and exposes support actions", () => {
    const onEmailSupport = jest.fn()
    const onOpenPrivacy = jest.fn()
    const onOpenTerms = jest.fn()
    const onOpenEula = jest.fn()
    const onOpenCookiePolicy = jest.fn()
    const view = render(
      <ThemeProvider initialContext="dark">
        <SupportScreen
          onBack={jest.fn()}
          onEmailSupport={onEmailSupport}
          onOpenPrivacy={onOpenPrivacy}
          onOpenTerms={onOpenTerms}
          onOpenEula={onOpenEula}
          onOpenCookiePolicy={onOpenCookiePolicy}
        />
      </ThemeProvider>,
    )

    expect(view.getByText("Getting started")).toBeTruthy()
    expect(view.getByText("Frequently asked questions")).toBeTruthy()
    fireEvent.press(view.getByText("Email support"))
    fireEvent.press(view.getByText("Privacy Policy"))
    fireEvent.press(view.getByText("Terms of Use"))
    fireEvent.press(view.getByText("EULA"))
    fireEvent.press(view.getByText("Cookie Policy"))
    expect(onEmailSupport).toHaveBeenCalledTimes(1)
    expect(onOpenPrivacy).toHaveBeenCalledTimes(1)
    expect(onOpenTerms).toHaveBeenCalledTimes(1)
    expect(onOpenEula).toHaveBeenCalledTimes(1)
    expect(onOpenCookiePolicy).toHaveBeenCalledTimes(1)
  })
})
