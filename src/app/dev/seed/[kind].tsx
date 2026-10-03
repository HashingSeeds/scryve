import { useEffect, useState } from "react"
import { Redirect, router, useLocalSearchParams } from "expo-router"

import { EmptyState } from "@/components/EmptyState"
import { Screen } from "@/components/Screen"
import { runSeed } from "@/devtools/seeds"

/**
 * why: agents and maintainers reach a known state from one link instead of tapping
 * through setup. Release builds redirect home without writing anything.
 */
export default function DevSeedRoute() {
  const { kind, ...params } = useLocalSearchParams<{ kind: string }>()
  const [error, setError] = useState<string>()
  const request = JSON.stringify([kind, params])

  useEffect(() => {
    if (!__DEV__) return
    const [seedKind, seedParams] = JSON.parse(request) as [string, typeof params]
    let current = true
    runSeed(seedKind, seedParams).then(
      (href) => {
        if (!current) return
        // why: a warm link lands on Play, whose stale board would save over the seed after Back.
        if (router.canDismiss()) router.dismissAll()
        router.replace(href)
      },
      (failure: unknown) =>
        current && setError(failure instanceof Error ? failure.message : String(failure)),
    )
    return () => {
      current = false
    }
  }, [request])

  if (!__DEV__) return <Redirect href="/" />
  if (!error) return null
  return (
    <Screen preset="auto" safeAreaEdges={["top", "bottom"]}>
      <EmptyState
        heading="Seed failed"
        content={error}
        button="Open Play"
        buttonOnPress={() => router.replace({ pathname: "/", params: { destination: "play" } })}
      />
    </Screen>
  )
}
