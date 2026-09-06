import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native"

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

  it("keeps code entry and scanning available before sign-in", async () => {
    const request = jest.fn()
    const onScan = jest.fn()
    const onJoined = jest.fn()
    const form = (ready: boolean) =>
      themed(
        <JoinConnectedScreen
          onJoined={onJoined}
          onScan={onScan}
          access={{ ready, loading: false, request }}
        />,
      )
    const view = render(form(false))
    fireEvent.changeText(view.getByTestId("manual-code-input"), "AB12CD")
    fireEvent.press(view.getByTestId("scan-invite-button"))
    expect(onScan).toHaveBeenCalledTimes(1)
    expect(request).not.toHaveBeenCalled()
    fireEvent.press(view.getByTestId("claim-seat-button"))
    expect(request).toHaveBeenCalledTimes(1)
    expect(mockClaimSeat).not.toHaveBeenCalled()
    view.rerender(form(true))
    expect(view.getByTestId("manual-code-input").props.value).toBe("AB12CD")
    fireEvent.press(view.getByTestId("claim-seat-button"))
    await waitFor(() => expect(onJoined).toHaveBeenCalledWith("game-public"))
  })

  it("claims a seat from a manual code using the profile name, not a typed one", async () => {
    const onJoined = jest.fn()
    render(themed(<JoinConnectedScreen onJoined={onJoined} />))
    expect(screen.queryByTestId("join-display-name")).toBeNull()
    fireEvent.changeText(screen.getByTestId("manual-code-input"), "AB12CD")
    fireEvent.press(screen.getByTestId("claim-seat-button"))
    await waitFor(() => expect(onJoined).toHaveBeenCalledWith("game-public"))
    expect(mockClaimSeat).toHaveBeenCalledWith(
      expect.objectContaining({ manualCode: "AB12CD", displayName: "ada_lovelace" }),
    )
  })

  it("shows the username other players will actually see", () => {
    render(themed(<JoinConnectedScreen onJoined={jest.fn()} />))
    expect(screen.getByTestId("join-username")).toHaveTextContent("@ada_lovelace")
  })

  it("joins with a default appearance that can be changed in the lobby", async () => {
    render(themed(<JoinConnectedScreen onJoined={jest.fn()} />))
    fireEvent.changeText(screen.getByTestId("manual-code-input"), "AB12CD")

    await act(async () => {
      fireEvent.press(screen.getByTestId("claim-seat-button"))
    })

    expect(mockClaimSeat).toHaveBeenLastCalledWith(
      expect.objectContaining({ color: "#B85636", shape: "circle" }),
    )
  })

  it("requires a usable invitation code before claiming a seat", () => {
    render(themed(<JoinConnectedScreen onJoined={jest.fn()} />))
    expect(screen.getByTestId("claim-seat-button").props.accessibilityState.disabled).toBe(true)
    fireEvent.changeText(screen.getByTestId("manual-code-input"), "AB12CD")
    expect(screen.getByTestId("claim-seat-button").props.accessibilityState.disabled).toBe(false)
  })
})
