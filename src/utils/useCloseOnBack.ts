import { useEffect, useEffectEvent } from "react"
import { BackHandler } from "react-native"

/** why: board overlays are plain views, not Modals, so nothing else consumes Android Back and it would leave the app. While `open`, Back calls `onClose` instead. BackHandler runs the newest listener first, so the last overlay opened closes first. */
export function useCloseOnBack(open: boolean, onClose: () => void) {
  const close = useEffectEvent(onClose)
  useEffect(() => {
    if (!open) return
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      close()
      return true
    })
    return () => subscription.remove()
  }, [open])
}
