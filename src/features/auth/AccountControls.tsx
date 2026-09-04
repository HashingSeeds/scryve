import { useState } from "react"
import { Modal, View } from "react-native"
import { useClerk, useUser } from "@clerk/expo"
import { UserProfileView } from "@clerk/expo/native"

import { AccountScreen } from "@/screens/AccountScreen"

import type { AccountProfileProps } from "./accountProfileProps"

export function AccountProfile({
  onBack,
  onSignedOut,
  onOpenTerms,
  onOpenPrivacy,
  onOpenGameContentNotices,
  accountControls,
}: AccountProfileProps) {
  const clerk = useClerk()
  const { user } = useUser()
  const [profileOpen, setProfileOpen] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [error, setError] = useState<string>()

  async function signOut() {
    try {
      setError(undefined)
      setIsSigningOut(true)
      await clerk.signOut()
      onSignedOut?.()
    } catch {
      setError("Could not sign out. Try again.")
    } finally {
      setIsSigningOut(false)
    }
  }

  return (
    <View style={$fill}>
      <AccountScreen
        name={user?.fullName || user?.username || undefined}
        email={user?.primaryEmailAddress?.emailAddress}
        avatarUrl={user?.imageUrl}
        isSigningOut={isSigningOut}
        error={error}
        accountControls={accountControls}
        onBack={onBack}
        onManageProfile={() => setProfileOpen(true)}
        onOpenTerms={onOpenTerms}
        onOpenPrivacy={onOpenPrivacy}
        onOpenGameContentNotices={onOpenGameContentNotices}
        onSignOut={() => void signOut()}
      />
      <Modal
        visible={profileOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setProfileOpen(false)}
      >
        <UserProfileView style={$fill} onDismiss={() => setProfileOpen(false)} />
      </Modal>
    </View>
  )
}

const $fill = { flex: 1 } as const
