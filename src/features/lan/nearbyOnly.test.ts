import type { NearbyOnlyWebSocket as Socket } from "./nearbyOnly"

jest.mock("./lanAvailability", () => ({ lanPlayAvailable: () => true }))

class FakeSocket extends EventTarget {
  constructor(readonly url: string) {
    super()
  }
  close = jest.fn(() => this.dispatchEvent(new Event("close")))
}

let nearbyOnly: typeof import("./nearbyOnly")
beforeAll(() => {
  Object.assign(globalThis, { WebSocket: FakeSocket })
  nearbyOnly = require("./nearbyOnly")
})

const open = () =>
  new nearbyOnly.NearbyOnlyWebSocket("wss://real.convex.cloud/api/sync") as unknown as Socket &
    FakeSocket

it("drops the live socket when switched on, and dials Convex again once switched off", () => {
  nearbyOnly.setNearbyOnly(false)
  const live = open()
  expect(live.url).toBe("wss://real.convex.cloud/api/sync")

  nearbyOnly.setNearbyOnly(true)
  expect(live.close).toHaveBeenCalledTimes(1)
  expect(open().url).toBe("wss://convex.offline.invalid/api/sync")

  nearbyOnly.setNearbyOnly(false)
  expect(open().url).toBe("wss://real.convex.cloud/api/sync")
})
