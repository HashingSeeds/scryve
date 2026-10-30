import type { Theme } from "@/theme/types"
import { typography } from "@/theme/typography"

export function getClerkAppearance({ colors, radius }: Theme) {
  return {
    theme: "simple",
    variables: {
      colorPrimary: colors.tint,
      colorForeground: colors.text,
      colorMutedForeground: colors.textDim,
      colorBackground: colors.background,
      colorInput: colors.surfaceRaised,
      colorInputForeground: colors.text,
      colorNeutral: colors.textDim,
      colorBorder: colors.border,
      colorDanger: colors.error,
      colorRing: colors.tint,
      colorShadow: colors.shadow,
      colorModalBackdrop: colors.overlay,
      fontFamily: `${typography.primary.normal}, system-ui, sans-serif`,
      fontFamilyButtons: `${typography.primary.semiBold}, system-ui, sans-serif`,
      borderRadius: `${radius.md}px`,
      fontSize: "0.95rem",
    },
  } as const
}
