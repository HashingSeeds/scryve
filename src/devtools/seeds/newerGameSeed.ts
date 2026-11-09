import type { Href } from "expo-router"

import {
  WIDE_ACTIVE_SCHEMA_VERSION,
  LOCAL_KEYS,
  LocalGameRepository,
  type StringStorage,
} from "@/features/game/localPersistence"
import { storage as mmkvStorage } from "@/utils/storage"

// why: no build writes a save this build can't read, so the update-needed launch screen has no other way in.
export function seedNewerGame(_params: unknown, storage: StringStorage = mmkvStorage): Href {
  new LocalGameRepository(storage).clearActiveGame()
  storage.set(
    LOCAL_KEYS.active,
    JSON.stringify({ schemaVersion: WIDE_ACTIVE_SCHEMA_VERSION + 1, game: {}, eventChunkCount: 0 }),
  )
  return { pathname: "/", params: { destination: "play" } }
}
