import type { ReactNode } from "react"

export interface AccountProfileProps {
  onBack?: () => void
  onSignedOut?: () => void
  accountControls?: ReactNode
}
