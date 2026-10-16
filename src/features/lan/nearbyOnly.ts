import { useSyncExternalStore } from "react"

import { load, save } from "@/utils/storage"

import { lanPlayAvailable } from "./lanAvailability"

const NEARBY_ONLY_KEY = "lan.nearbyOnly"
const UNREACHABLE_SYNC_URL = "wss://convex.offline.invalid/api/sync"

const listeners = new Set<() => void>()
const liveSockets = new Set<WebSocket>()
let nearbyOnly = load(NEARBY_ONLY_KEY) === true

const cutOff = () => lanPlayAvailable() && nearbyOnly

/**
 * why: the client and its URL stay put, because deck caches are keyed by that URL and pending
 * writes live in the client. Only the socket fails, on a reserved domain that never resolves.
 */
export class NearbyOnlyWebSocket extends WebSocket {
  constructor(url: string | URL, protocols?: string | string[]) {
    super(cutOff() ? UNREACHABLE_SYNC_URL : url, protocols)
    liveSockets.add(this)
    this.addEventListener("close", () => liveSockets.delete(this))
  }
}

export function setNearbyOnly(on: boolean) {
  if (!save(NEARBY_ONLY_KEY, on)) return
  nearbyOnly = on
  if (on) for (const socket of liveSockets) socket.close()
  for (const listener of listeners) listener()
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const useNearbyOnly = () => useSyncExternalStore(subscribe, cutOff)
