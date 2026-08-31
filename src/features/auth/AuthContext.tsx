import { createContext, ReactNode, useCallback, useContext, useMemo, useState } from "react"
import { ClerkProvider, useAuth, useUser } from "@clerk/expo"
import { tokenCache } from "@clerk/expo/token-cache"
import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react"

import { readPublicCloudConfig } from "@/features/auth/config"
import { readRevenueCatConfig } from "@/features/billing/config"
import { RevenueCatProvider } from "@/features/billing/RevenueCatContext"

import { ClerkAuthModal } from "./ClerkAuthModal"
import { ConvexAuthReconnect, createConvexAuthHook } from "./convexAuth"
import { resourceCache } from "./resourceCache"

interface AuthAccess {
  configured: boolean
  configurationMessage?: string
  isLoaded: boolean
  isSignedIn: boolean
  userId?: string
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
  const value = useMemo<AuthAccess>(
    () => ({
      configured: true,
      isLoaded,
      isSignedIn: Boolean(isSignedIn),
      userId: user?.id,
      openAuth: () => setVisible(true),
      closeAuth: () => setVisible(false),
    }),
    [isLoaded, isSignedIn, user?.id],
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
      <ConvexAuthReconnect onReconnect={retryConvexAuth} />
      <RevenueCatProvider
        apiKey={revenueCat.configured ? revenueCat.value.apiKey : undefined}
        appUserID={user?.id}
        configurationMessage={revenueCat.configured ? undefined : revenueCat.message}
      >
        <AuthAccessContext.Provider value={value}>
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
      __experimental_resourceCache={resourceCache}
    >
      <ConfiguredAuth convexUrl={config.value.convexUrl}>{children}</ConfiguredAuth>
    </ClerkProvider>
  )
}
