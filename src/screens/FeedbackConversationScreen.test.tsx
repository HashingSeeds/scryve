import { fireEvent, render } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import {
  FeedbackConversationScreen,
  type FeedbackConversationScreenProps,
} from "./FeedbackConversationScreen"
import type { Id } from "../../convex/_generated/dataModel"

const request = {
  _id: "r1" as Id<"feedbackRequests">,
  kind: "feature" as const,
  body: "Two-Headed Giant mode. Teams of two share 30 life.",
  createdAt: 0,
  unread: false,
  linked: false,
  updatedAt: 0,
  canLink: true,
  linkedElsewhere: false,
}
const teamReply = {
  _id: "m1" as Id<"feedbackMessages">,
  createdAt: 0,
  from: "team" as const,
  body: "Poison too?",
}

function renderConversation(overrides: Partial<FeedbackConversationScreenProps> = {}) {
  const props: FeedbackConversationScreenProps = {
    started: false,
    thread: undefined,
    kind: "feature",
    draft: "",
    screenshot: null,
    signedIn: false,
    includeAccount: false,
    online: true,
    showOffline: false,
    onKind: jest.fn(),
    onDraft: jest.fn(),
    onSend: jest.fn(),
    onPickScreenshot: jest.fn(),
    onRemoveScreenshot: jest.fn(),
    onIncludeAccount: jest.fn(),
    onLinkAccount: jest.fn(),
    onSignIn: jest.fn(),
    onOpenPrivacy: jest.fn(),
    onBack: jest.fn(),
    ...overrides,
  }
  const view = render(
    <ThemeProvider initialContext="dark">
      <FeedbackConversationScreen {...props} />
    </ThemeProvider>,
  )
  return { props, view }
}

describe("FeedbackConversationScreen", () => {
  it("sends a typed message, but not an empty one, offline, or before its thread loads", () => {
    const { props, view } = renderConversation({ draft: "Crash on rotate" })
    fireEvent.press(view.getByLabelText("Add screenshot"))
    expect(props.onPickScreenshot).toHaveBeenCalled()
    fireEvent.press(view.getByLabelText("Send"))
    expect(props.onSend).toHaveBeenCalled()

    const empty = renderConversation()
    fireEvent.press(empty.view.getByLabelText("Send"))
    expect(empty.props.onSend).not.toHaveBeenCalled()

    const offline = renderConversation({ draft: "Please", online: false })
    fireEvent.press(offline.view.getByLabelText("Send"))
    expect(offline.props.onSend).not.toHaveBeenCalled()
    expect(offline.view.queryByText(/^Offline\./)).toBeNull()
    expect(
      renderConversation({ online: false, showOffline: true }).view.getByText(/^Offline\./),
    ).toBeTruthy()

    const loading = renderConversation({ draft: "Please", started: true, thread: undefined })
    fireEvent.press(loading.view.getByLabelText("Send"))
    expect(loading.props.onSend).not.toHaveBeenCalled()
  })

  it("asks a question for each kind, and links the Privacy Policy", () => {
    const feature = renderConversation()
    expect(feature.view.getByText("What would you like to see?")).toBeTruthy()
    fireEvent.press(feature.view.getByText("Privacy"))
    expect(feature.props.onOpenPrivacy).toHaveBeenCalled()

    const bug = renderConversation({ kind: "bug" })
    expect(bug.view.getByText("What went wrong?")).toBeTruthy()
  })

  it("shows the thread as messages, marking the player's latest as sent", () => {
    const { view } = renderConversation({
      started: true,
      thread: { request, messages: [teamReply] },
    })
    expect(view.getByText(request.body)).toBeTruthy()
    expect(view.getByText("Poison too?")).toBeTruthy()
    expect(view.getByText(/You · .* · Sent/)).toBeTruthy()
    expect(view.queryByLabelText("Add screenshot")).toBeNull()
  })

  it("shows a message on its way, then lets the player include their account", () => {
    const sending = renderConversation({
      started: true,
      thread: { request, messages: [] },
      outgoing: "One more thing",
    })
    expect(sending.view.getByText("You · Sending…")).toBeTruthy()

    const { props, view } = renderConversation({
      started: true,
      thread: { request, messages: [] },
    })
    fireEvent.press(view.getByText("Include it"))
    expect(props.onLinkAccount).toHaveBeenCalled()
  })
})
