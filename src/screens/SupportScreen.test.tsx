import { fireEvent, render } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { SupportScreen } from "./SupportScreen"

describe("SupportScreen", () => {
  it("renders help content and exposes support actions", () => {
    const onEmailSupport = jest.fn()
    const onOpenPrivacy = jest.fn()
    const onOpenTerms = jest.fn()
    const onOpenCookiePolicy = jest.fn()
    const view = render(
      <ThemeProvider initialContext="dark">
        <SupportScreen
          onBack={jest.fn()}
          onEmailSupport={onEmailSupport}
          onOpenPrivacy={onOpenPrivacy}
          onOpenTerms={onOpenTerms}
          onOpenCookiePolicy={onOpenCookiePolicy}
        />
      </ThemeProvider>,
    )

    expect(view.getByText("Getting started")).toBeTruthy()
    expect(view.getByText("Frequently asked questions")).toBeTruthy()
    expect(view.getByText("Start a game")).toBeTruthy()
    expect(view.getByText("Restore Scryve Pro")).toBeTruthy()
    fireEvent.press(view.getByText("Email support"))
    fireEvent.press(view.getByText("Privacy Policy"))
    fireEvent.press(view.getByText("Terms of Use"))
    fireEvent.press(view.getByText("Cookie Policy"))
    expect(onEmailSupport).toHaveBeenCalledTimes(1)
    expect(onOpenPrivacy).toHaveBeenCalledTimes(1)
    expect(onOpenTerms).toHaveBeenCalledTimes(1)
    expect(onOpenCookiePolicy).toHaveBeenCalledTimes(1)
  })

  it("shows the app version when one is provided", () => {
    const view = render(
      <ThemeProvider initialContext="dark">
        <SupportScreen
          onBack={jest.fn()}
          onEmailSupport={jest.fn()}
          onOpenPrivacy={jest.fn()}
          onOpenTerms={jest.fn()}
          onOpenCookiePolicy={jest.fn()}
          appVersion="1.2.3"
        />
      </ThemeProvider>,
    )

    expect(view.getByText("Scryve 1.2.3")).toBeTruthy()
  })

  it("hides the license agreement link when no handler is provided", () => {
    const view = render(
      <ThemeProvider initialContext="dark">
        <SupportScreen
          onBack={jest.fn()}
          onEmailSupport={jest.fn()}
          onOpenPrivacy={jest.fn()}
          onOpenTerms={jest.fn()}
          onOpenCookiePolicy={jest.fn()}
        />
      </ThemeProvider>,
    )

    expect(view.queryByText("License Agreement")).toBeNull()
  })

  it("opens the license agreement when a handler is provided", () => {
    const onOpenLicenseAgreement = jest.fn()
    const view = render(
      <ThemeProvider initialContext="dark">
        <SupportScreen
          onBack={jest.fn()}
          onEmailSupport={jest.fn()}
          onOpenPrivacy={jest.fn()}
          onOpenTerms={jest.fn()}
          onOpenLicenseAgreement={onOpenLicenseAgreement}
          onOpenCookiePolicy={jest.fn()}
        />
      </ThemeProvider>,
    )

    fireEvent.press(view.getByText("License Agreement"))
    expect(onOpenLicenseAgreement).toHaveBeenCalledTimes(1)
  })
})
