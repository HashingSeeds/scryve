import { Redirect, router } from "expo-router"

import { lanPlayAvailable } from "@/features/lan/lanAvailability"
import { lanSession, useLanSession } from "@/features/lan/lanSession"
import { useLanGame } from "@/features/lan/useLanGame"
import { ConnectedBoardWithRuntime } from "@/screens/ConnectedBoardScreen"

const backToLobby = () => (router.canGoBack() ? router.back() : router.replace("/lan"))

export default function LanGameRoute() {
  const runtime = useLanGame()
  const { projection } = useLanSession()
  if (!lanPlayAvailable()) return <Redirect href="/" />
  if (!projection) return <Redirect href="/lan" />
  if (runtime.status !== "ready") return null
  return (
    <ConnectedBoardWithRuntime
      publicId={runtime.projection.publicId}
      ownerId={lanSession.getState().seatKey ?? "nearby"}
      runtime={runtime}
      cloud={false}
      onGameEnded={backToLobby}
      onGameAbandoned={backToLobby}
      onBack={backToLobby}
      onSettings={() => router.push("/settings")}
    />
  )
}
