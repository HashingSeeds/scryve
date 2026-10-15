import { useEffect, useRef, useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { ScrollView, View } from "react-native"
import { useZeroconf } from "react-native-zeroconf"

import { AlertNote } from "@/components/AlertNote"
import { Button } from "@/components/Button"
import { Header } from "@/components/Header"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
import { LAN_NAME_MAX_LENGTH, loadLanName, saveLanName } from "@/features/lan/lanAvailability"
import {
  connectedSeatCount,
  LAN_MIN_PLAYERS,
  lanProjection,
  type LanFormat,
} from "@/features/lan/lanGame"
import { lanSession, useLanSession } from "@/features/lan/lanSession"
import {
  checkLocalNetworkAccess,
  isLanGameService,
  LAN_SERVICE_TYPE,
} from "@/features/lan/lanTransport"
import { useAppTheme } from "@/theme/context"
import { $styles } from "@/theme/styles"
import type { ThemedStyle } from "@/theme/types"

const STARTING_LIVES = [20, 30, 40] as const
const FORMATS = [
  { format: "standard", label: "Standard", life: 20 },
  { format: "commander", label: "Commander", life: 40 },
] as const satisfies readonly { format: LanFormat; label: string; life: number }[]

export interface LanLobbyAutomation {
  host?: boolean
  join?: string
  start?: number
  format?: LanFormat
  players?: number
}

export function LanLobbyScreen({
  onBack,
  onPlay,
  automation = {},
}: {
  onBack: () => void
  onPlay: () => void
  automation?: LanLobbyAutomation
}) {
  const { themed } = useAppTheme()
  const session = useLanSession()
  const { game, role, status, error, serviceName } = session
  const inGame = Boolean(role)
  // why: Android 17 refuses to browse or publish until the app itself requests ACCESS_LOCAL_NETWORK.
  const [access, setAccess] = useState<Awaited<ReturnType<typeof checkLocalNetworkAccess>>>()
  useEffect(() => {
    checkLocalNetworkAccess().then(setAccess, () => setAccess("denied"))
  }, [])
  const ready = access !== undefined && access !== "denied"
  const { services } = useZeroconf({
    type: LAN_SERVICE_TYPE,
    protocol: "tcp",
    enabled: ready && !inGame,
  })
  const nearby = services.filter(
    (service) => isLanGameService(service) && lanSession.isReachable(service.name),
  )
  const [format, setFormat] = useState<LanFormat>(automation.format ?? "standard")
  const [startingLife, setStartingLife] = useState<number>(
    automation.start ?? (format === "commander" ? 40 : 20),
  )
  const [name, setName] = useState(loadLanName)
  const projection = game && session.seatKey ? lanProjection(game, session.seatKey) : undefined
  const players = projection?.players ?? []
  const readyPlayers = game ? connectedSeatCount(game) : 0

  const previousStatus = useRef(game?.status)
  useEffect(() => {
    if (game?.status === "active" && previousStatus.current !== "active") onPlay()
    previousStatus.current = game?.status
  }, [game?.status, onPlay])

  // why: lets an agent drive devices it can deep link into but cannot tap.
  const automated = useRef(false)
  useEffect(() => {
    if (automated.current || inGame || !ready) return
    if (automation.host) {
      automated.current = true
      void lanSession.host()
    }
    const target =
      automation.join && nearby.find((service) => service.name.startsWith(automation.join ?? ""))
    if (target) {
      automated.current = true
      void lanSession.join(target)
    }
  })
  useEffect(() => {
    if (
      automation.start &&
      role === "host" &&
      game?.status === "lobby" &&
      readyPlayers >= (automation.players ?? LAN_MIN_PLAYERS)
    )
      lanSession.start(automation.start, automation.format)
  }, [automation.start, automation.format, automation.players, role, game?.status, readyPlayers])

  const heading = !inGame
    ? "Nearby games"
    : role === "host"
      ? `Hosting ${serviceName ?? ""}`
      : `Joined ${serviceName ?? ""}`

  return (
    <Screen preset="fixed" safeAreaEdges={["bottom"]} contentContainerStyle={$styles.flex1}>
      <Header leftTx="common:back" onLeftPress={onBack} />
      <ScrollView style={$styles.flex1} contentContainerStyle={themed($content)}>
        <Text preset="heading" accessibilityRole="header" text={heading} />
        {access === "denied" ? (
          <AlertNote text="Allow nearby devices access in Settings to find and host games." />
        ) : null}
        {error ? <AlertNote text={error} /> : null}
        {status === "connecting" || status === "reconnecting" ? (
          <Text
            style={themed($dimmed)}
            text={status === "connecting" ? "Connecting…" : "Reconnecting…"}
          />
        ) : null}

        {!inGame ? (
          <View style={themed($section)}>
            <TextField
              label="Your name"
              placeholder="Shown to the table"
              value={name}
              maxLength={LAN_NAME_MAX_LENGTH}
              autoCorrect={false}
              onChangeText={(next) => {
                setName(next)
                saveLanName(next)
              }}
            />
            {nearby.length === 0 ? (
              <Text style={themed($dimmed)} text="No games on this network yet." />
            ) : null}
            {nearby.map((service) => (
              <Button
                key={service.name}
                text={`Join ${service.name}`}
                onPress={() => void lanSession.join(service)}
              />
            ))}
            <Button
              preset="primary"
              text="Host a game"
              disabled={!ready}
              onPress={() => void lanSession.host()}
            />
          </View>
        ) : (
          <>
            <View style={themed($section)}>
              {players.map((player) => {
                const seat = game?.seats.find((candidate) => candidate.key === player.playerId)
                return (
                  <View key={player.playerId} style={themed($seatRow)}>
                    <View style={[themed($swatch), { backgroundColor: player.color }]} />
                    <Text
                      style={$styles.flex1}
                      weight={player.controlledByMe ? "semiBold" : "normal"}
                      text={
                        player.controlledByMe ? `${player.displayName} (you)` : player.displayName
                      }
                    />
                    {seat && !seat.connected ? (
                      <Text size="xs" style={themed($dimmed)} text="Away" />
                    ) : null}
                  </View>
                )
              })}
            </View>

            {role === "host" && game?.status !== "active" ? (
              <View style={themed($section)}>
                <View style={themed($row)}>
                  {FORMATS.map((choice) => (
                    <Button
                      key={choice.format}
                      style={$styles.flex1}
                      preset={format === choice.format ? "primary" : "default"}
                      text={choice.label}
                      onPress={() => {
                        setFormat(choice.format)
                        setStartingLife(choice.life)
                      }}
                    />
                  ))}
                </View>
                <View style={themed($row)}>
                  {STARTING_LIVES.map((life) => (
                    <Button
                      key={life}
                      style={$styles.flex1}
                      preset={startingLife === life ? "primary" : "default"}
                      text={String(life)}
                      onPress={() => setStartingLife(life)}
                    />
                  ))}
                </View>
                <Button
                  preset="primary"
                  disabled={readyPlayers < LAN_MIN_PLAYERS}
                  text={game?.status === "lobby" ? "Start game" : "Start again"}
                  onPress={() => lanSession.start(startingLife, format)}
                />
              </View>
            ) : null}
            {role === "guest" && game?.status !== "active" ? (
              <Text style={themed($dimmed)} text="Waiting for the host to start." />
            ) : null}
            {game?.status === "active" ? <Button text="Back to game" onPress={onPlay} /> : null}
            <Button
              text={role === "host" ? "End game" : "Leave"}
              onPress={() => lanSession.leave()}
            />
          </>
        )}
      </ScrollView>
    </Screen>
  )
}

const $content: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.lg,
  padding: spacing.lg,
})
const $section: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xs })
const $row: ThemedStyle<ViewStyle> = ({ spacing }) => ({ flexDirection: "row", gap: spacing.xs })
const $seatRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
  minHeight: 36,
})
const $swatch: ThemedStyle<ViewStyle> = () => ({ width: 14, height: 14, borderRadius: 7 })
const $dimmed: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
