import { fireEvent, render } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { FeedbackSuggestScreen, type FeedbackSuggestScreenProps } from "./FeedbackSuggestScreen"

function renderSuggest(overrides: Partial<FeedbackSuggestScreenProps> = {}) {
  const props: FeedbackSuggestScreenProps = {
    kind: "feature",
    body: "",
    includeAccount: false,
    screenshot: null,
    signedIn: false,
    offline: false,
    sending: false,
    onKind: jest.fn(),
    onBody: jest.fn(),
    onIncludeAccount: jest.fn(),
    onPickScreenshot: jest.fn(),
    onRemoveScreenshot: jest.fn(),
    onSignIn: jest.fn(),
    onOpenPrivacy: jest.fn(),
    onSend: jest.fn(),
    onBack: jest.fn(),
    ...overrides,
  }
  const view = render(
    <ThemeProvider initialContext="dark">
      <FeedbackSuggestScreen {...props} />
    </ThemeProvider>,
  )
  return { props, view }
}

describe("FeedbackSuggestScreen", () => {
  it("sends once there's a message, and offers a screenshot only for bugs", () => {
    const { props, view } = renderSuggest({ kind: "bug", body: "Crash on rotate" })
    fireEvent.press(view.getByText("Add screenshot"))
    expect(props.onPickScreenshot).toHaveBeenCalled()
    fireEvent.press(view.getByText("Sign in to keep it"))
    expect(props.onSignIn).toHaveBeenCalled()
    fireEvent.press(view.getByText("Send"))
    expect(props.onSend).toHaveBeenCalled()

    const empty = renderSuggest()
    expect(empty.view.queryByText("Add screenshot")).toBeNull()
    fireEvent.press(empty.view.getByText("Send"))
    expect(empty.props.onSend).not.toHaveBeenCalled()
  })

  it("says the send waits while offline and shows a refusal", () => {
    const { props, view } = renderSuggest({
      body: "Please",
      offline: true,
      error: "Too many sends. Try again in 12 minutes.",
    })
    fireEvent.press(view.getByText("Send when online"))
    expect(props.onSend).toHaveBeenCalled()
    expect(view.getByText("Too many sends. Try again in 12 minutes.")).toBeTruthy()
  })
})
