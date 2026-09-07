import { useCallback } from "react"
import { AppState, Platform } from "react-native"
import { useFocusEffect } from "expo-router"

import { requestStoreReview } from "@/utils/storeReview"

export function useStoreReview(finished: boolean) {
  useFocusEffect(
    useCallback(() => {
      if (__DEV__ || Platform.OS === "web" || !finished || AppState.currentState !== "active")
        return
      let active = true
      const timer = setTimeout(() => {
        void requestStoreReview(() => active && AppState.currentState === "active")
      }, 2000)
      const subscription = AppState.addEventListener("change", (state) => {
        if (state !== "active") {
          active = false
          clearTimeout(timer)
        }
      })
      return () => {
        active = false
        clearTimeout(timer)
        subscription.remove()
      }
    }, [finished]),
  )
}
