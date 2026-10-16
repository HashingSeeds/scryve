import { useEffect, useState } from "react"
import { Redirect, router, useLocalSearchParams } from "expo-router"

import { EmptyState } from "@/components/EmptyState"
import { Screen } from "@/components/Screen"
import { canOpenPrPreview, openPrPreview } from "@/features/updates/appUpdate"
import { translate } from "@/i18n/translate"

const goHome = () => router.dismissTo("/")

export default function PrPreviewRoute() {
  const { channel } = useLocalSearchParams<{ channel: string }>()
  const [message, setMessage] = useState(() => translate("account:preview.loading", { channel }))

  useEffect(() => {
    if (!canOpenPrPreview()) return
    let current = true
    openPrPreview(channel).then(
      (result) => {
        if (!current) return
        if (result === "current") goHome()
        if (result === "busy") setMessage(translate("account:preview.busy"))
        if (result === "missing") setMessage(translate("account:preview.missing", { channel }))
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
        headingTx="account:preview.heading"
        content={message}
        buttonTx="account:openPlay"
        buttonOnPress={goHome}
      />
    </Screen>
  )
}
