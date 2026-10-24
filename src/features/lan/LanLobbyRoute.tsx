import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Redirect, router, useLocalSearchParams } from "expo-router"

import { useAuthAccess } from "@/features/auth/AuthContext"
import { MyDecksSource, type MyDecks } from "@/features/decks/LocalDeckChoicesSource"
import { NO_PLAY_SYSTEM } from "@/features/game/playSystems"
import { lanPlayAvailable } from "@/features/lan/lanAvailability"
import { lanSeatsReady, parseLanSetup, type LanSetup } from "@/features/lan/lanGame"
import { lanSession, useLanSessionSlice, type LanSessionState } from "@/features/lan/lanSession"
import { NearbyLobbyScreen } from "@/features/lan/NearbyLobbyScreen"
import { useNearbyGames } from "@/features/lan/useNearbyGames"

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

const selectLobby = ({ role, lobby }: LanSessionState) => ({ role, lobby })

const backToPlay = () => router.dismissTo({ pathname: "/", params: { destination: "play" } })

export default function LanLobbyRoute() {
  if (!lanPlayAvailable()) return <Redirect href="/" />
  return <LanLobby />
}

function LanLobby() {
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
  const { role, lobby } = useLanSessionSlice(selectLobby)
  const auth = useAuthAccess()
  const ownerId = auth.configured && auth.isSignedIn ? auth.userId : undefined
  const [myDecks, setMyDecks] = useState<MyDecks>()

  // why: lets an agent drive devices it can deep link into but cannot tap.
  const { access, games } = useNearbyGames(Boolean(params.join) && !role)

  // why: hosting starts once per visit; a remount after leaving must not reopen the lobby. A finished table gives way to the new one, which starts empty.
  const hosted = useRef(false)
  useEffect(() => {
    const current = lanSession.getState()
    const playing = current.role && current.lobby?.status !== "finished"
    if (hosted.current || !setup || !access || access === "denied" || playing) return
    hosted.current = true
    void lanSession.host(setup)
  }, [setup, access])
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

  return (
    <>
      {ownerId && lobby?.setup.system ? (
        <MyDecksSource ownerId={ownerId} onChange={setMyDecks} />
      ) : null}
      <NearbyLobbyScreen
        accessDenied={access === "denied"}
        hosting={Boolean(setup)}
        myDecks={ownerId ? myDecks : undefined}
        signedIn={Boolean(ownerId)}
        onBack={backToPlay}
        onLeft={backToPlay}
        onPlay={onPlay}
        onManageDecks={() => router.push("/connected/decks")}
      />
    </>
  )
}
