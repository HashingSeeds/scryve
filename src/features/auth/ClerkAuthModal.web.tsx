import { useEffect } from "react"
import { useClerk } from "@clerk/expo"

import { clerkAppearance } from "./clerkAppearance"

export function ClerkAuthModal({
  visible,
  onDismiss,
}: {
  visible: boolean
  onDismiss: () => void
}) {
  const clerk = useClerk()

  useEffect(() => {
    if (!visible) return
    clerk.openSignIn({
      appearance: clerkAppearance,
      withSignUp: true,
      oauthFlow: "popup",
      fallbackRedirectUrl: "/",
      signUpFallbackRedirectUrl: "/",
    })
    onDismiss()
  }, [clerk, onDismiss, visible])

  return null
}
