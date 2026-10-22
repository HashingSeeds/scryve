import { fireEvent, render } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { SupportScreen, type SupportScreenProps } from "./SupportScreen"
import type { Id } from "../../convex/_generated/dataModel"

const request = {
  _id: "r1" as Id<"feedbackRequests">,
  kind: "feature" as const,
  title: "Timer for tournament rounds",
  body: "A 50 minute round clock.",
  status: "planned" as const,
  votes: 3,
  shippedIn: undefined,
  createdAt: 0,
  voted: false,
  reported: false,
  mine: false,
}

function renderSupport(overrides: Partial<SupportScreenProps> = {}) {
  const props: SupportScreenProps = {
    unread: 0,
    search: "",
    searched: "",
    results: undefined,
    offline: false,
    voteFailed: false,
    onBack: jest.fn(),
    onSearch: jest.fn(),
    onVote: jest.fn(),
    onOpen: jest.fn(),
    onAllRequests: jest.fn(),
    onYourRequests: jest.fn(),
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
  it("leads with requests, then email, and keeps the help content", () => {
    const { props, view } = renderSupport({ unread: 2 })
    expect(view.getAllByText("Support").length).toBeGreaterThan(0)
    expect(view.queryByText("SCRYVE")).toBeNull()
    expect(view.queryByText("Contact us")).toBeNull()
    fireEvent.press(view.getByText("All requests"))
    fireEvent.press(view.getByText("2 new"))
    fireEvent.press(view.getByText("Account, billing, or anything private"))
    fireEvent.press(view.getByText("Suggest a feature or report a bug"))
    expect(props.onAllRequests).toHaveBeenCalledTimes(1)
    expect(props.onYourRequests).toHaveBeenCalledTimes(1)
    expect(props.onEmailSupport).toHaveBeenCalledTimes(1)
    expect(props.onSuggest).toHaveBeenCalledTimes(1)
    expect(view.getByText("Getting started")).toBeTruthy()
    expect(view.getByText("Restore Scryve Pro")).toBeTruthy()
  })

  it("searches in place: answers and requests replace the page, and nothing found offers to suggest it", () => {
    const { props, view } = renderSupport({
      search: "restore",
      searched: "restore",
      results: [request],
    })
    expect(view.getByText("Restore Scryve Pro")).toBeTruthy()
    expect(view.queryByText("Manage or cancel a subscription")).toBeNull()
    expect(view.queryByText("All requests")).toBeNull()
    fireEvent.press(view.getByText("A 50 minute round clock."))
    expect(props.onOpen).toHaveBeenCalledWith(request)
    fireEvent.press(view.getByLabelText("Vote for Timer for tournament rounds, 3 votes"))
    expect(props.onVote).toHaveBeenCalledWith(request, true)

    expect(
      renderSupport({ search: "ti", searched: "ti", results: [] }).view.queryByText(
        "Manage or cancel a subscription",
      ),
    ).toBeNull()

    const empty = renderSupport({ search: "poison", searched: "poison", results: [] })
    fireEvent.press(empty.view.getByText("Suggest “poison”"))
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
