import { useEffect } from "react"
import { useClerk } from "@clerk/expo"

import { useAppTheme } from "@/theme/context"

import { getClerkAppearance } from "./clerkAppearance"
import { APP_ROOT_URL } from "./config"

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
      fallbackRedirectUrl: APP_ROOT_URL,
      signUpFallbackRedirectUrl: APP_ROOT_URL,
    })
    onDismiss()
  }, [clerk, onDismiss, theme, visible])

  return null
}
