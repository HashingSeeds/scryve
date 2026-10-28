import type { Service } from "react-native-zeroconf"

import { connectLan, type LanConnection, type LanPeerHandlers } from "@/features/lan/lanTransport"
import { captureAnalytics } from "@/utils/analytics"

import { createHubEvent, hubView, joinHub } from "./hubEvent"
import { nearbyEventClient } from "./nearbyEventClient"
import type { NearbyHostMessage } from "./nearbyEventProtocol"

jest.mock("@/features/lan/lanTransport", () => ({ connectLan: jest.fn() }))
jest.mock("@/utils/analytics", () => ({ captureAnalytics: jest.fn() }))

const CODE = "ABC123"
const service: Service = {
  name: `event-${CODE} Friday Modern`,
  fullName: `event-${CODE} Friday Modern._scryve._tcp.local.`,
  host: "host.local",
  port: 4000,
  addresses: ["192.168.1.2"],
  ipv4: ["192.168.1.2"],
  ipv6: [],
  txt: {},
}

it("times a command until the host's next update shows it, not until the host answers", async () => {
  let host: LanPeerHandlers<NearbyHostMessage> | undefined
  const connection: LanConnection<unknown> = {
    send: jest.fn(),
    sendAndClose: jest.fn(),
    close: jest.fn(),
  }
  jest.mocked(connectLan).mockImplementation(async (_service, _parse, handlers) => {
    host = handlers as LanPeerHandlers<NearbyHostMessage>
    return connection
  })
  const { event, playerId } = joinHub(
    createHubEvent(
      {
        id: "e1",
        code: CODE,
        name: "Friday Modern",
        format: "modern",
        structure: "swiss",
        bestOf: 3,
        plannedRounds: 3,
        roundMinutes: 50,
      },
      1,
    ),
    { name: "Ada", token: "token-ada-000000000" },
    "p1",
  )
  const joining = nearbyEventClient.join(service, CODE, "Ada")
  await new Promise(setImmediate)
  host!.onMessage({ t: "welcome", playerId })
  await joining
  const view = hubView(event, { organizer: false, playerId })
  host!.onMessage({ t: "view", seq: 1, view, standings: [] })

  jest.useFakeTimers()
  const running = nearbyEventClient.run({ kind: "drop", playerId })
  jest.advanceTimersByTime(40)
  host!.onMessage({ t: "done", id: 1 })
  await running
  jest.advanceTimersByTime(210)
  const { players: _, tables: __, isOrganizer: ___, myPlayerId: ____, ...fields } = view
  host!.onMessage({ t: "patch", seq: 2, view: fields })
  nearbyEventClient.leave()

  expect(captureAnalytics).toHaveBeenCalledWith(
    "sync_latency",
    expect.objectContaining({
      transport: "nearby",
      role: "guest",
      scope: "event",
      ack_count: 1,
      ack_p50: 250,
    }),
  )
  jest.useRealTimers()
})
