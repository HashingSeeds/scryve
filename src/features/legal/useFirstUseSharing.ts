import { useState } from "react"

import { analyticsConfigured, analyticsEnabled, setAnalyticsEnabled } from "@/utils/analytics"

export function useFirstUseSharing() {
  const [sharing, setSharing] = useState(analyticsEnabled)
  const [saveFailed, setSaveFailed] = useState(false)

  function saveSharing() {
    if (sharing === analyticsEnabled() || setAnalyticsEnabled(sharing, "first_use")) return true
    setSaveFailed(true)
    return false
  }

  return { configured: analyticsConfigured(), sharing, setSharing, saveFailed, saveSharing }
}
