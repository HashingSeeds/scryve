import { useCallback } from "react"
import { Redirect, router, useLocalSearchParams } from "expo-router"

import { lanPlayAvailable } from "@/features/lan/lanAvailability"
import { LanLobbyScreen } from "@/screens/LanLobbyScreen"

export default function LanLobbyRoute() {
  const { host, join, start, format, players } = useLocalSearchParams<{
    host?: string
    join?: string
    start?: string
    format?: string
    players?: string
  }>()
  const onPlay = useCallback(() => router.push("/lan/game"), [])
  if (!lanPlayAvailable()) return <Redirect href="/" />
  return (
    <LanLobbyScreen
      onBack={() => router.dismissTo({ pathname: "/", params: { destination: "play" } })}
      onPlay={onPlay}
      automation={{
        host: host === "1",
        join,
        start: start ? Number(start) : undefined,
        format: format === "commander" ? "commander" : undefined,
        players: players ? Number(players) : undefined,
      }}
    />
  )
}
