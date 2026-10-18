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
import { lanSession, useLanSession } from "./lanSession"
import { useNearbyGames } from "./useNearbyGames"

export function NearbyGameList({ onJoin }: { onJoin: () => void }) {
  const { role } = useLanSession()
  if (!lanPlayAvailable()) return null
  if (role)
    return <Button testID="back-to-nearby-game" tx="connected:nearby.backToGame" onPress={onJoin} />
  return <NearbyGames onJoin={onJoin} />
}

function NearbyGames({ onJoin }: { onJoin: () => void }) {
  const { themed } = useAppTheme()
  const { denied, games } = useNearbyGames(true)
  const [name, setName] = useState(loadLanName)
  return (
    <View testID="nearby-games" style={themed($section)}>
      <Text preset="subheading" accessibilityRole="header" tx="connected:nearby.title" />
      {denied ? <AlertNote text={translate("connected:nearby.accessDenied")} /> : null}
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
      {games.length === 0 ? <Text style={themed($dimmed)} tx="connected:nearby.empty" /> : null}
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
