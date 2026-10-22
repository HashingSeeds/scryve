import { fireEvent, render, waitFor } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { FeedbackThreadScreen } from "./FeedbackThreadScreen"
import type { Id } from "../../convex/_generated/dataModel"

const thread = {
  request: {
    _id: "r1" as Id<"feedbackRequests">,
    kind: "bug" as const,
    title: "Crash on launch",
    body: "Every time",
    status: "planned" as const,
    votes: 0,
    shippedIn: undefined,
    createdAt: 0,
    voted: false,
    reported: false,
    mine: true,
    published: false,
    unread: true,
    linked: false,
    updatedAt: 0,
    canLink: false,
    original: null,
  },
  messages: [
    {
      _id: "m1" as Id<"feedbackMessages">,
      createdAt: 0,
      from: "team" as const,
      body: "Which phone?",
    },
  ],
}

describe("FeedbackThreadScreen", () => {
  it("shows the team's reply and sends the player's answer", async () => {
    const onReply = jest.fn(async () => undefined)
    const view = render(
      <ThemeProvider initialContext="dark">
        <FeedbackThreadScreen
          thread={thread}
          onReply={onReply}
          onIncludeAccount={jest.fn()}
          onSignIn={jest.fn()}
          onBack={jest.fn()}
        />
      </ThemeProvider>,
    )
    expect(view.getByText("Scryve")).toBeTruthy()
    expect(view.getByText("Which phone?")).toBeTruthy()
    fireEvent.changeText(view.getByPlaceholderText("Add a detail or answer a question"), "Pixel 9")
    fireEvent.press(view.getByText("Send"))
    await waitFor(() => expect(onReply).toHaveBeenCalledWith("Pixel 9"))
    expect(view.getByText("Sign in to keep this thread if you reinstall")).toBeTruthy()
    expect(view.queryByText("Edited by Scryve")).toBeNull()
  })

  it("shows what the player sent before Scryve edited it", () => {
    const view = render(
      <ThemeProvider initialContext="dark">
        <FeedbackThreadScreen
          thread={{
            ...thread,
            request: { ...thread.request, original: { title: "crash!!", body: "it broke" } },
          }}
          onReply={jest.fn()}
          onIncludeAccount={jest.fn()}
          onSignIn={jest.fn()}
          onBack={jest.fn()}
        />
      </ThemeProvider>,
    )
    expect(view.getByText("Edited by Scryve")).toBeTruthy()
    expect(view.queryByText("it broke")).toBeNull()
    fireEvent.press(view.getByText("Show what you sent"))
    expect(view.getByText("it broke")).toBeTruthy()
  })
})
