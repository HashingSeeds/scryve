import { useEffect, useState } from "react"
import type { ViewStyle } from "react-native"
import { View } from "react-native"

import { AlertNote } from "@/components/AlertNote"
import { Button } from "@/components/Button"
import { Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
import { normalizeManualCode } from "@/features/connected/inviteLinks"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { LAN_NAME_MAX_LENGTH, lanPlayAvailable, loadLanName, saveLanName } from "./lanAvailability"
import { lanSession, useLanSessionSlice, type LanSessionState } from "./lanSession"
import { nearbyGameCode } from "./nearbyCode"
import { OpenSettingsButton } from "./NearbyLobbyScreen"
import { useNearbyGames } from "./useNearbyGames"

const selectTable = ({ role, lobby }: LanSessionState) =>
  role ? (lobby?.status === "finished" ? "finished" : "playing") : undefined

type NearbyGameListProps = {
  code?: string
  onJoin: () => void
}

export function NearbyGameList({ code, onJoin }: NearbyGameListProps) {
  const table = useLanSessionSlice(selectTable)
  if (!lanPlayAvailable()) return null
  const backToGame = (
    <Button testID="back-to-nearby-game" tx="connected:nearby.backToGame" onPress={onJoin} />
  )
  if (table === "playing") return backToGame
  // why: a finished table only waits for a rematch, so it must not hide other games nearby.
  return (
    <>
      {table === "finished" ? backToGame : null}
      <NearbyGames code={code} onJoin={onJoin} />
    </>
  )
}

function NearbyGames({ code, onJoin }: NearbyGameListProps) {
  const { themed } = useAppTheme()
  const { denied, games, scannedLong } = useNearbyGames(true)
  const [name, setName] = useState(loadLanName)
  const wanted = code ? normalizeManualCode(code) : null
  const match = wanted
    ? games.find((service) => nearbyGameCode(service.name) === wanted)
    : undefined
  useEffect(() => {
    if (!match) return
    void lanSession.join(match)
    onJoin()
  }, [match, onJoin])
  return (
    <View testID="nearby-games" style={themed($section)}>
      <Text preset="subheading" accessibilityRole="header" tx="connected:nearby.title" />
      {denied ? (
        <>
          <AlertNote text={translate("connected:nearby.accessDenied")} />
          <OpenSettingsButton />
        </>
      ) : null}
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
      {games.length === 0 ? (
        <Text
          tone="dim"
          tx={scannedLong ? "connected:nearby.notFound" : "connected:nearby.empty"}
        />
      ) : null}
      {games.map((service) => (
        <Button
          key={service.name}
          testID={`join-nearby-${service.name}`}
          tx="connected:nearby.join"
          txOptions={{ name: service.name }}
          onPress={() => {
            void lanSession.join(service)
            onJoin()
          }}
        />
      ))}
    </View>
  )
}

const $section: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xs })
