import { createContext, ReactNode, useContext, useMemo, useState } from "react"
import { ClerkProvider, useAuth, useUser } from "@clerk/expo"
import { tokenCache } from "@clerk/expo/token-cache"
import { ConvexReactClient } from "convex/react"
import { ConvexProviderWithClerk } from "convex/react-clerk"

import { readPublicCloudConfig } from "@/features/auth/config"
import { readRevenueCatConfig } from "@/features/billing/config"
import { RevenueCatProvider } from "@/features/billing/RevenueCatContext"

import { ClerkAuthModal } from "./ClerkAuthModal"

interface AuthAccess {
  configured: boolean
  configurationMessage?: string
  isLoaded: boolean
  isSignedIn: boolean
  userId?: string
  username?: string
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
  const value = useMemo<AuthAccess>(
    () => ({
      configured: true,
      isLoaded,
      isSignedIn: Boolean(isSignedIn),
      userId: user?.id,
      username: user?.username ?? undefined,
      openAuth: () => setVisible(true),
      closeAuth: () => setVisible(false),
    }),
    [isLoaded, isSignedIn, user?.id, user?.username],
  )
  const client = useMemo(() => new ConvexReactClient(convexUrl), [convexUrl])

  return (
    <ConvexProviderWithClerk client={client} useAuth={useAuth}>
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
    </ConvexProviderWithClerk>
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
    <ClerkProvider publishableKey={config.value.clerkPublishableKey} tokenCache={tokenCache}>
      <ConfiguredAuth convexUrl={config.value.convexUrl}>{children}</ConfiguredAuth>
    </ClerkProvider>
  )
}
