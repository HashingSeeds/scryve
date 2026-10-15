import { Redirect, router } from "expo-router"

import { lanSession } from "@/features/lan/lanSession"
import { useLanGame } from "@/features/lan/useLanGame"
import { ConnectedBoardWithRuntime } from "@/screens/ConnectedBoardScreen"

const backToLobby = () => (router.canGoBack() ? router.back() : router.replace("/lan"))

export default function LanGameRoute() {
  const runtime = useLanGame()
  if (!__DEV__) return <Redirect href="/" />
  if (runtime.status !== "ready") return <Redirect href="/lan" />
  return (
    <ConnectedBoardWithRuntime
      publicId={runtime.projection.publicId}
      ownerId={lanSession.playerId}
      runtime={runtime}
      moderation={false}
      onGameEnded={backToLobby}
      onGameAbandoned={backToLobby}
      onBack={backToLobby}
      onSettings={() => router.push("/settings")}
    />
  )
}
