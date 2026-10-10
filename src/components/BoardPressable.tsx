import { createContext, useContext, type ComponentProps } from "react"
import { Pressable, type Insets } from "react-native"

/** why: Fabric measures views on a hardware-pinned board as if the board were upright, but touches arrive in window space. While the window is turned, Pressability's press rect lands elsewhere and the first finger move cancels the press, so the turned board lets presses keep their rect for the whole screen. */
export const TurnedBoardContext = createContext(false)

const WHOLE_SCREEN: Insets = { top: 10000, left: 10000, bottom: 10000, right: 10000 }

// why: the props include `ref`, so callers can move focus to a board control.
export function BoardPressable(props: ComponentProps<typeof Pressable>) {
  const turned = useContext(TurnedBoardContext)
  return (
    <Pressable
      {...props}
      pressRetentionOffset={turned ? WHOLE_SCREEN : props.pressRetentionOffset}
    />
  )
}
