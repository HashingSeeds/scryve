import { useEffect, useRef, useState } from "react"
import type { ViewStyle } from "react-native"
import { View } from "react-native"

import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { AlertNote } from "./AlertNote"
import { Button } from "./Button"

export interface RetryableErrorProps {
  message: string
  retryAfterMs?: number
  onRetry: () => void
  testID?: string
}

export function RetryableError({ message, retryAfterMs, onRetry, testID }: RetryableErrorProps) {
  const { themed } = useAppTheme()
  const [retryAt, setRetryAt] = useState<number | undefined>(
    retryAfterMs !== undefined ? Date.now() + retryAfterMs : undefined,
  )
  const [secondsLeft, setSecondsLeft] = useState(
    retryAfterMs !== undefined ? Math.ceil(retryAfterMs / 1000) : 0,
  )

  useEffect(() => {
    setRetryAt(retryAfterMs !== undefined ? Date.now() + retryAfterMs : undefined)
    setSecondsLeft(retryAfterMs !== undefined ? Math.ceil(retryAfterMs / 1000) : 0)
  }, [retryAfterMs, message])

  const onRetryRef = useRef(onRetry)
  onRetryRef.current = onRetry
  useEffect(() => {
    if (retryAt === undefined) return
    const deadline = retryAt
    let timer: ReturnType<typeof setTimeout>
    function tick() {
      const remaining = deadline - Date.now()
      if (remaining <= 0) {
        onRetryRef.current()
        return
      }
      setSecondsLeft(Math.ceil(remaining / 1000))
      timer = setTimeout(tick, Math.min(1000, remaining))
    }
    tick()
    return () => clearTimeout(timer)
  }, [retryAt])

  const coolingDown = retryAt !== undefined
  return (
    <View style={themed($row)}>
      <AlertNote text={message} />
      <Button
        testID={testID}
        text={coolingDown ? `Retrying in ${secondsLeft}s` : "Retry"}
        disabled={coolingDown}
        onPress={onRetry}
      />
    </View>
  )
}

const $row: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.xs,
  alignItems: "flex-start",
})
