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
