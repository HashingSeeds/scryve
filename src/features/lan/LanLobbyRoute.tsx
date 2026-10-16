import { useCallback, useMemo } from "react"
import { Redirect, router, useLocalSearchParams } from "expo-router"

import { NO_PLAY_SYSTEM } from "@/features/game/playSystems"
import { lanPlayAvailable } from "@/features/lan/lanAvailability"
import { parseLanSetup, type LanSetup } from "@/features/lan/lanGame"
import { LanLobbyScreen } from "@/screens/LanLobbyScreen"

function setupFromParams(params: Record<string, string | undefined>): LanSetup | undefined {
  if (params.setup) {
    try {
      return parseLanSetup(JSON.parse(params.setup)) ?? undefined
    } catch {
      return undefined
    }
  }
  if (!params.players || !params.life) return undefined
  return (
    parseLanSetup({
      playerCount: Number(params.players),
      startingLife: Number(params.life),
      lifeStep: 1,
      ruleset: params.format ?? NO_PLAY_SYSTEM,
      ...(params.system ? { system: params.system, format: params.format } : {}),
    }) ?? undefined
  )
}

export default function LanLobbyRoute() {
  const params = useLocalSearchParams<{
    setup?: string
    host?: string
    join?: string
    start?: string
    system?: string
    format?: string
    life?: string
    players?: string
  }>()
  const setup = useMemo(() => setupFromParams(params), [params])
  const onPlay = useCallback(() => router.push("/lan/game"), [])
  if (!lanPlayAvailable()) return <Redirect href="/" />
  return (
    <LanLobbyScreen
      onBack={() => router.dismissTo({ pathname: "/", params: { destination: "play" } })}
      onPlay={onPlay}
      setup={setup}
      automation={{ host: params.host === "1", join: params.join, start: params.start === "1" }}
    />
  )
}
