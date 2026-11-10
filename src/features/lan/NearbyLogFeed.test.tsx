import { View } from "react-native"
import { render } from "@testing-library/react-native"

import { lanSession, type LanSessionState } from "./lanSession"
import { NearbyLogFeed } from "./NearbyLogFeed"

let mockState: LanSessionState = { status: "reconnecting" }
jest.mock("./lanSession", () => ({
  lanSession: { requestLog: jest.fn() },
  useLanSessionSlice: <Slice,>(select: (state: LanSessionState) => Slice) => select(mockState),
}))

describe("NearbyLogFeed", () => {
  it("asks the host for the log again on reconnect, even when no change landed meanwhile", () => {
    const feed = <NearbyLogFeed publicId="round-1">{() => <View />}</NearbyLogFeed>
    const { rerender } = render(feed)
    expect(lanSession.requestLog).toHaveBeenCalledTimes(1)

    mockState = { status: "connected" }
    rerender(<NearbyLogFeed publicId="round-1">{() => <View />}</NearbyLogFeed>)
    expect(lanSession.requestLog).toHaveBeenCalledTimes(2)
  })
})
