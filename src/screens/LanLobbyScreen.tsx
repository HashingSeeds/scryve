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
import { playSystemFormats } from "@/features/game/playSystems"
import { LAN_NAME_MAX_LENGTH, loadLanName, saveLanName } from "@/features/lan/lanAvailability"
import { lanSeatsReady, type LanSetup } from "@/features/lan/lanGame"
import { lanSession, useLanSession } from "@/features/lan/lanSession"
import {
  checkLocalNetworkAccess,
  isLanGameService,
  LAN_SERVICE_TYPE,
} from "@/features/lan/lanTransport"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import { $styles } from "@/theme/styles"
import type { ThemedStyle } from "@/theme/types"

export interface LanLobbyAutomation {
  host?: boolean
  join?: string
  start?: boolean
}

const summaryOf = (setup: LanSetup) => {
  const format = setup.system
    ? (playSystemFormats(setup.system).find(({ id }) => id === setup.format)?.label ?? setup.format)
    : undefined
  return [
    translate("connected:nearby.summaryLife", { life: setup.startingLife }),
    format,
    translate("connected:nearby.summaryPlayers", { players: setup.playerCount }),
  ]
    .filter(Boolean)
    .join(" · ")
}

export function LanLobbyScreen({
  onBack,
  onPlay,
  setup,
  automation = {},
}: {
  onBack: () => void
  onPlay: () => void
  setup?: LanSetup
  automation?: LanLobbyAutomation
}) {
  const { themed } = useAppTheme()
  const session = useLanSession()
  const { lobby, projection, role, status, error, serviceName } = session
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
  const [name, setName] = useState(loadLanName)
  const players = projection?.players ?? []
  const seatsReady = lobby ? lanSeatsReady(lobby) : false
  const openSeats = lobby ? Math.max(0, lobby.setup.playerCount - lobby.seats.length) : 0

  const startedRound = useRef(lobby?.status === "active" ? lobby.round : undefined)
  useEffect(() => {
    if (lobby?.status !== "active" || startedRound.current === lobby.round) return
    startedRound.current = lobby.round
    onPlay()
  }, [lobby?.status, lobby?.round, onPlay])

  // why: lets an agent drive devices it can deep link into but cannot tap.
  const automated = useRef(false)
  useEffect(() => {
    if (automated.current || inGame || !ready) return
    if (automation.host && setup) {
      automated.current = true
      void lanSession.host(setup)
    }
    const target =
      automation.join && nearby.find((service) => service.name.startsWith(automation.join ?? ""))
    if (target) {
      automated.current = true
      void lanSession.join(target)
    }
  })
  useEffect(() => {
    if (automation.start && role === "host" && lobby?.status === "lobby" && seatsReady)
      lanSession.start()
  }, [automation.start, role, lobby?.status, seatsReady])

  const heading = !inGame
    ? translate("connected:nearby.title")
    : translate(role === "host" ? "connected:nearby.hosting" : "connected:nearby.joined", {
        name: serviceName ?? "",
      })

  return (
    <Screen preset="fixed" safeAreaEdges={["bottom"]} contentContainerStyle={$styles.flex1}>
      <Header leftTx="common:back" onLeftPress={onBack} />
      <ScrollView style={$styles.flex1} contentContainerStyle={themed($content)}>
        <Text preset="heading" accessibilityRole="header" text={heading} />
        {access === "denied" ? (
          <AlertNote text={translate("connected:nearby.accessDenied")} />
        ) : null}
        {error ? <AlertNote text={error} /> : null}
        {status === "connecting" || status === "reconnecting" ? (
          <Text
            style={themed($dimmed)}
            tx={
              status === "connecting"
                ? "connected:nearby.connecting"
                : "connected:nearby.reconnecting"
            }
          />
        ) : null}

        {!inGame ? (
          <View style={themed($section)}>
            <TextField
              labelTx="connected:nearby.nameLabel"
              placeholderTx="connected:nearby.namePlaceholder"
              value={name}
              maxLength={LAN_NAME_MAX_LENGTH}
              autoCorrect={false}
              onChangeText={(next) => {
                setName(next)
                saveLanName(next)
              }}
            />
            {nearby.length === 0 ? (
              <Text style={themed($dimmed)} tx="connected:nearby.empty" />
            ) : null}
            {nearby.map((service) => (
              <Button
                key={service.name}
                tx="connected:nearby.join"
                txOptions={{ name: service.name }}
                onPress={() => void lanSession.join(service)}
              />
            ))}
            {setup ? (
              <>
                <Text style={themed($dimmed)} text={summaryOf(setup)} />
                <Button
                  preset="primary"
                  tx="connected:nearby.host"
                  disabled={!ready}
                  onPress={() => void lanSession.host(setup)}
                />
              </>
            ) : (
              <Text style={themed($dimmed)} tx="connected:nearby.hostHint" />
            )}
          </View>
        ) : (
          <>
            <View style={themed($section)}>
              {lobby ? <Text style={themed($dimmed)} text={summaryOf(lobby.setup)} /> : null}
              {players.map((player) => {
                const seat = lobby?.seats.find((candidate) => candidate.key === player.playerId)
                return (
                  <View key={player.playerId} style={themed($seatRow)}>
                    <View style={[themed($swatch), { backgroundColor: player.color }]} />
                    <Text
                      style={$styles.flex1}
                      weight={player.controlledByMe ? "semiBold" : "normal"}
                      text={
                        player.controlledByMe
                          ? translate("connected:nearby.you", { name: player.displayName })
                          : player.displayName
                      }
                    />
                    {seat && !seat.connected ? (
                      <Text size="xs" style={themed($dimmed)} tx="connected:nearby.away" />
                    ) : null}
                  </View>
                )
              })}
              {Array.from({ length: openSeats }, (_, index) => (
                <View key={`open-${index}`} style={themed($seatRow)}>
                  <View style={[themed($swatch), themed($openSwatch)]} />
                  <Text style={[$styles.flex1, themed($dimmed)]} tx="connected:seats.openSeat" />
                </View>
              ))}
            </View>

            {role === "host" && lobby?.status !== "active" ? (
              <Button
                preset="primary"
                disabled={!seatsReady}
                tx={lobby?.status === "lobby" ? "play:startGame" : "connected:nearby.startAgain"}
                onPress={() => lanSession.start()}
              />
            ) : null}
            {role === "guest" && lobby?.status !== "active" ? (
              <Text style={themed($dimmed)} tx="connected:waitingForHost" />
            ) : null}
            {lobby?.status === "active" ? (
              <Button tx="connected:nearby.backToGame" onPress={onPlay} />
            ) : null}
            <Button
              tx={role === "host" ? "connected:nearby.endGame" : "connected:nearby.leave"}
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
const $seatRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
  minHeight: 36,
})
const $swatch: ThemedStyle<ViewStyle> = () => ({ width: 14, height: 14, borderRadius: 7 })
const $openSwatch: ThemedStyle<ViewStyle> = ({ colors }) => ({
  borderWidth: 1,
  borderColor: colors.textDim,
})
const $dimmed: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
