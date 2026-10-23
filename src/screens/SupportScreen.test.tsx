import { fireEvent, render } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { SupportScreen, type SupportScreenProps } from "./SupportScreen"

function renderSupport(overrides: Partial<SupportScreenProps> = {}) {
  const props: SupportScreenProps = {
    unread: 0,
    offline: false,
    onBack: jest.fn(),
    onYourFeedback: jest.fn(),
    onEmailSupport: jest.fn(),
    onSuggest: jest.fn(),
    onOpenPrivacy: jest.fn(),
    onOpenTerms: jest.fn(),
    onOpenCookiePolicy: jest.fn(),
    ...overrides,
  }
  const view = render(
    <ThemeProvider initialContext="dark">
      <SupportScreen {...props} />
    </ThemeProvider>,
  )
  return { props, view }
}

describe("SupportScreen", () => {
  it("leads with your feedback, then email, and keeps the help content", () => {
    const { props, view } = renderSupport({ unread: 2 })
    expect(view.getAllByText("Support").length).toBeGreaterThan(0)
    expect(view.queryByText("SCRYVE")).toBeNull()
    expect(view.queryByText("Contact us")).toBeNull()
    fireEvent.press(view.getByText("2 new"))
    fireEvent.press(view.getByText("Account or billing questions"))
    fireEvent.press(view.getByText("Suggest a feature or report a bug"))
    expect(props.onYourFeedback).toHaveBeenCalledTimes(1)
    expect(props.onEmailSupport).toHaveBeenCalledTimes(1)
    expect(props.onSuggest).toHaveBeenCalledTimes(1)
    expect(view.getByText("Getting started")).toBeTruthy()
    expect(view.getByText("Restore Scryve Pro")).toBeTruthy()
  })

  it("searches answers in place, and nothing found offers to ask us", () => {
    const { view } = renderSupport()
    const search = view.getByLabelText("Search help")
    fireEvent.changeText(search, "restore")
    expect(view.getByText("Restore Scryve Pro")).toBeTruthy()
    expect(view.queryByText("Manage or cancel a subscription")).toBeNull()
    expect(view.queryByText("Your feedback")).toBeNull()

    fireEvent.changeText(search, "ti")
    expect(view.queryByText("Manage or cancel a subscription")).toBeNull()

    const empty = renderSupport()
    fireEvent.changeText(empty.view.getByLabelText("Search help"), "poison")
    fireEvent.press(empty.view.getByText("Ask us about “poison”"))
    expect(empty.props.onSuggest).toHaveBeenCalledWith("poison")
  })

  it("opens the legal documents and shows the app version", () => {
    const onOpenLicenseAgreement = jest.fn()
    const { props, view } = renderSupport({ appVersion: "1.2.3", onOpenLicenseAgreement })
    fireEvent.press(view.getByText("Privacy Policy"))
    fireEvent.press(view.getByText("Terms of Use"))
    fireEvent.press(view.getByText("Cookie Policy"))
    fireEvent.press(view.getByText("License Agreement"))
    expect(props.onOpenPrivacy).toHaveBeenCalledTimes(1)
    expect(props.onOpenTerms).toHaveBeenCalledTimes(1)
    expect(props.onOpenCookiePolicy).toHaveBeenCalledTimes(1)
    expect(onOpenLicenseAgreement).toHaveBeenCalledTimes(1)
    expect(view.getByText("Scryve 1.2.3")).toBeTruthy()
  })

  it("hides the license agreement link without a handler", () => {
    expect(renderSupport().view.queryByText("License Agreement")).toBeNull()
  })
})
