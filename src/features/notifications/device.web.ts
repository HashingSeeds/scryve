export const pushSupported = false

export async function requestPush() {
  return false
}

export async function pushToken(): Promise<string | null> {
  return null
}

export function onNotificationOpened(_open: (url: string) => void) {
  return () => undefined
}
