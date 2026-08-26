import { useCallback, useState } from "react"
import { useClerk, useUser } from "@clerk/expo"

import { AccountScreen } from "@/screens/AccountScreen"
import { useAppTheme } from "@/theme/context"

import type { AccountProfileProps } from "./accountProfileProps"
import { getClerkAppearance } from "./clerkAppearance"

export function AccountProfile({ onBack, onSignedOut, accountControls }: AccountProfileProps) {
  const clerk = useClerk()
  const { user } = useUser()
  const { theme } = useAppTheme()
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [error, setError] = useState<string>()

  const manageProfile = useCallback(
    () => clerk.openUserProfile({ appearance: getClerkAppearance(theme) }),
    [clerk, theme],
  )

  const signOut = useCallback(async () => {
    setIsSigningOut(true)
    setError(undefined)
    try {
      clerk.closeUserProfile()
      await clerk.signOut()
      onSignedOut?.()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not sign out")
    } finally {
      setIsSigningOut(false)
    }
  }, [clerk, onSignedOut])

  return (
    <AccountScreen
      name={user?.fullName || user?.username || undefined}
      email={user?.primaryEmailAddress?.emailAddress}
      avatarUrl={user?.hasImage ? user.imageUrl : undefined}
      isSigningOut={isSigningOut}
      error={error}
      accountControls={accountControls}
      onBack={onBack}
      onManageProfile={manageProfile}
      onSignOut={() => void signOut()}
    />
  )
}
