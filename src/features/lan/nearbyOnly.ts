import { useSyncExternalStore } from "react"

import { load, save } from "@/utils/storage"

import { lanPlayAvailable } from "./lanAvailability"

const NEARBY_ONLY_KEY = "lan.nearbyOnly"
const UNREACHABLE_SYNC_URL = "wss://convex.offline.invalid/api/sync"

const listeners = new Set<() => void>()
const liveSockets = new Set<WebSocket>()
let nearbyOnly = load(NEARBY_ONLY_KEY) === true

const cutOff = () => lanPlayAvailable() && nearbyOnly

/** why: deck caches and pending writes are scoped by the Convex URL, so a different URL would strand them; only the socket changes. */
export class NearbyOnlyWebSocket extends WebSocket {
  constructor(url: string | URL, protocols?: string | string[]) {
    super(cutOff() ? UNREACHABLE_SYNC_URL : url, protocols)
    liveSockets.add(this)
    this.addEventListener("close", () => liveSockets.delete(this))
  }
}

export function setNearbyOnly(on: boolean) {
  save(NEARBY_ONLY_KEY, on)
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
