import { useEffect, useMemo, useState } from "react"
import { Redirect, router } from "expo-router"

import { lanPlayAvailable } from "@/features/lan/lanAvailability"
import { lanSession, useLanSession } from "@/features/lan/lanSession"
import { useLanGame } from "@/features/lan/useLanGame"
import { ConnectedBoardWithRuntime } from "@/screens/ConnectedBoardScreen"

const backToLobby = () => (router.canGoBack() ? router.back() : router.replace("/lan"))
const backToPlay = () => router.dismissTo({ pathname: "/", params: { destination: "play" } })
// why: only a guest still holds the ended game; a host's abandon clears the session, and the route has already left for Play.
const leaveAbandonedGame = () => {
  if (lanSession.getState().projection) backToLobby()
}

export default function LanGameRoute() {
  // why: resuming before useLanGame reads the session puts the saved game on the first render instead of leaving the route.
  useState(() => lanPlayAvailable() && lanSession.resumeHostedGame())
  const runtime = useLanGame()
  const { projection, lobby, role, status, error } = useLanSession()
  // why: with no game and no error, the lobby has nothing to show and would say "Connecting…" forever.
  const gameGone = lanPlayAvailable() && !projection && !error
  useEffect(() => {
    if (gameGone) backToPlay()
  }, [gameGone])
  const awayPlayerIds = useMemo(
    () => lobby?.seats.filter((seat) => !seat.connected).map((seat) => seat.key) ?? [],
    [lobby?.seats],
  )
  if (!lanPlayAvailable()) return <Redirect href="/" />
  if (!projection) return error ? <Redirect href="/lan" /> : null
  if (runtime.status !== "ready") return null
  return (
    <ConnectedBoardWithRuntime
      publicId={runtime.projection.publicId}
      ownerId={lanSession.getState().seatKey ?? "nearby"}
      runtime={runtime}
      cloud={false}
      awayPlayerIds={awayPlayerIds}
      onRevealRole={lanSession.revealRole}
      roleRevealOnline={role === "host" || status === "connected"}
      onGameEnded={backToLobby}
      onGameAbandoned={leaveAbandonedGame}
      onBack={backToLobby}
      onSettings={() => router.push("/settings")}
    />
  )
}
