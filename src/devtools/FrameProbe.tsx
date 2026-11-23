import { useCallback, useEffect, useRef, useState } from "react"
import { Pressable, type TextStyle, type ViewStyle } from "react-native"
import { useFrameCallback, useSharedValue } from "react-native-reanimated"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { Text } from "@/components/Text"

import { formatFrameStats, NO_FRAMES, recordFrame, type FrameStats } from "./frameStats"

function readout(ui: FrameStats, js: FrameStats) {
  return `${formatFrameStats("ui", ui)}\n${formatFrameStats("js", js)}`
}

/** why: perf agents read these frame counters for the UI and JS threads, readable from an accessibility snapshot or a screenshot. Tap to reset. Mounted only when EXPO_PUBLIC_FRAME_PROBE=1; see .agents/skills/verify-perf. */
export function FrameProbe() {
  const insets = useSafeAreaInsets()
  const ui = useSharedValue(NO_FRAMES)
  const js = useRef(NO_FRAMES)
  const [text, setText] = useState(() => readout(NO_FRAMES, NO_FRAMES))

  useFrameCallback(({ timestamp }) => {
    "worklet"
    ui.value = recordFrame(ui.value, timestamp)
  })

  useEffect(() => {
    let frame = requestAnimationFrame(function tick(now) {
      js.current = recordFrame(js.current, now)
      frame = requestAnimationFrame(tick)
    })
    // why: a slow refresh keeps the probe's own renders out of the JS numbers it reports.
    const refresh = setInterval(() => setText(readout(ui.value, js.current)), 500)
    return () => {
      cancelAnimationFrame(frame)
      clearInterval(refresh)
    }
  }, [ui])

  const reset = useCallback(() => {
    ui.value = NO_FRAMES
    js.current = NO_FRAMES
    setText(readout(NO_FRAMES, NO_FRAMES))
  }, [ui])

  const label = `frame-probe ${text.replace("\n", " ")}`
  return (
    <Pressable
      testID="frame-probe"
      accessibilityLabel={label}
      onPress={reset}
      style={[$probe, { top: insets.top, start: insets.left + 4 }]}
    >
      <Text style={$text} text={text} />
    </Pressable>
  )
}

const $probe: ViewStyle = {
  position: "absolute",
  backgroundColor: "rgba(0, 0, 0, 0.7)",
  paddingHorizontal: 4,
  paddingVertical: 2,
}

const $text: TextStyle = {
  color: "#fff",
  fontSize: 10,
  lineHeight: 13,
  fontVariant: ["tabular-nums"],
}
