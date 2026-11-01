import type { ReactNode } from "react"

export interface SheetProps {
  visible: boolean
  onClose: () => void
  onDismissed?: () => void
  testID?: string
  children: ReactNode
}
