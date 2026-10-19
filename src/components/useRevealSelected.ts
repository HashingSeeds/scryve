import { useCallback, useEffect, useRef } from "react"
import type {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
} from "react-native"

interface Span {
  x: number
  width: number
}

// why: scrolling to a selection the player can already see would slide the row out from under their tap.
export function useRevealSelected(selectedKey: string | undefined) {
  const scrollRef = useRef<ScrollView>(null)
  const items = useRef(new Map<string, Span>())
  const viewport = useRef({ offset: 0, width: 0 })

  const reveal = useCallback(
    (animated: boolean) => {
      const item = selectedKey === undefined ? undefined : items.current.get(selectedKey)
      const { offset, width } = viewport.current
      if (!item || width === 0) return
      if (item.x >= offset && item.x + item.width <= offset + width) return
      scrollRef.current?.scrollTo({ x: Math.max(0, item.x - (width - item.width) / 2), animated })
    },
    [selectedKey],
  )

  useEffect(() => reveal(true), [reveal])

  return {
    scrollProps: {
      ref: scrollRef,
      scrollEventThrottle: 16,
      onLayout: (event: LayoutChangeEvent) => {
        viewport.current.width = event.nativeEvent.layout.width
        reveal(false)
      },
      onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
        viewport.current.offset = event.nativeEvent.contentOffset.x
      },
    },
    itemLayout: (key: string) => (event: LayoutChangeEvent) => {
      const { x, width } = event.nativeEvent.layout
      items.current.set(key, { x, width })
      if (key === selectedKey) reveal(false)
    },
  }
}
