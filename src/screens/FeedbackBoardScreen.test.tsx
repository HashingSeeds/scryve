import { fireEvent, render } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { FeedbackBoardScreen } from "./FeedbackBoardScreen"
import type { Id } from "../../convex/_generated/dataModel"

const item = {
  _id: "r1" as Id<"feedbackRequests">,
  kind: "feature" as const,
  title: "Sync timers",
  body: "Keep the clock on every phone.",
  status: "shipped" as const,
  votes: 4,
  shippedIn: "2.1.0",
  createdAt: 0,
  voted: true,
  reported: false,
  mine: false,
}

function renderBoard(overrides: Partial<Parameters<typeof FeedbackBoardScreen>[0]> = {}) {
  const props = {
    items: [item],
    filter: "all" as const,
    unread: 0,
    onFilter: jest.fn(),
    onVote: jest.fn(),
    onOpen: jest.fn(),
    onReport: jest.fn(),
    onSuggest: jest.fn(),
    onMine: jest.fn(),
    onBack: jest.fn(),
    ...overrides,
  }
  return {
    props,
    view: render(
      <ThemeProvider initialContext="dark">
        <FeedbackBoardScreen {...props} />
      </ThemeProvider>,
    ),
  }
}

describe("FeedbackBoardScreen", () => {
  it("shows the shipped version and takes back a vote", () => {
    const { props, view } = renderBoard()
    expect(view.getByText("Shipped in 2.1.0")).toBeTruthy()
    fireEvent.press(view.getByLabelText("Remove your vote for Sync timers, 4 votes"))
    expect(props.onVote).toHaveBeenCalledWith(item, false)
  })

  it("asks before reporting someone else's request", () => {
    const { props, view } = renderBoard()
    fireEvent.press(view.getByLabelText("Report Sync timers"))
    expect(props.onReport).not.toHaveBeenCalled()
    fireEvent.press(view.getAllByText("Report").at(-1)!)
    expect(props.onReport).toHaveBeenCalledWith(item)
  })

  it("counts unread replies on My requests", () => {
    const { props, view } = renderBoard({ unread: 2 })
    fireEvent.press(view.getByText("My requests · 2 new"))
    expect(props.onMine).toHaveBeenCalled()
  })

  it("opens only the player's own requests", () => {
    const { props, view } = renderBoard({
      items: [item, { ...item, _id: "r2" as Id<"feedbackRequests">, title: "Mine", mine: true }],
    })
    fireEvent.press(view.getByText("Sync timers"))
    fireEvent.press(view.getByText("Mine"))
    expect(props.onOpen).toHaveBeenCalledTimes(1)
    expect(props.onOpen).toHaveBeenCalledWith(expect.objectContaining({ title: "Mine" }))
  })
})
