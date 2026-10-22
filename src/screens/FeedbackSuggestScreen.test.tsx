import { fireEvent, render } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { FeedbackSuggestScreen, type FeedbackSuggestScreenProps } from "./FeedbackSuggestScreen"
import type { Id } from "../../convex/_generated/dataModel"

const match = {
  _id: "r2" as Id<"feedbackRequests">,
  kind: "feature" as const,
  title: "Timer for tournament rounds",
  body: "A 50 minute round clock.",
  status: "building" as const,
  votes: 4,
  shippedIn: undefined,
  createdAt: 0,
  voted: false,
  reported: false,
  mine: false,
}

function renderSuggest(overrides: Partial<FeedbackSuggestScreenProps> = {}) {
  const props: FeedbackSuggestScreenProps = {
    step: 1,
    kind: "feature",
    title: "",
    body: "",
    includeAccount: false,
    screenshot: null,
    signedIn: false,
    matches: undefined,
    offline: false,
    sending: false,
    voteFailed: false,
    onKind: jest.fn(),
    onTitle: jest.fn(),
    onBody: jest.fn(),
    onIncludeAccount: jest.fn(),
    onContinue: jest.fn(),
    onEditTitle: jest.fn(),
    onPickScreenshot: jest.fn(),
    onRemoveScreenshot: jest.fn(),
    onSignIn: jest.fn(),
    onOpenPrivacy: jest.fn(),
    onSend: jest.fn(),
    onVote: jest.fn(),
    onOpen: jest.fn(),
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
  it("fills the space under the title with matches to vote on", () => {
    expect(
      renderSuggest().view.getByText("Requests like yours show here as you type."),
    ).toBeTruthy()
    expect(
      renderSuggest({ title: "poison", matches: [] }).view.getByText("Nothing like it yet."),
    ).toBeTruthy()

    const { props, view } = renderSuggest({ title: "timer", matches: [match] })
    expect(view.getByText("Already asked? Vote instead.")).toBeTruthy()
    fireEvent.press(view.getByLabelText("Vote for Timer for tournament rounds, 4 votes"))
    expect(props.onVote).toHaveBeenCalledWith(match, true)
    fireEvent.press(view.getByText("A 50 minute round clock."))
    expect(props.onOpen).toHaveBeenCalledWith(match)
    fireEvent.press(view.getByText("Continue"))
    expect(props.onContinue).toHaveBeenCalled()
  })

  it("shows step 2 with the typed title, a way back, and a screenshot only for bugs", () => {
    const { props, view } = renderSuggest({
      step: 2,
      kind: "bug",
      title: "Crash on rotate",
      body: "x",
    })
    expect(view.getByText("Crash on rotate")).toBeTruthy()
    fireEvent.press(view.getByText("Edit title"))
    expect(props.onEditTitle).toHaveBeenCalled()
    fireEvent.press(view.getByText("Add screenshot"))
    expect(props.onPickScreenshot).toHaveBeenCalled()
    fireEvent.press(view.getByText("Sign in to keep it"))
    expect(props.onSignIn).toHaveBeenCalled()
    expect(
      renderSuggest({ step: 2, title: "Dark mode", body: "x" }).view.queryByText("Add screenshot"),
    ).toBeNull()
  })

  it("says the send waits while offline and shows a refusal", () => {
    const { props, view } = renderSuggest({
      step: 2,
      title: "Dark mode",
      body: "Please",
      offline: true,
      error: "Too many sends. Try again in 12 minutes.",
    })
    fireEvent.press(view.getByText("Send when online"))
    expect(props.onSend).toHaveBeenCalled()
    expect(view.getByText("Too many sends. Try again in 12 minutes.")).toBeTruthy()
  })
})
