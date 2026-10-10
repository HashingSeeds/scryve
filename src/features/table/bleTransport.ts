import { Platform } from "react-native"
import * as Bluetooth from "munim-bluetooth"

import { createReassembler, encodeFrames, type TableMessage } from "./protocol"

/**
 * why: the session id is the service UUID, so a guest that scanned the host's QR code
 * only ever sees that table, even in a hall full of phones.
 */
const TO_HOST = "5c3e0001-7b1a-4c8e-9a52-1f6d2b7e9a10"
const TO_GUESTS = "5c3e0002-7b1a-4c8e-9a52-1f6d2b7e9a10"

// why: Android's GATT server drops a notification sent before the last one went out, and the library does not wait.
const ANDROID_NOTIFY_GAP_MS = 40

const sameUuid = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export type TableLinkState =
  "starting" | "advertising" | "scanning" | "connecting" | "connected" | "closed"

export interface TableLinkHandlers {
  onMessage: (message: TableMessage, from: string) => void
  onState: (state: TableLinkState, detail?: string) => void
  onPeers?: (peers: readonly string[]) => void
}

export interface TableLink {
  send: (message: TableMessage) => void
  close: () => void
}

/** why: iOS refuses services until its radio reports powered on, which lands just after first use. */
async function retryUntilPowered(action: () => void) {
  for (let attempt = 0; ; attempt++) {
    try {
      action()
      return
    } catch (error) {
      if (attempt >= 20) throw error
      await sleep(250)
    }
  }
}

/**
 * why: a newer message waiting to go out replaces an older one, since each game
 * message is a whole snapshot.
 */
function createSender(writeFrame: (frame: string) => Promise<void>, gapMs: number) {
  let messageId = 0
  let waiting: TableMessage | undefined
  let sending = false
  async function pump() {
    sending = true
    while (waiting) {
      const message = waiting
      waiting = undefined
      messageId = (messageId + 1) & 0xff
      for (const frame of encodeFrames(message, messageId)) {
        await writeFrame(frame).catch(() => undefined)
        if (gapMs) await sleep(gapMs)
      }
    }
    sending = false
  }
  return (message: TableMessage) => {
    waiting = message
    if (!sending) void pump()
  }
}

export async function hostTable(
  sessionId: string,
  handlers: TableLinkHandlers,
): Promise<TableLink> {
  handlers.onState("starting")
  if (!(await Bluetooth.requestBluetoothPermission(["connect", "advertise"])))
    throw new Error("Bluetooth permission was denied")
  const receive = createReassembler()
  const peers = new Set<string>()
  const subscriptions = [
    Bluetooth.addEventListener("peripheralWriteRequest", (event) => {
      if (!sameUuid(event.characteristicUUID, TO_HOST)) return
      const message = receive(event.centralId, event.value)
      if (message) handlers.onMessage(message, event.centralId)
    }),
    Bluetooth.addEventListener("peripheralSubscribed", ({ centralId }) => {
      peers.add(centralId)
      handlers.onPeers?.([...peers])
    }),
    Bluetooth.addEventListener("peripheralUnsubscribed", ({ centralId }) => {
      peers.delete(centralId)
      handlers.onPeers?.([...peers])
    }),
    Bluetooth.addEventListener("advertisingStartFailed", (event) =>
      handlers.onState("closed", event.message ?? event.error ?? "Advertising failed"),
    ),
  ]
  await retryUntilPowered(() =>
    Bluetooth.setServices([
      {
        uuid: sessionId,
        characteristics: [
          { uuid: TO_HOST, properties: ["write"], permissions: ["write"] },
          { uuid: TO_GUESTS, properties: ["notify", "read"], permissions: ["read"] },
        ],
      },
    ]),
  )
  await retryUntilPowered(() => Bluetooth.startAdvertising({ serviceUUIDs: [sessionId] }))
  handlers.onState("advertising")

  const send = createSender(
    (frame) => Bluetooth.updateCharacteristicValue(sessionId, TO_GUESTS, frame, true),
    Platform.OS === "android" ? ANDROID_NOTIFY_GAP_MS : 0,
  )
  return {
    send,
    close: () => {
      subscriptions.forEach((unsubscribe) => unsubscribe())
      Bluetooth.stopAdvertising()
      handlers.onState("closed")
    },
  }
}

export async function joinTable(
  sessionId: string,
  handlers: TableLinkHandlers,
): Promise<TableLink> {
  handlers.onState("starting")
  if (!(await Bluetooth.requestBluetoothPermission(["scan", "connect"])))
    throw new Error("Bluetooth permission was denied")
  const receive = createReassembler()
  let closed = false

  const subscriptions: (() => void)[] = []
  const found = new Promise<string>((resolve) => {
    subscriptions.push(
      // why: the scan filters on the session UUID, but some Android stacks omit serviceUUIDs from results.
      Bluetooth.addEventListener("deviceFound", (device) => {
        if (!device.serviceUUIDs || device.serviceUUIDs.some((uuid) => sameUuid(uuid, sessionId)))
          resolve(device.id)
      }),
    )
  })
  handlers.onState("scanning")
  await retryUntilPowered(() =>
    Bluetooth.startScan({ serviceUUIDs: [sessionId], scanMode: "lowLatency" }),
  )
  const hostId = await found
  Bluetooth.stopScan()
  subscriptions.push(
    Bluetooth.addEventListener("characteristicValueChanged", (event) => {
      if (event.deviceId !== hostId || !sameUuid(event.characteristicUUID, TO_GUESTS)) return
      const message = receive(event.deviceId, event.value)
      if (message) handlers.onMessage(message, event.deviceId)
    }),
    Bluetooth.addEventListener("deviceDisconnected", (event) => {
      if (event.deviceId === hostId && !closed) handlers.onState("closed", "The host went away")
    }),
  )

  handlers.onState("connecting")
  await Bluetooth.connect(hostId, { timeoutMs: 15_000 })
  if (Platform.OS === "android") await Bluetooth.requestMTU(hostId, 517).catch(() => undefined)
  await Bluetooth.discoverServices(hostId)
  await Bluetooth.subscribeToCharacteristic(hostId, sessionId, TO_GUESTS)
  handlers.onState("connected")

  const send = createSender(
    (frame) => Bluetooth.writeCharacteristic(hostId, sessionId, TO_HOST, frame, "write"),
    0,
  )
  send({ type: "sync" })
  return {
    send,
    close: () => {
      closed = true
      subscriptions.forEach((unsubscribe) => unsubscribe())
      Bluetooth.stopScan()
      Bluetooth.disconnect(hostId)
      handlers.onState("closed")
    },
  }
}
