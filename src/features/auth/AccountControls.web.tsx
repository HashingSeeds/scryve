import { useCallback, useEffect } from "react"
import { View } from "react-native"
import { useClerk } from "@clerk/expo"

import { Button } from "@/components/Button"
import { Header } from "@/components/Header"

import { clerkAppearance } from "./clerkAppearance"

export function AccountProfile({ onBack }: { onBack?: () => void }) {
  const clerk = useClerk()
  const openProfile = useCallback(
    () => clerk.openUserProfile({ appearance: clerkAppearance }),
    [clerk],
  )

  useEffect(() => {
    openProfile()
  }, [openProfile])

  return (
    <View style={$profile}>
      <Header title="Account" leftTx="common:back" onLeftPress={onBack} />
      <Button text="Manage profile" preset="reversed" onPress={openProfile} />
    </View>
  )
}

const $profile = { flex: 1 } as const
