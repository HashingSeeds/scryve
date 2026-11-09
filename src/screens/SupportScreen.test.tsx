import { fireEvent, render } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { matchesWords, SupportScreen, type SupportScreenProps } from "./SupportScreen"

function renderSupport(overrides: Partial<SupportScreenProps> = {}) {
  const props: SupportScreenProps = {
    unread: 0,
    hasFeedback: false,
    onBack: jest.fn(),
    onYourFeedback: jest.fn(),
    onEmailSupport: jest.fn(),
    onSuggest: jest.fn(),
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
  it("leads with suggesting a feature or reporting a bug, each preselected", () => {
    const { props, view } = renderSupport()
    fireEvent.press(view.getByText("Suggest a feature"))
    fireEvent.press(view.getByText("Report a bug"))
    fireEvent.press(view.getByText("Account or billing questions"))
    expect(props.onSuggest).toHaveBeenNthCalledWith(1, { kind: "feature" })
    expect(props.onSuggest).toHaveBeenNthCalledWith(2, { kind: "bug" })
    expect(props.onEmailSupport).toHaveBeenCalledTimes(1)
    expect(view.queryByText("Your feedback")).toBeNull()
  })

  it("shows your feedback once there is some, with its unread count", () => {
    const { props, view } = renderSupport({ hasFeedback: true, unread: 2 })
    fireEvent.press(view.getByText("2 new"))
    expect(props.onYourFeedback).toHaveBeenCalledTimes(1)
  })

  it("filters answers in place, and nothing found offers to ask us", () => {
    const { view } = renderSupport()
    const search = view.getByLabelText("Search help")
    fireEvent.changeText(search, "restore")
    expect(view.getByText("Restore Scryve Pro")).toBeTruthy()
    expect(view.queryByText("Manage or cancel a subscription")).toBeNull()

    fireEvent.changeText(search, "ti")
    expect(view.queryByText("Manage or cancel a subscription")).toBeNull()

    const empty = renderSupport()
    fireEvent.changeText(empty.view.getByLabelText("Search help"), "poison")
    fireEvent.press(empty.view.getByText("Ask us about “poison”"))
    expect(empty.props.onSuggest).toHaveBeenCalledWith({ kind: "feature", message: "poison" })
  })

  it("matches word starts, but anywhere in text written without spaces", () => {
    expect(matchesWords("Manage subscriptions", "ti")).toBe(false)
    expect(matchesWords("Manage subscriptions", "sub")).toBe(true)
    expect(matchesWords("サブスクリプションを管理", "スクリプ")).toBe(true)
  })
})
