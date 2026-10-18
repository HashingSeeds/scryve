import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Redirect, router, useLocalSearchParams } from "expo-router"

import { NO_PLAY_SYSTEM } from "@/features/game/playSystems"
import { lanPlayAvailable } from "@/features/lan/lanAvailability"
import { lanSeatsReady, parseLanSetup, type LanSetup } from "@/features/lan/lanGame"
import { lanSession, useLanSession } from "@/features/lan/lanSession"
import { checkLocalNetworkAccess } from "@/features/lan/lanTransport"
import { NearbyLobbyScreen } from "@/features/lan/NearbyLobbyScreen"
import { useNearbyGames } from "@/features/lan/useNearbyGames"
import { translate } from "@/i18n/translate"

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

const backToPlay = () => router.dismissTo({ pathname: "/", params: { destination: "play" } })

export default function LanLobbyRoute() {
  const params = useLocalSearchParams<{
    setup?: string
    join?: string
    start?: string
    system?: string
    format?: string
    life?: string
    players?: string
  }>()
  const setup = useMemo(() => setupFromParams(params), [params])
  const onPlay = useCallback(() => router.push("/lan/game"), [])
  const [accessError, setAccessError] = useState<string>()
  const { role, lobby } = useLanSession()

  // why: hosting starts once per visit; a remount after leaving must not reopen the lobby.
  const hosted = useRef(false)
  useEffect(() => {
    if (hosted.current || !setup || lanSession.getState().role || !lanPlayAvailable()) return
    hosted.current = true
    void checkLocalNetworkAccess()
      .catch(() => "denied" as const)
      .then((access) =>
        access === "denied"
          ? setAccessError(translate("connected:nearby.accessDenied"))
          : lanSession.host(setup),
      )
  }, [setup])

  // why: lets an agent drive devices it can deep link into but cannot tap.
  const { games } = useNearbyGames(Boolean(params.join) && !role)
  const joining = useRef(false)
  useEffect(() => {
    const target =
      params.join && games.find((service) => service.name.startsWith(params.join ?? ""))
    if (!target || joining.current) return
    joining.current = true
    void lanSession.join(target)
  }, [games, params.join])
  useEffect(() => {
    if (
      params.start === "1" &&
      role === "host" &&
      lobby?.status === "lobby" &&
      lanSeatsReady(lobby)
    )
      lanSession.start()
  }, [params.start, role, lobby])

  if (!lanPlayAvailable()) return <Redirect href="/" />
  return (
    <NearbyLobbyScreen
      error={accessError}
      onBack={backToPlay}
      onLeft={backToPlay}
      onPlay={onPlay}
    />
  )
}
