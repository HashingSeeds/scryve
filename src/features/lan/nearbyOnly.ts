import { useSyncExternalStore } from "react"

import { load, save } from "@/utils/storage"

import { lanPlayAvailable } from "./lanAvailability"

const NEARBY_ONLY_KEY = "lan.nearbyOnly"
const UNREACHABLE_SYNC_URL = "wss://convex.offline.invalid/api/sync"

/** why: deck caches are keyed by the client's URL, so only the socket changes; the reserved .invalid domain never resolves, as in a real outage. */
export class UnreachableWebSocket extends WebSocket {
  constructor(_url: string | URL, protocols?: string | string[]) {
    super(UNREACHABLE_SYNC_URL, protocols)
  }
}

const listeners = new Set<() => void>()
let nearbyOnly = load(NEARBY_ONLY_KEY) === true

export function setNearbyOnly(on: boolean) {
  if (!save(NEARBY_ONLY_KEY, on)) return
  nearbyOnly = on
  for (const listener of listeners) listener()
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const useNearbyOnly = () =>
  useSyncExternalStore(subscribe, () => lanPlayAvailable() && nearbyOnly)
