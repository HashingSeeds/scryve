import { Platform, View } from "react-native"
import { UserButton, UserProfileView } from "@clerk/expo/native"

import { Text } from "@/components/Text"

export function AccountButton() {
  if (Platform.OS === "web")
    return <Text text="Account controls require a native development build." />
  return (
    <View testID="user-button" style={$userButton}>
      <UserButton />
    </View>
  )
}

const $userButton = { width: 44, height: 44 }

export function AccountProfile() {
  if (Platform.OS === "web")
    return <Text text="Profile management requires a native development build." />
  return <UserProfileView />
}
