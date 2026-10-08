import { createContext, ReactNode, useCallback, useContext, useMemo, useState } from "react"
import { ClerkProvider, useAuth, useUser } from "@clerk/expo"
import { tokenCache } from "@clerk/expo/token-cache"
import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react"

import { APP_ROOT_URL, readPublicCloudConfig } from "@/features/auth/config"
import { readRevenueCatConfig } from "@/features/billing/config"
import { RevenueCatProvider } from "@/features/billing/RevenueCatContext"
import { RevenueCatSyncSession } from "@/features/billing/RevenueCatSyncSession"
import { DeckSyncSession } from "@/features/decks/DeckSyncSession"

import { ClerkAuthModal } from "./ClerkAuthModal"
import { ConvexAuthReconnect, createConvexAuthHook } from "./convexAuth"
import { resourceCache } from "./resourceCache"
import { type SessionHint, useSessionHint } from "./sessionHint"

interface AuthAccess {
  configured: boolean
  configurationMessage?: string
  isLoaded: boolean
  isSignedIn: boolean
  userId?: string
  sessionHint?: SessionHint
  openAuth: () => void
  closeAuth: () => void
}

const AuthAccessContext = createContext<AuthAccess>({
  configured: false,
  isLoaded: true,
  isSignedIn: false,
  openAuth: () => undefined,
  closeAuth: () => undefined,
})

export function useAuthAccess() {
  return useContext(AuthAccessContext)
}

// why: keys the app tree. Sign-out and account switches remount so no screen keeps the old account's state; signing in keeps what the player entered, like a scanned invite.
function useAccountGeneration(userId: string | undefined) {
  const [account, setAccount] = useState({ userId, generation: 0 })
  if (account.userId === userId) return account.generation
  const generation = account.userId === undefined ? account.generation : account.generation + 1
  setAccount({ userId, generation })
  return generation
}

export function ConfiguredAuth({
  children,
  convexUrl,
}: {
  children: ReactNode
  convexUrl: string
}) {
  // Keeping pending sessions signed in prevents required session tasks from tearing down auth UI.
  const { isLoaded, isSignedIn } = useAuth({ treatPendingAsSignedOut: false })
  const { user } = useUser()
  const revenueCat = readRevenueCatConfig()
  const [visible, setVisible] = useState(false)
  const [convexAuthRetryKey, setConvexAuthRetryKey] = useState(0)
  const sessionHint = useSessionHint({
    isLoaded: Boolean(isLoaded),
    isSignedIn: Boolean(isSignedIn),
    userId: user?.id,
  })
  const accountGeneration = useAccountGeneration(user?.id ?? sessionHint?.userId ?? undefined)
  const value = useMemo<AuthAccess>(
    () => ({
      configured: true,
      isLoaded,
      isSignedIn: Boolean(isSignedIn),
      userId: user?.id,
      sessionHint,
      openAuth: () => setVisible(true),
      closeAuth: () => setVisible(false),
    }),
    [isLoaded, isSignedIn, user?.id, sessionHint],
  )
  const client = useMemo(
    () => new ConvexReactClient(convexUrl, { initialAuthTokenReuse: true }),
    [convexUrl],
  )
  const convexUseAuth = useMemo(
    () => createConvexAuthHook(useAuth, convexAuthRetryKey),
    [convexAuthRetryKey],
  )
  const retryConvexAuth = useCallback(() => {
    setConvexAuthRetryKey((key) => key + 1)
  }, [])

  return (
    <ConvexProviderWithAuth client={client} useAuth={convexUseAuth}>
      <DeckSyncSession ownerId={isLoaded && isSignedIn ? user?.id : undefined} />
      <ConvexAuthReconnect onReconnect={retryConvexAuth} />
      {/* why: the hinted user counts as the account, so Clerk confirming that user at launch does not remount the app. */}
      <RevenueCatProvider
        key={accountGeneration}
        apiKey={revenueCat.configured ? revenueCat.value.apiKey : undefined}
        appUserID={user?.id}
        configurationMessage={revenueCat.configured ? undefined : revenueCat.message}
      >
        <AuthAccessContext.Provider value={value}>
          {revenueCat.configured && isLoaded && isSignedIn ? <RevenueCatSyncSession /> : null}
          {children}
          {/* Intentionally always mounted beside app content; visibility alone is toggled. */}
          <ClerkAuthModal visible={visible} onDismiss={() => setVisible(false)} />
        </AuthAccessContext.Provider>
      </RevenueCatProvider>
    </ConvexProviderWithAuth>
  )
}

export function CloudProviders({ children }: { children: ReactNode }) {
  const config = readPublicCloudConfig()
  if (!config.configured) {
    return (
      <AuthAccessContext.Provider
        value={{
          configured: false,
          configurationMessage: config.message,
          isLoaded: true,
          isSignedIn: false,
          openAuth: () => undefined,
          closeAuth: () => undefined,
        }}
      >
        {children}
      </AuthAccessContext.Provider>
    )
  }

  return (
    <ClerkProvider
      publishableKey={config.value.clerkPublishableKey}
      tokenCache={tokenCache}
      afterSignOutUrl={APP_ROOT_URL}
      __experimental_resourceCache={resourceCache}
    >
      <ConfiguredAuth convexUrl={config.value.convexUrl}>{children}</ConfiguredAuth>
    </ClerkProvider>
  )
}
