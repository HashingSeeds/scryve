import type { Theme } from "@/theme/types"

export function getClerkAppearance({ colors }: Theme) {
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
      fontFamily: "spaceGroteskRegular, system-ui, sans-serif",
      fontFamilyButtons: "spaceGroteskSemiBold, system-ui, sans-serif",
      borderRadius: "8px",
      fontSize: "0.95rem",
    },
  } as const
}
