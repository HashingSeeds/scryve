import { useCallback } from "react"
import { Platform } from "react-native"
import { Redirect, router, useLocalSearchParams } from "expo-router"

import { LanLobbyScreen } from "@/screens/LanLobbyScreen"

// why: LAN play is a proof of concept, so it stays out of release builds.
export default function LanLobbyRoute() {
  const { host, join, start, players } = useLocalSearchParams<{
    host?: string
    join?: string
    start?: string
    players?: string
  }>()
  const onPlay = useCallback(() => router.push("/lan/game"), [])
  if (!__DEV__ || Platform.OS === "web") return <Redirect href="/" />
  return (
    <LanLobbyScreen
      onBack={() => router.dismissTo({ pathname: "/", params: { destination: "play" } })}
      onPlay={onPlay}
      automation={{
        host: host === "1",
        join,
        start: start ? Number(start) : undefined,
        players: players ? Number(players) : undefined,
      }}
    />
  )
}
