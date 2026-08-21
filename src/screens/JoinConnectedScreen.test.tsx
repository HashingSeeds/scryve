import { fireEvent, render, screen, waitFor } from "@testing-library/react-native"

import { JoinConnectedScreen } from "./JoinConnectedScreen"
import { mockClaimSeat, resetConnectedHarness, themed } from "../../test/support/connectedHarness"

jest.mock("@clerk/expo", () =>
  jest
    .requireActual<typeof import("../../test/support/connectedHarness")>(
      "../../test/support/connectedHarness",
    )
    .createClerkMock(),
)
jest.mock("convex/react", () =>
  jest
    .requireActual<typeof import("../../test/support/connectedHarness")>(
      "../../test/support/connectedHarness",
    )
    .createConvexReactMock(),
)
jest.mock("../../convex/_generated/api", () =>
  jest
    .requireActual<typeof import("../../test/support/connectedHarness")>(
      "../../test/support/connectedHarness",
    )
    .createGeneratedApiMock(),
)

describe("JoinConnectedScreen", () => {
  beforeEach(resetConnectedHarness)

  it("claims a seat from a manual code with editable display metadata", async () => {
    const onJoined = jest.fn()
    render(themed(<JoinConnectedScreen onJoined={onJoined} />))
    fireEvent.changeText(screen.getByTestId("manual-code-input"), "AB12CD")
    fireEvent.changeText(screen.getByTestId("join-display-name"), "Grace")
    fireEvent.press(screen.getByTestId("claim-seat-button"))
    await waitFor(() => expect(onJoined).toHaveBeenCalledWith("game-public"))
    expect(mockClaimSeat).toHaveBeenCalledWith(
      expect.objectContaining({ manualCode: "AB12CD", displayName: "Grace" }),
    )
  })

  it("validates connected display names before claiming a seat", () => {
    render(themed(<JoinConnectedScreen onJoined={jest.fn()} />))
    fireEvent.changeText(screen.getByTestId("manual-code-input"), "AB12CD")
    fireEvent.changeText(screen.getByTestId("join-display-name"), "   ")
    expect(screen.getByText("Enter a player name.")).toBeTruthy()
    expect(screen.getByTestId("claim-seat-button").props.accessibilityState.disabled).toBe(true)
  })
})
