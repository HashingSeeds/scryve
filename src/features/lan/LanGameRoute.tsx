import { useMemo, useState } from "react"
import { Redirect, router } from "expo-router"

import { lanPlayAvailable } from "@/features/lan/lanAvailability"
import { lanSession, useLanSession } from "@/features/lan/lanSession"
import { useLanGame } from "@/features/lan/useLanGame"
import { ConnectedBoardWithRuntime } from "@/screens/ConnectedBoardScreen"

const backToLobby = () => (router.canGoBack() ? router.back() : router.replace("/lan"))

export default function LanGameRoute() {
  // why: resuming before useLanGame reads the session puts the saved game on the first render instead of redirecting to the lobby.
  useState(() => lanPlayAvailable() && lanSession.resumeHostedGame())
  const runtime = useLanGame()
  const { projection, lobby, role, status } = useLanSession()
  const awayPlayerIds = useMemo(
    () => lobby?.seats.filter((seat) => !seat.connected).map((seat) => seat.key) ?? [],
    [lobby?.seats],
  )
  if (!lanPlayAvailable()) return <Redirect href="/" />
  if (!projection) return <Redirect href="/lan" />
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
      onGameAbandoned={backToLobby}
      onBack={backToLobby}
      onSettings={() => router.push("/settings")}
    />
  )
}
