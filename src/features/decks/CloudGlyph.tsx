import Svg, { Path } from "react-native-svg"

import { useAppTheme } from "@/theme/context"
import { decorativeSvgProps } from "@/utils/decorativeSvgProps"

export function CloudGlyph() {
  const { theme } = useAppTheme()
  return (
    <Svg
      width={13}
      height={13}
      viewBox="0 0 24 24"
      fill="none"
      stroke={theme.colors.textDim}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...decorativeSvgProps({ accessible: false })}
      testID="cloud-glyph"
    >
      <Path d="M17.5 19H8a5 5 0 1 1 1.1-9.9A6 6 0 0 1 20.5 11a4 4 0 0 1-3 8z" />
    </Svg>
  )
}
