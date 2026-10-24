import { useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { View } from "react-native"

import { AlertNote } from "@/components/AlertNote"
import { Button } from "@/components/Button"
import { Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { LAN_NAME_MAX_LENGTH, lanPlayAvailable, loadLanName, saveLanName } from "./lanAvailability"
import { lanSession, useLanSessionSlice, type LanSessionState } from "./lanSession"
import { OpenSettingsButton } from "./NearbyLobbyScreen"
import { useNearbyGames } from "./useNearbyGames"

const selectTable = ({ role, lobby }: LanSessionState) =>
  role ? (lobby?.status === "finished" ? "finished" : "playing") : undefined

export function NearbyGameList({ onJoin }: { onJoin: () => void }) {
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
      <NearbyGames onJoin={onJoin} />
    </>
  )
}

function NearbyGames({ onJoin }: { onJoin: () => void }) {
  const { themed } = useAppTheme()
  const { denied, games, scannedLong } = useNearbyGames(true)
  const [name, setName] = useState(loadLanName)
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
          style={themed($dimmed)}
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
const $dimmed: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
