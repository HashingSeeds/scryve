import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"
import { useUser } from "@clerk/expo"
import { useConvexAuth, useConvexConnectionState, useMutation } from "convex/react"

import { api } from "../../../convex/_generated/api"
import { MAX_DISPLAY_NAME_LENGTH } from "../../../convex/lib/policy"

export function connectedProfileName(username: string | null | undefined) {
  return username?.trim().slice(0, MAX_DISPLAY_NAME_LENGTH) || "Player"
}

interface ConnectedProfileDetails {
  userId: string
  displayName: string
  avatarUrl?: string
}

interface ConnectedProfileBase {
  retry: () => void
}

export type ConnectedProfileState =
  | (ConnectedProfileBase & {
      status: "loading"
      reason: "session" | "authentication" | "profile"
      profile?: ConnectedProfileDetails
    })
  | (ConnectedProfileBase & {
      status: "offline"
      profile?: ConnectedProfileDetails
    })
  | (ConnectedProfileBase & {
      status: "ready"
      profile: ConnectedProfileDetails
    })
  | (ConnectedProfileBase & {
      status: "error"
      reason: "signedOut" | "authentication" | "sync"
      message: string
      profile?: ConnectedProfileDetails
    })

type SyncedProfile = ConnectedProfileDetails

const bootstrapCache: { profile?: SyncedProfile } = {}
let inFlightSync:
  | {
      profile: SyncedProfile
      promise: Promise<unknown>
    }
  | undefined

function profilesMatch(left: SyncedProfile | undefined, right: SyncedProfile) {
  return (
    left?.userId === right.userId &&
    left.displayName === right.displayName &&
    left.avatarUrl === right.avatarUrl
  )
}

function syncProfile(
  profile: SyncedProfile,
  syncCurrent: (args: { displayName: string; avatarUrl?: string }) => Promise<unknown>,
) {
  if (inFlightSync && profilesMatch(inFlightSync.profile, profile)) return inFlightSync.promise
  const request = {
    profile,
    promise: syncCurrent({ displayName: profile.displayName, avatarUrl: profile.avatarUrl }),
  }
  inFlightSync = request
  const clearRequest = () => {
    if (inFlightSync === request) inFlightSync = undefined
  }
  void request.promise.then(clearRequest, clearRequest)
  return request.promise
}

const ConnectedProfileContext = createContext<ConnectedProfileState | undefined>(undefined)

export function resetConnectedProfileBootstrapForTests() {
  bootstrapCache.profile = undefined
  inFlightSync = undefined
}

export function ConnectedProfileProvider({ children }: { children: ReactNode }) {
  const { isLoaded: isUserLoaded, user } = useUser()
  const {
    isAuthenticated,
    isLoading: isAuthenticationLoading,
    isRefreshing: isAuthenticationRefreshing,
  } = useConvexAuth()
  const { isWebSocketConnected } = useConvexConnectionState()
  const syncCurrent = useMutation(api.users.syncCurrent)
  const [readyUserId, setReadyUserId] = useState<string | undefined>(bootstrapCache.profile?.userId)
  const [failure, setFailure] = useState<{ userId: string; message: string }>()
  const [syncAttempt, setSyncAttempt] = useState(0)
  const profile = useMemo(
    () =>
      user?.id
        ? {
            userId: user.id,
            displayName: connectedProfileName(user.username),
            avatarUrl: user.imageUrl,
          }
        : undefined,
    [user?.id, user?.imageUrl, user?.username],
  )

  useEffect(() => {
    if (
      !isUserLoaded ||
      !isAuthenticated ||
      isAuthenticationRefreshing ||
      !isWebSocketConnected ||
      !profile
    )
      return
    let cancelled = false
    void syncProfile(profile, syncCurrent)
      .then(() => {
        if (cancelled) return
        bootstrapCache.profile = profile
        setReadyUserId(profile.userId)
        setFailure(undefined)
      })
      .catch((cause) => {
        if (cancelled) return
        if (bootstrapCache.profile?.userId === profile.userId) bootstrapCache.profile = undefined
        setReadyUserId((ready) => (ready === profile.userId ? undefined : ready))
        setFailure({
          userId: profile.userId,
          message: cause instanceof Error ? cause.message : "Could not prepare connected play",
        })
      })
    return () => {
      cancelled = true
    }
  }, [
    isAuthenticated,
    isAuthenticationRefreshing,
    isUserLoaded,
    isWebSocketConnected,
    profile,
    syncAttempt,
    syncCurrent,
  ])

  const retry = useCallback(() => {
    if (profile?.userId && bootstrapCache.profile?.userId === profile.userId)
      bootstrapCache.profile = undefined
    setReadyUserId((ready) => (ready === profile?.userId ? undefined : ready))
    setFailure(undefined)
    setSyncAttempt((attempt) => attempt + 1)
  }, [profile?.userId])

  let state: ConnectedProfileState
  if (!isUserLoaded) {
    state = { status: "loading", reason: "session", retry }
  } else if (!isWebSocketConnected) {
    state = { status: "offline", profile, retry }
  } else if (!profile) {
    state = {
      status: "error",
      reason: "signedOut",
      message: "You are signed out or your session expired.",
      retry,
    }
  } else if (isAuthenticationLoading || isAuthenticationRefreshing) {
    state = { status: "loading", reason: "authentication", profile, retry }
  } else if (isAuthenticated && readyUserId === profile.userId) {
    state = { status: "ready", profile, retry }
  } else if (!isAuthenticated) {
    state = {
      status: "error",
      reason: "authentication",
      message: "Convex rejected this signed-in session.",
      profile,
      retry,
    }
  } else if (failure?.userId === profile.userId) {
    state = { status: "error", reason: "sync", message: failure.message, profile, retry }
  } else {
    state = { status: "loading", reason: "profile", profile, retry }
  }

  return (
    <ConnectedProfileContext.Provider value={state}>{children}</ConnectedProfileContext.Provider>
  )
}

export function useConnectedProfile() {
  const state = useContext(ConnectedProfileContext)
  if (!state) throw new Error("useConnectedProfile must be used inside ConnectedProfileProvider")
  return state
}
