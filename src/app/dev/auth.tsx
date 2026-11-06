import { useEffect, useState } from "react"
import { Redirect, router, useLocalSearchParams } from "expo-router"
import { useSignIn } from "@clerk/expo"

import { EmptyState } from "@/components/EmptyState"
import { Screen } from "@/components/Screen"
import { useAuthAccess } from "@/features/auth/AuthContext"

const goToPlay = () => router.dismissTo({ pathname: "/", params: { destination: "play" } })

export default function DevAuthRoute() {
  const { configured } = useAuthAccess()
  const { ticket } = useLocalSearchParams<{ ticket?: string }>()
  if (!__DEV__) return <Redirect href="/" />
  if (!configured || !ticket) return <DevAuthFailed message="No Clerk config or no ticket" />
  return <TicketSignIn ticket={ticket} />
}

function TicketSignIn({ ticket }: { ticket: string }) {
  const { signIn } = useSignIn()
  const { isLoaded, isSignedIn } = useAuthAccess()
  const [signingIn, setSigningIn] = useState(false)
  const [error, setError] = useState<string>()

  useEffect(() => {
    if (!isLoaded || isSignedIn || signingIn) return
    setSigningIn(true)
    void (async () => {
      const failure = (await signIn.ticket({ ticket })).error ?? (await signIn.finalize()).error
      if (failure) setError(failure.message)
    })().catch((failure: unknown) =>
      setError(failure instanceof Error ? failure.message : String(failure)),
    )
  }, [signIn, ticket, isLoaded, isSignedIn, signingIn])

  useEffect(() => {
    if (signingIn && isSignedIn) goToPlay()
  }, [signingIn, isSignedIn])

  if (error) return <DevAuthFailed message={error} />
  // why: signing out remounts the app tree and drops this route, so switching accounts stays manual.
  if (isLoaded && isSignedIn && !signingIn)
    return <DevAuthFailed message="Already signed in. Sign out first." />
  return null
}

function DevAuthFailed({ message }: { message: string }) {
  return (
    <Screen preset="auto" safeAreaEdges={["top", "bottom"]}>
      <EmptyState
        heading="Sign-in failed"
        content={message}
        button="Go to Play"
        buttonOnPress={goToPlay}
      />
    </Screen>
  )
}
