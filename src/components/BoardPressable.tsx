import { createContext, useContext } from "react"
import { Pressable, type Insets, type PressableProps } from "react-native"

/** why: Fabric measures views on a hardware-pinned board as if the board were upright, but touches arrive in window space. While the window is turned, Pressability's press rect lands elsewhere and the first finger move cancels the press, so the turned board lets presses keep their rect for the whole screen. */
export const TurnedBoardContext = createContext(false)

const WHOLE_SCREEN: Insets = { top: 10000, left: 10000, bottom: 10000, right: 10000 }

export function BoardPressable(props: PressableProps) {
  const turned = useContext(TurnedBoardContext)
  return (
    <Pressable
      {...props}
      pressRetentionOffset={turned ? WHOLE_SCREEN : props.pressRetentionOffset}
    />
  )
}
