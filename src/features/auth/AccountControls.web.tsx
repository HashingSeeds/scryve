import { useCallback, useState } from "react"
import { useClerk, useUser } from "@clerk/expo"

import { translate } from "@/i18n/translate"
import { AccountScreen } from "@/screens/AccountScreen"
import { useAppTheme } from "@/theme/context"

import type { AccountProfileProps } from "./accountProfileProps"
import { getClerkAppearance } from "./clerkAppearance"

export function AccountProfile({
  onBack,
  onSigningOut,
  onSignedOut,
  onOpenTerms,
  onOpenPrivacy,
  onOpenGameContentNotices,
  accountControls,
}: AccountProfileProps) {
  const clerk = useClerk()
  const { user } = useUser()
  const { theme } = useAppTheme()
  const [error, setError] = useState<string>()
  const identity = {
    name: user?.fullName || user?.username || undefined,
    email: user?.primaryEmailAddress?.emailAddress,
    avatarUrl: user?.hasImage ? user.imageUrl : undefined,
  }
  // why: Clerk drops the user before signOut resolves, so the screen keeps who it is signing out until the route leaves.
  const [signingOutAs, setSigningOutAs] = useState<typeof identity>()

  const manageProfile = useCallback(
    () => clerk.openUserProfile({ appearance: getClerkAppearance(theme) }),
    [clerk, theme],
  )

  const signOut = async () => {
    setSigningOutAs(identity)
    onSigningOut?.(true)
    setError(undefined)
    try {
      clerk.closeUserProfile()
      await clerk.signOut()
      onSignedOut?.()
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : translate("account:profile.signOutFailedShort"),
      )
      setSigningOutAs(undefined)
      onSigningOut?.(false)
    }
  }

  return (
    <AccountScreen
      {...(signingOutAs ?? identity)}
      isSigningOut={signingOutAs !== undefined}
      error={error}
      accountControls={accountControls}
      onBack={onBack}
      onManageProfile={manageProfile}
      onOpenTerms={onOpenTerms}
      onOpenPrivacy={onOpenPrivacy}
      onOpenGameContentNotices={onOpenGameContentNotices}
      onSignOut={() => void signOut()}
    />
  )
}
