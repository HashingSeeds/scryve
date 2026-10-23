import type { ReactNode } from "react"

export interface AccountProfileProps {
  onBack?: () => void
  onSigningOut?: (signingOut: boolean) => void
  onOpenTerms: () => void
  onOpenPrivacy: () => void
  onOpenGameContentNotices: () => void
  accountControls?: ReactNode
}
