import { useSyncExternalStore } from "react"

import { load, save } from "@/utils/storage"

import { lanPlayAvailable } from "./lanAvailability"

const NEARBY_ONLY_KEY = "lan.nearbyOnly"
// why: the reserved .invalid domain never resolves, so the Convex client behaves exactly as it does in a real outage.
export const UNREACHABLE_CONVEX_URL = "https://convex.offline.invalid"

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
