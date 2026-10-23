import { fireEvent, render } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { FeedbackRequestScreen, type FeedbackRequestScreenProps } from "./FeedbackRequestScreen"
import type { Id } from "../../convex/_generated/dataModel"

const item = {
  _id: "r4" as Id<"feedbackRequests">,
  kind: "bug" as const,
  title: "Commander damage stays after undo",
  body: "Undoing a hit gives the life back but leaves the commander damage.",
  status: "planned" as const,
  votes: 3,
  shippedIn: undefined,
  createdAt: 0,
  voted: false,
  reported: false,
  mine: false,
}

function renderRequest(overrides: Partial<FeedbackRequestScreenProps> = {}) {
  const props: FeedbackRequestScreenProps = {
    item,
    offline: false,
    voteFailed: false,
    reportFailed: false,
    onVote: jest.fn(),
    onReport: jest.fn(),
    onBack: jest.fn(),
    ...overrides,
  }
  const view = render(
    <ThemeProvider initialContext="dark">
      <FeedbackRequestScreen {...props} />
    </ThemeProvider>,
  )
  return { props, view }
}

describe("FeedbackRequestScreen", () => {
  it("reports after a confirm, then leaves nothing to press", () => {
    const { props, view } = renderRequest()
    expect(view.getByRole("header", { name: item.title })).toBeTruthy()
    expect(view.getByText("3 players want this")).toBeTruthy()
    fireEvent.press(view.getByRole("button", { name: "Report this request" }))
    expect(props.onReport).not.toHaveBeenCalled()
    fireEvent.press(view.getByText("Report"))
    expect(props.onReport).toHaveBeenCalledTimes(1)

    view.rerender(
      <ThemeProvider initialContext="dark">
        <FeedbackRequestScreen {...props} item={{ ...item, reported: true }} />
      </ThemeProvider>,
    )
    expect(view.getByText("Reported. Thanks, we'll review it.")).toBeTruthy()
    expect(view.queryByText("Report this request")).toBeNull()
  })

  it("shows the missing state for a bad id and no report on your own request", () => {
    expect(
      renderRequest({ item: null }).view.getByText("This request isn't on the board."),
    ).toBeTruthy()
    expect(
      renderRequest({ item: { ...item, mine: true } }).view.queryByText("Report this request"),
    ).toBeNull()
  })
})
