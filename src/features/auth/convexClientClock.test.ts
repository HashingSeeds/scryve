import { ConvexReactClient } from "convex/react"

const sent: string[] = []
const sockets: FakeSocket[] = []
let client: ConvexReactClient | undefined

class FakeSocket {
  onopen: (() => void) | null = null
  onclose: ((event: { code: number; reason: string }) => void) | null = null
  constructor() {
    sockets.push(this)
  }
  send(message: string) {
    sent.push(message)
  }
  close() {
    this.onclose?.({ code: 1000, reason: "" })
  }
}

afterEach(() => client?.close())

// why: React Native counts performance.now() from device boot. js-patches/convex@1.42.3.patch keeps that uptime out of the clock Convex reports, or a reused sign-in token is refreshed after it expires.
it("reports the wall clock to Convex when performance.now() counts from device boot", () => {
  const fiveDaysOfUptime = 5 * 24 * 60 * 60 * 1000
  jest.spyOn(performance, "now").mockReturnValue(fiveDaysOfUptime)
  client = new ConvexReactClient("https://example.convex.cloud", {
    webSocketConstructor: FakeSocket as unknown as typeof WebSocket,
    unsavedChangesWarning: false,
    logger: false,
  })
  client.connectionState()
  sockets[0].onopen?.()

  const connect = sent
    .map((message): { type: string; clientTs?: number } => JSON.parse(message))
    .find((message) => message.type === "Connect")
  expect(Math.abs((connect?.clientTs ?? 0) - Date.now())).toBeLessThan(1000)
})
