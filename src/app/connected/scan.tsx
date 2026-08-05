import { router } from "expo-router"

import { ConnectedGate } from "@/features/connected/ConnectedGate"
import { logInviteScanDiagnostic } from "@/features/connected/inviteScanDiagnostics"
import { InviteScannerScreen } from "@/screens/InviteScannerScreen"

export default function ScanInviteRoute() {
  return (
    <ConnectedGate onBack={() => router.back()}>
      <InviteScannerScreen
        onCancel={() => router.back()}
        onInvite={(invite) => {
          logInviteScanDiagnostic("route_handoff", { inviteKind: invite.kind })
          if (invite.kind === "token") {
            router.replace({ pathname: "/join/[token]", params: { token: invite.token } })
          } else {
            router.replace({ pathname: "/connected/join", params: { code: invite.code } })
          }
        }}
      />
    </ConnectedGate>
  )
}
