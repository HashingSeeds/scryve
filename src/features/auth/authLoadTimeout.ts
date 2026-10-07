// why: Clerk tries the network before its on-device cache, so screens waiting on it need a ceiling.
export const AUTH_LOAD_TIMEOUT_MS = 4000
