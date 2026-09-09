import { AppState } from "react-native"
import * as Updates from "expo-updates"

import { createClientId } from "@/features/game/domain"
import { loadString, saveString } from "@/utils/storage"

const ID_KEY = "scryve.diagnostics.id.v1"

export function diagnosticsId() {
  return loadString(ID_KEY)
}

export function getDiagnosticsId() {
  const existing = diagnosticsId()
  if (existing) return existing
  const id = createClientId("diagnostics")
  if (!saveString(ID_KEY, id)) throw new Error("Could not save diagnostics identifier")
  return id
}

export function diagnosticRelease() {
  return {
    updateId: Updates.updateId ?? "embedded",
    updateChannel: Updates.channel ?? "none",
    runtimeVersion: Updates.runtimeVersion ?? "unknown",
    embeddedLaunch: String(Updates.isEmbeddedLaunch),
  }
}

export function redactDiagnostic(value: unknown, depth = 0): unknown {
  if (depth > 12) return undefined
  if (typeof value === "string")
    return value
      .replace(/https?:\/\/[^\s)"'<>]+/gi, "[URL removed]")
      .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "[email removed]")
      .replace(/\bBearer\s+\S+|\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, "[token removed]")
      .replace(/\b(password|token|secret|invite(?:_code)?)\s*[:=]\s*\S+/gi, "$1=[removed]")
  if (Array.isArray(value)) return value.map((item) => redactDiagnostic(item, depth + 1))
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key]) =>
            !/authorization|cookie|password|secret|token|clipboard|email|vars|context_line|pre_context|post_context/i.test(
              key,
            ),
        )
        .map(([key, item]) => [
          key,
          (key === "filename" || key === "abs_path") && typeof item === "string"
            ? item.split(/[?#]/)[0]
            : redactDiagnostic(item, depth + 1),
        ]),
    )
  return value
}

export function diagnosticProperties(properties: Record<string, unknown>) {
  const allowed = new Set([
    "$exception_list",
    "$exception_steps",
    "$exception_level",
    "$exception_fingerprint",
    "$session_id",
    "$window_id",
    "distinct_id",
    "$device_id",
    "$lib",
    "$lib_version",
    "token",
    "$debug_images",
    "$release_id",
    "$app_namespace",
    "$app_version",
    "$app_build",
    "$os_name",
    "$os_version",
    "$device_model",
    "errorType",
  ])
  return {
    ...Object.fromEntries(
      Object.entries(properties)
        .filter(([key]) => allowed.has(key))
        .map(([key, value]) => [key, redactDiagnostic(value)]),
    ),
    ...diagnosticRelease(),
    $geoip_disable: true,
    $process_person_profile: false,
  }
}

export function createErrorReplay(start: () => unknown, stop: () => unknown) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending = Promise.resolve()
  const finish = () => {
    clearTimeout(timer)
    timer = undefined
    pending = pending
      .then(stop)
      .then(() => undefined)
      .catch(() => undefined)
  }
  AppState.addEventListener("change", (state) => {
    if (state !== "active") finish()
  })
  return () => {
    if (AppState.currentState === "background" || AppState.currentState === "inactive") return
    if (!timer)
      pending = pending
        .then(start)
        .then(() => undefined)
        .catch(() => undefined)
    clearTimeout(timer)
    timer = setTimeout(finish, 60_000)
  }
}
