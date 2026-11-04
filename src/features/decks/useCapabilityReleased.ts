import { useQuery } from "convex/react"

import { useConvexOnline } from "@/features/connected/useConvexOnline"

import { api } from "../../../convex/_generated/api"
import {
  isReleased,
  systemDefinition,
  type CapabilityKey,
  type IntegrationDefinition,
} from "../../../convex/lib/systems"

const released = (capabilities: IntegrationDefinition["capabilities"], key: CapabilityKey) =>
  isReleased(capabilities.integration, capabilities[key])

export function useCapabilityReleased(key: CapabilityKey) {
  const manifest = useQuery(api.integrationManifest.list)
  const online = useConvexOnline()
  return (game: string) => {
    const definition = systemDefinition(game)
    if (!definition) return false
    const local = released(definition.integration.capabilities, key)
    const live = manifest?.find(({ id }) => id === game)
    // why: a backend older than this client omits capability keys it doesn't know yet.
    const remote = live && key in live.capabilities ? released(live.capabilities, key) : undefined
    return online ? (remote ?? local) : local && remote !== false
  }
}
