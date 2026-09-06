import { router } from "expo-router"

import { InviteScannerScreen } from "@/screens/InviteScannerScreen"

export default function ScanInviteRoute() {
  return (
    <InviteScannerScreen
      onCancel={() => router.back()}
      onInvite={(invite) => {
        if (invite.kind === "token") {
          router.replace({ pathname: "/join/[token]", params: { token: invite.token } })
        } else {
          router.replace({ pathname: "/connected/join", params: { code: invite.code } })
        }
      }}
    />
  )
}
