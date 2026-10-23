import Svg, { Path, Rect } from "react-native-svg"

import { useAppTheme } from "@/theme/context"
import { decorativeSvgProps } from "@/utils/decorativeSvgProps"

export function DeviceGlyph() {
  const { theme } = useAppTheme()
  return (
    <Svg
      width={13}
      height={13}
      viewBox="0 0 16 16"
      fill="none"
      stroke={theme.colors.textDim}
      strokeWidth={1.4}
      {...decorativeSvgProps({ accessible: false })}
      testID="device-glyph"
    >
      <Rect x={4} y={1.5} width={8} height={13} rx={1.6} />
      <Path d="M7 12.2h2" />
    </Svg>
  )
}
