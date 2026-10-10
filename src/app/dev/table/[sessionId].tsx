import { Redirect, router, useLocalSearchParams } from "expo-router"

import { TableGuestScreen } from "@/screens/TableGuestScreen"

/** why: the host's QR code links here, so a guest joins by pointing a camera at it. */
export default function TableGuestRoute() {
  const { sessionId, stress } = useLocalSearchParams<{ sessionId: string; stress?: string }>()
  if (!__DEV__ || !sessionId) return <Redirect href="/" />
  return (
    <TableGuestScreen
      sessionId={sessionId}
      stressTaps={stress ? Number(stress) : undefined}
      onLeave={() => router.replace({ pathname: "/", params: { destination: "play" } })}
    />
  )
}
