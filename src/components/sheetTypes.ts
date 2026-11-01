import type { ReactNode } from "react"

export interface SheetProps {
  visible: boolean
  onClose: () => void
  onDismissed?: () => void
  size?: "fit" | "full"
  dismissible?: boolean
  edgeToEdge?: boolean
  testID?: string
  children: ReactNode
}
