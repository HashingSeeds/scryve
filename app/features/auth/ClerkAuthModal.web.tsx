import { useEffect } from "react"
import { useClerk } from "@clerk/expo"

import { colors } from "@/theme/colorsDark"

const countAppearance = {
  theme: "simple",
  variables: {
    colorPrimary: colors.palette.primary500,
    colorForeground: colors.text,
    colorMutedForeground: colors.textDim,
    colorBackground: colors.background,
    colorInput: colors.palette.neutral300,
    colorInputForeground: colors.text,
    colorNeutral: colors.palette.neutral700,
    colorBorder: colors.border,
    colorDanger: colors.error,
    colorRing: colors.tint,
    colorShadow: colors.palette.neutral100,
    colorModalBackdrop: colors.palette.overlay50,
    fontFamily: "spaceGroteskRegular, system-ui, sans-serif",
    fontFamilyButtons: "spaceGroteskSemiBold, system-ui, sans-serif",
    borderRadius: "8px",
    fontSize: "0.95rem",
  },
} as const

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
      appearance: countAppearance,
      withSignUp: true,
      oauthFlow: "popup",
      fallbackRedirectUrl: "/",
      signUpFallbackRedirectUrl: "/",
    })
    onDismiss()
  }, [clerk, onDismiss, visible])

  return null
}
