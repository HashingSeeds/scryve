import { useCallback, useContext, useEffect, useEffectEvent, useSyncExternalStore } from "react"
import { BackHandler } from "react-native"
import { NavigationContext } from "expo-router/react-navigation"

/** why: board overlays are plain views, not Modals, so nothing else consumes Android Back and it would leave the app. While `open` on the focused screen, Back calls `onClose` instead; a covered screen leaves Back to the navigator. BackHandler runs the newest listener first, so the last overlay opened closes first. */
export function useCloseOnBack(open: boolean, onClose: () => void) {
  const focused = useScreenFocused()
  const listening = open && focused
  const close = useEffectEvent(onClose)
  useEffect(() => {
    if (!listening) return
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      close()
      return true
    })
    return () => subscription.remove()
  }, [listening])
}

/** why: useIsFocused throws outside a navigator, and overlays render there in component tests, so a missing screen counts as focused. */
function useScreenFocused() {
  const navigation = useContext(NavigationContext)
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!navigation) return () => {}
      const offFocus = navigation.addListener("focus", onChange)
      const offBlur = navigation.addListener("blur", onChange)
      return () => {
        offFocus()
        offBlur()
      }
    },
    [navigation],
  )
  const focused = () => navigation?.isFocused() ?? true
  return useSyncExternalStore(subscribe, focused, focused)
}
