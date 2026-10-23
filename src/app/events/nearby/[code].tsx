// why: Expo Router bundles every route file for web, and nearby events need native Bonjour and TCP modules, so this route lives behind a platform file web never resolves.
export { default } from "@/features/events/nearby/routes/NearbyEventRoute"
