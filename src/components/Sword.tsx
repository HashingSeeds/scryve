import Svg, { Path, Rect } from "react-native-svg"

export const SWORD_VIEW_BOX = 24

export function SwordShapes({ color }: { color: string }) {
  return (
    <>
      <Path d="M12 2.5 L14.1 6.4 V14.4 H9.9 V6.4 Z" fill={color} />
      <Rect x={6.8} y={14.6} width={10.4} height={1.9} rx={0.9} fill={color} />
      <Rect x={11.05} y={16.9} width={1.9} height={4.6} rx={0.9} fill={color} />
    </>
  )
}

export function Sword({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${SWORD_VIEW_BOX} ${SWORD_VIEW_BOX}`}>
      <SwordShapes color={color} />
    </Svg>
  )
}

export function CheckShape({ color }: { color: string }) {
  return (
    <Path
      d="M5.52 11.68 9.4 15.56 18.68 6.28 20.52 8.12 9.4 19.24 3.68 13.52Z"
      fill={color}
      stroke={color}
      strokeWidth={1.6}
      strokeLinejoin="round"
    />
  )
}

/** why: drawn solid at Rubik Bold's stroke weight, with softened corners, so it reads as the app's own type rather than a system icon. */
export function Check({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${SWORD_VIEW_BOX} ${SWORD_VIEW_BOX}`}>
      <CheckShape color={color} />
    </Svg>
  )
}
