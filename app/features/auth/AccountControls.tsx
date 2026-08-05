import { Platform } from "react-native"
import { UserProfileView } from "@clerk/expo/native"

import { Text } from "@/components/Text"

export function AccountProfile() {
  if (Platform.OS === "web")
    return <Text text="Profile management requires a native development build." />
  return <UserProfileView isDismissible={false} style={$profile} />
}

const $profile = { flex: 1 } as const
