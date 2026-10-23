import { fireEvent, render } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { FeedbackBoardScreen, type FeedbackBoardScreenProps } from "./FeedbackBoardScreen"
import type { Id } from "../../convex/_generated/dataModel"

const item = {
  _id: "r1" as Id<"feedbackRequests">,
  kind: "feature" as const,
  title: "Timer for tournament rounds",
  body: "A 50 minute round clock.",
  status: "shipped" as const,
  votes: 1,
  shippedIn: "2.1.0",
  createdAt: 0,
  voted: true,
  reported: false,
  mine: false,
}

function renderBoard(overrides: Partial<FeedbackBoardScreenProps> = {}) {
  const props: FeedbackBoardScreenProps = {
    items: [item],
    search: "",
    searched: "",
    tab: "all",
    unread: 0,
    offline: false,
    voteFailed: false,
    onSearch: jest.fn(),
    onTab: jest.fn(),
    onVote: jest.fn(),
    onOpen: jest.fn(),
    onSuggest: jest.fn(),
    onMine: jest.fn(),
    onBack: jest.fn(),
    ...overrides,
  }
  const view = render(
    <ThemeProvider initialContext="dark">
      <FeedbackBoardScreen {...props} />
    </ThemeProvider>,
  )
  return { props, view }
}

describe("FeedbackBoardScreen", () => {
  it("shows its heading, the shipped version, and takes back a vote with a singular label", () => {
    const { props, view } = renderBoard()
    expect(view.getByRole("header", { name: "Feature requests" })).toBeTruthy()
    expect(view.getByText("Shipped in 2.1.0")).toBeTruthy()
    fireEvent.press(view.getByLabelText("Remove your vote for Timer for tournament rounds, 1 vote"))
    expect(props.onVote).toHaveBeenCalledWith(item, false)
  })

  it("opens any request from its text, with no report button on the row", () => {
    const { props, view } = renderBoard()
    expect(view.queryByText("Report")).toBeNull()
    fireEvent.press(view.getByText("Timer for tournament rounds"))
    expect(props.onOpen).toHaveBeenCalledWith(item)
  })

  it("turns a search with no results into a suggestion", () => {
    const { props, view } = renderBoard({ items: [], search: "poison", searched: "poison" })
    expect(view.getByText("Nothing matches “poison”.")).toBeTruthy()
    fireEvent.press(view.getByText("Suggest “poison”"))
    expect(props.onSuggest).toHaveBeenCalledWith("poison")
  })

  it("pins Suggest and Your requests with the unread count, and notes offline votes", () => {
    const { props, view } = renderBoard({ unread: 1, offline: true })
    fireEvent.press(view.getByText("Your requests · 1 new"))
    expect(props.onMine).toHaveBeenCalled()
    expect(
      view.getByText("Offline. What you send waits and goes out when you're back."),
    ).toBeTruthy()
    expect(view.getByText("Votes count here now and sync when you're back.")).toBeTruthy()
  })
})
