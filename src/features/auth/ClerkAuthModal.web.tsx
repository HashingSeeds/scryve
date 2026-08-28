import { useEffect } from "react"
import { useClerk } from "@clerk/expo"

import { useAppTheme } from "@/theme/context"

import { getClerkAppearance } from "./clerkAppearance"

export function ClerkAuthModal({
  visible,
  onDismiss,
}: {
  visible: boolean
  onDismiss: () => void
}) {
  const clerk = useClerk()
  const { theme } = useAppTheme()

  useEffect(() => {
    if (!visible) return
    clerk.openSignIn({
      appearance: getClerkAppearance(theme),
      withSignUp: true,
      oauthFlow: "popup",
      fallbackRedirectUrl: "/",
      signUpFallbackRedirectUrl: "/",
    })
    onDismiss()
  }, [clerk, onDismiss, theme, visible])

  return null
}
