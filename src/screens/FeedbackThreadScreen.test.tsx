import { fireEvent, render } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { FeedbackThreadScreen, type FeedbackThreadScreenProps } from "./FeedbackThreadScreen"
import type { Id } from "../../convex/_generated/dataModel"

const request = {
  _id: "r1" as Id<"feedbackRequests">,
  kind: "feature" as const,
  title: "Two-Headed Giant mode",
  body: "Teams of two share 30 life.",
  status: "shipped" as const,
  votes: 1,
  shippedIn: "2.1.0",
  createdAt: 0,
  voted: false,
  reported: false,
  mine: true,
  published: true,
  unread: false,
  linked: false,
  updatedAt: 0,
  canLink: false,
  linkedElsewhere: false,
  original: null as { title: string; body: string } | null,
}
const messages = [
  { _id: "m1" as Id<"feedbackMessages">, createdAt: 0, from: "team" as const, body: "Poison too?" },
]

function renderThread(overrides: Partial<FeedbackThreadScreenProps> = {}) {
  const props: FeedbackThreadScreenProps = {
    thread: { request, messages },
    unsent: [],
    offline: false,
    onReply: jest.fn(),
    onDiscard: jest.fn(),
    onIncludeAccount: jest.fn(),
    onSignIn: jest.fn(),
    onBack: jest.fn(),
    ...overrides,
  }
  const view = render(
    <ThemeProvider initialContext="dark">
      <FeedbackThreadScreen {...props} />
    </ThemeProvider>,
  )
  return { props, view }
}

describe("FeedbackThreadScreen", () => {
  it("heads with the title, sends a reply, and shows one waiting offline", () => {
    const { props, view } = renderThread({
      offline: true,
      unsent: [{ operationId: "op1", body: "Life only" }],
    })
    expect(view.getByRole("header", { name: "Two-Headed Giant mode" })).toBeTruthy()
    expect(view.getByText("Public")).toBeTruthy()
    expect(view.getByText("Poison too?")).toBeTruthy()
    expect(view.getByText("Waiting for connection. Sends when you're back.")).toBeTruthy()
    fireEvent.changeText(view.getByPlaceholderText("Add a detail or answer a question"), "More")
    fireEvent.press(view.getByText("Send when online"))
    expect(props.onReply).toHaveBeenCalledWith("More")
  })

  it("reveals the original behind an expandable disclosure", () => {
    const { view } = renderThread({
      thread: { request: { ...request, original: { title: "2HG", body: "it broke" } }, messages },
    })
    const toggle = view.getByRole("button", { name: "Edited by Scryve · show what you sent" })
    expect(toggle.props.accessibilityState).toMatchObject({ expanded: false })
    fireEvent.press(toggle)
    expect(view.getByText("it broke")).toBeTruthy()
    expect(
      view.getByRole("button", { name: "Edited by Scryve · hide what you sent" }).props
        .accessibilityState,
    ).toMatchObject({ expanded: true })
  })

  it("hides the account switch when the request belongs to another account", () => {
    const { view } = renderThread({
      thread: {
        request: { ...request, canLink: true, linked: true, linkedElsewhere: true },
        messages,
      },
    })
    expect(view.queryByTestId("feedback-thread-account")).toBeNull()
    expect(view.getByText("Sent with a different account")).toBeTruthy()
  })
})
