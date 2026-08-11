import { useState } from "react"
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native"

const TITLE_REVEAL_OFFSET = 56

export function useCollapsingTitle() {
  const [titleVisible, setTitleVisible] = useState(false)

  function onScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const scrolledPastHeading = event.nativeEvent.contentOffset.y > TITLE_REVEAL_OFFSET
    setTitleVisible((visible) => (visible === scrolledPastHeading ? visible : scrolledPastHeading))
  }

  return { titleVisible, onScroll }
}
