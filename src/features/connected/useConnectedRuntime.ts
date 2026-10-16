import { useEffect, useMemo, useRef, useState } from "react"
import { useValue } from "@legendapp/state/react"

import { asDeviceId } from "@/features/game/domain"
import { LocalGameRepository } from "@/features/game/localPersistence"
import { playTableRules } from "@/features/game/playSystems"
import type { TableRuntime } from "@/features/game/tableRuntime"
import type { LifeDelta } from "@/features/game/types"
import type { OutboxAcknowledgement } from "@/features/sync/drainOutbox"
import { captureGame } from "@/utils/analytics"
import { recordReviewCompletion } from "@/utils/storeReview"

import type {
  ConnectedCommanderDamageChange,
  ConnectedCommanderDamageClaim,
  ConnectedDisplayProjection,
  ConnectedOperationStatus,
  ConnectionStatus,
  FailedLifeAction,
  PendingLifeAction,
} from "./model"
import {
  OutboxSyncController,
  type ConnectedGameResult,
  type OutboxSyncEnvironment,
} from "./OutboxSyncController"
import { ConnectedGameRepository } from "./persistence"
import { EMPTY_TABLE } from "../../../convex/lib/table"

interface ConnectedGameRuntimeBase extends TableRuntime {
  pending: PendingLifeAction[]
  failed: FailedLifeAction[]
  connectionStatus: ConnectionStatus
  changeLife: (playerId: string, delta: LifeDelta) => void
  submitCommanderDamage: (
    fromPlayerId: string,
    changes: readonly ConnectedCommanderDamageChange[],
  ) => void
  resolveCommanderDamageClaim: (claim: ConnectedCommanderDamageClaim, accepted: boolean) => void
  finish: (result?: ConnectedGameResult) => Promise<boolean>
  abandon: () => Promise<boolean>
  dismissFailed: (operationId: string) => void
  changeError?: string
  finishError?: string
  finishing: boolean
}

export type ConnectedGameRuntime = ConnectedGameRuntimeBase &
  (
    | { status: "loading"; projection: null }
    | { status: "unavailable"; message: string; projection: null }
    | {
        status: "ready"
        source: "cache" | "remote"
        projection: ConnectedDisplayProjection
      }
  )

export const CONNECTED_GAME_UNAVAILABLE_MS = 1_500

export interface ConnectedWrites {
  send: (action: PendingLifeAction) => Promise<OutboxAcknowledgement>
  finish: (result?: ConnectedGameResult) => Promise<unknown>
  abandon: () => Promise<unknown>
}

export interface ConnectedFeed {
  remote: unknown
  operationStatus?: ConnectedOperationStatus
  environment: OutboxSyncEnvironment
}

export function useConnectedSession({
  publicId,
  ownerId,
  scope,
  writes,
  awaitProjectionBarrier,
}: {
  publicId: string
  ownerId: string
  scope: string
  writes: ConnectedWrites
  awaitProjectionBarrier: boolean
}) {
  const repository = useMemo(
    () => new ConnectedGameRepository(undefined, ownerId, {}, scope),
    [ownerId, scope],
  )
  const deviceId = useRef(asDeviceId(new LocalGameRepository().getDeviceId())).current
  const latestWrites = useRef(writes)
  latestWrites.current = writes
  const controller = useMemo(
    () =>
      new OutboxSyncController({
        repository,
        publicId,
        ownerId,
        deviceId,
        send: (action) => latestWrites.current.send(action),
        finishGame: (result) => latestWrites.current.finish(result),
        abandonGame: () => latestWrites.current.abandon(),
        awaitProjectionBarrier,
      }),
    [awaitProjectionBarrier, deviceId, ownerId, publicId, repository],
  )
  const snapshot = useValue(() => controller.state$.get())
  useEffect(() => () => controller.dispose(), [controller])
  return { controller, snapshot, deviceId, head: snapshot.pending[0]?.event }
}

export type ConnectedSession = ReturnType<typeof useConnectedSession>

export function useConnectedRuntime(
  { controller, snapshot, head }: ConnectedSession,
  { remote, operationStatus, environment }: ConnectedFeed,
): ConnectedGameRuntime {
  const { isWebSocketConnected, isLoading, isRefreshing, remoteReady } = environment
  const unreachableWithoutCache =
    !snapshot.projection && !remoteReady && !isWebSocketConnected && !isLoading && !isRefreshing
  const [unreachableTimedOut, setUnreachableTimedOut] = useState(false)
  useEffect(() => {
    if (!unreachableWithoutCache) {
      setUnreachableTimedOut(false)
      return
    }
    const timer = setTimeout(() => setUnreachableTimedOut(true), CONNECTED_GAME_UNAVAILABLE_MS)
    return () => clearTimeout(timer)
  }, [unreachableWithoutCache])
  const observedGame = useRef<{ id: string; status: string } | undefined>(undefined)
  useEffect(() => {
    const projection = snapshot.projection
    if (!projection) return
    const previous = observedGame.current
    if (
      previous?.id === projection.publicId &&
      previous.status === "active" &&
      projection.status === "finished"
    ) {
      recordReviewCompletion(`connected:${projection.publicId}`)
      captureGame(
        "game_completed",
        {
          id: projection.publicId,
          system: projection.system,
          format: projection.format,
          playerCount: projection.playerCount,
        },
        "connected",
      )
    }
    observedGame.current = { id: projection.publicId, status: projection.status }
  }, [snapshot.projection])

  const { isAuthenticated } = environment
  useEffect(() => {
    controller.setEnvironment({
      isAuthenticated,
      isLoading,
      isRefreshing,
      isWebSocketConnected,
      remoteReady,
    })
  }, [controller, isAuthenticated, isLoading, isRefreshing, isWebSocketConnected, remoteReady])

  useEffect(() => {
    if (head && operationStatus?.operationId !== head.operationId) return
    controller.onRemoteProjection(remote, operationStatus)
  }, [controller, isWebSocketConnected, remote, operationStatus, head])

  return useMemo((): ConnectedGameRuntime => {
    const projection = snapshot.projection
    const runtime = {
      ...controller.table,
      table: projection?.table ?? EMPTY_TABLE,
      tableRules: playTableRules(projection?.system, projection?.format),
      pending: snapshot.pending,
      failed: snapshot.failed,
      connectionStatus: snapshot.connectionStatus,
      changeError: snapshot.changeError,
      finishError: snapshot.finishError,
      finishing: snapshot.finishing,
      changeLife: controller.changeLife,
      submitCommanderDamage: controller.submitCommanderDamage,
      resolveCommanderDamageClaim: controller.resolveCommanderDamage,
      finish: controller.finish,
      abandon: controller.abandon,
      dismissFailed: controller.dismissFailed,
    }
    return projection
      ? {
          ...runtime,
          status: "ready",
          source: remoteReady ? "remote" : "cache",
          projection,
        }
      : unreachableTimedOut
        ? {
            ...runtime,
            status: "unavailable",
            message:
              "This board is not saved on this device. Reconnect so the game can be loaded here.",
            projection: null,
          }
        : { ...runtime, status: "loading", projection: null }
  }, [controller, remoteReady, snapshot, unreachableTimedOut])
}
