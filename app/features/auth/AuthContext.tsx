import { createContext, ReactNode, useContext, useMemo, useState } from "react"
import {
  Modal,
  Platform,
  Pressable,
  // Auth providers intentionally sit above the themed component provider.
  // eslint-disable-next-line no-restricted-imports
  Text as NativeText,
  View,
} from "react-native"
import { ClerkProvider, useAuth } from "@clerk/expo"
import { AuthView } from "@clerk/expo/native"
import { tokenCache } from "@clerk/expo/token-cache"
import { ConvexReactClient } from "convex/react"
import { ConvexProviderWithClerk } from "convex/react-clerk"

import { readPublicCloudConfig } from "@/features/auth/config"

interface AuthAccess {
  configured: boolean
  configurationMessage?: string
  isLoaded: boolean
  isSignedIn: boolean
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
  const [visible, setVisible] = useState(false)
  const value = useMemo<AuthAccess>(
    () => ({
      configured: true,
      isLoaded,
      isSignedIn: Boolean(isSignedIn),
      openAuth: () => setVisible(true),
      closeAuth: () => setVisible(false),
    }),
    [isLoaded, isSignedIn],
  )
  const client = useMemo(() => new ConvexReactClient(convexUrl), [convexUrl])

  return (
    <ConvexProviderWithClerk client={client} useAuth={useAuth}>
      <AuthAccessContext.Provider value={value}>
        {children}
        {/* Intentionally always mounted beside app content; visibility alone is toggled. */}
        <Modal
          testID="auth-modal"
          visible={visible}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setVisible(false)}
        >
          <View style={$modal}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close sign in"
              onPress={() => setVisible(false)}
              style={$closeButton}
            >
              <NativeText>Close</NativeText>
            </Pressable>
            {Platform.OS === "web" ? (
              <NativeText>Native sign-in requires an iOS or Android development build.</NativeText>
            ) : (
              <AuthView mode="signInOrUp" isDismissible onDismiss={() => setVisible(false)} />
            )}
          </View>
        </Modal>
      </AuthAccessContext.Provider>
    </ConvexProviderWithClerk>
  )
}

const $modal = { flex: 1, paddingTop: 12 } as const
const $closeButton = { minHeight: 44, padding: 12 } as const

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
