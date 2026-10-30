import Svg, { Path, Rect } from "react-native-svg"

import { useAppTheme } from "@/theme/context"
import { decorativeSvgProps } from "@/utils/decorativeSvgProps"

import type { DeckHome } from "./localDeckSync"

export function DeckHomeGlyph({ home }: { home: DeckHome }) {
  const { theme } = useAppTheme()
  return (
    <Svg
      width={15}
      height={15}
      viewBox="0 0 24 24"
      fill="none"
      stroke={theme.colors.textDim}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...decorativeSvgProps({ accessible: false })}
      testID={`deck-home-${home}`}
    >
      {home === "account" ? (
        <Path d="M17.5 19H8a5 5 0 1 1 1.1-9.9A6 6 0 0 1 20.5 11a4 4 0 0 1-3 8z" />
      ) : (
        <>
          <Rect x={6} y={2.5} width={12} height={19} rx={2.5} />
          <Path d="M11 18h2" />
        </>
      )}
    </Svg>
  )
}
