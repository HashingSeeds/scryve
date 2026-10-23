/** why: a static expo-router import here would break every Jest suite that renders the app menu, since jest-expo can't parse expo-router's ESM dependencies. */
export function openEvents(nearbyOnly: boolean) {
  const { router } = require("expo-router") as typeof import("expo-router")
  router.push(nearbyOnly ? "/events/nearby" : "/events")
}
