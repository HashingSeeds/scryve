// why: one lazy boundary for the SDK and its paywall UI; two would make Metro hoist the SDK into the chunk every web page loads.
export { default as Purchases } from "react-native-purchases"
export { presentCountCustomerCenter, presentCountProPaywall } from "./revenueCatUi"
