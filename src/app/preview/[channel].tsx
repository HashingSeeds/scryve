import { useEffect, useState } from "react"
import { Redirect, router, useLocalSearchParams } from "expo-router"

import { EmptyState } from "@/components/EmptyState"
import { Screen } from "@/components/Screen"
import { canOpenPrPreview, openPrPreview } from "@/features/updates/appUpdate"

const goHome = () => router.replace("/")

export default function PrPreviewRoute() {
  const { channel } = useLocalSearchParams<{ channel: string }>()
  const [message, setMessage] = useState(`Loading ${channel}…`)

  useEffect(() => {
    if (!canOpenPrPreview()) return
    let current = true
    openPrPreview(channel).then(
      (result) => {
        if (!current) return
        if (result === "current") goHome()
        if (result === "missing")
          setMessage(
            `${channel} has no update this build can run. It may need a new preview build.`,
          )
      },
      (failure: unknown) =>
        current && setMessage(failure instanceof Error ? failure.message : String(failure)),
    )
    return () => {
      current = false
    }
  }, [channel])

  if (!canOpenPrPreview()) return <Redirect href="/" />
  return (
    <Screen preset="auto" safeAreaEdges={["top", "bottom"]}>
      <EmptyState
        heading="PR preview"
        content={message}
        button="Open Play"
        buttonOnPress={goHome}
      />
    </Screen>
  )
}
