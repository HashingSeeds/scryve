export const INVITE_SCAN_DEBUG_PREFIX = "[DEBUG-QR-71f3]"

type InviteScanDiagnosticMetadata = {
  barcodeType?: string
  dataLength?: number
  inviteKind?: "code" | "token"
  message?: string
}

export function logInviteScanDiagnostic(
  step: string,
  metadata: InviteScanDiagnosticMetadata = {},
): void {
  if (__DEV__) console.info(INVITE_SCAN_DEBUG_PREFIX, { step, ...metadata })
}
