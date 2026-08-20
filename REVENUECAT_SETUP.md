# RevenueCat setup for Scryve

The app integration expects one RevenueCat project shared by iOS, Android, and web. Clerk's
`user.id` is the RevenueCat App User ID on every platform so a customer's access follows the
same account.

## 1. Install and run the SDK

The packages are installed with Expo-compatible versions:

```sh
npx expo install react-native-purchases react-native-purchases-ui
```

Use an Expo development build for store purchases:

```sh
pnpm ios
pnpm android
```

Expo Go can preview the RevenueCat API and paywall UI, but it cannot complete real App Store or
Play Store purchases. Rebuild the development client after adding or updating native SDKs.

## 2. Add the RevenueCat apps and public SDK keys

In RevenueCat, add the stores used by Scryve:

- iOS bundle ID: `com.sowinghope.count`
- Android package: `com.sowinghope.count`
- Web: configure a RevenueCat Web Billing app if Scryve will sell on the web
- Test Store: use this while developing with the supplied `test_...` public SDK key

The local, ignored `.env.development` contains the supplied Test Store key. For production, use
each app's public SDK key and set these through EAS environment variables:

```dotenv
EXPO_PUBLIC_REVENUECAT_IOS_API_KEY=appl_...
EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY=goog_...
EXPO_PUBLIC_REVENUECAT_WEB_API_KEY=rcb_...
```

`EXPO_PUBLIC_REVENUECAT_API_KEY` is a shared fallback intended for the Test Store. Public SDK
keys are designed to ship in apps. Never put a RevenueCat secret API key in an Expo variable.

Scryve's development and preview variants have different native identifiers. Add matching
RevenueCat/store apps if those variants will talk to Apple or Google instead of the Test Store.
Check `app.config.ts` before doing that; the existing preview identifier is
`com.sowinghpe.count.preview`.

## 3. Configure store products

Create these products in App Store Connect and Google Play, then import them into RevenueCat:

| RevenueCat/store product ID | Type                          | Duration  |
| --------------------------- | ----------------------------- | --------- |
| `lifetime`                  | Non-consumable/in-app product | One-time  |
| `yearly`                    | Auto-renewing subscription    | One year  |
| `monthly`                   | Auto-renewing subscription    | One month |

Put the Apple monthly and yearly products in the same subscription group. On Google Play, give
each subscription a backwards-compatible base plan and import the exact product/base-plan
combination RevenueCat shows. Product approval, pricing, tax, and availability still live in the
stores; RevenueCat does not replace that setup.

For the Test Store, create products with these same identifiers so development exercises the
same app code.

## 4. Configure the entitlement and offering

In RevenueCat:

1. Keep the existing entitlement lookup key `Count Pro` for purchase compatibility, but change its
   display name to **Scryve Pro**.
2. Attach `lifetime`, `yearly`, and `monthly` to that entitlement for every configured store.
3. Create an offering with identifier `default` and make it the current offering.
4. Add these packages to `default`:
   - Lifetime package (`$rc_lifetime`) → `lifetime`
   - Annual package (`$rc_annual`) → `yearly`
   - Monthly package (`$rc_monthly`) → `monthly`
5. Create a RevenueCat Paywall for `default`, include all three packages, show a restore action,
   and publish it.

The code deliberately looks up products in the current offering instead of hard-coding prices.
RevenueCat and the stores remain the source of truth for localized price, currency, trials, and
availability.

## 5. How Scryve uses the integration

- `RevenueCatProvider` configures the SDK only after Clerk has a stable signed-in user ID.
- `useCountPro()` derives access from `CustomerInfo.entitlements.active["Count Pro"]`.
- A customer-info listener keeps access current after purchases, renewals, cancellations, or
  changes from another device.
- `presentPaywall()` uses `presentPaywallIfNeeded`, so an active Scryve Pro customer is not shown
  the sales paywall.
- `purchase("monthly" | "yearly" | "lifetime")` supports a custom purchase UI if one is added
  later.
- `restorePurchases()` is user initiated and available from Account.
- Customer Center is available to active Scryve Pro customers. Native apps use RevenueCat's
  Customer Center; web opens RevenueCat's validated subscription-management URL.

The Account screen contains the initial subscription controls. Feature UI can gate presentation
with:

```tsx
import { useCountPro } from "@/features/billing/RevenueCatContext"

function ProFeature() {
  const { isCountPro, isLoading } = useCountPro()

  if (isLoading) return null
  if (!isCountPro) return <UpgradePrompt />
  return <CountProExperience />
}
```

## 6. Configure Customer Center

Enable Customer Center in the RevenueCat dashboard once production store products exist. It is
most useful after purchase because it gives customers a consistent place to inspect access,
restore, change plans where supported, and follow store-specific cancellation/refund flows.
Keep Apple's required restore path visible even if Customer Center is also present.

## 7. Backend enforcement

`CustomerInfo` is appropriate for responsive UI, but a client entitlement must not authorize a
privileged Convex mutation by itself. Configure RevenueCat webhooks to update Scryve's existing
server-side entitlement record, keyed by the same Clerk user ID, and keep Convex authorization as
the final authority for paid server features. Verify webhook authenticity/idempotency and process
purchase, renewal, expiration, cancellation, billing issue, and transfer events.

Until that webhook projection is implemented, the new SDK can sell and display Scryve Pro, but it
should not be treated as the server-side source of truth.

## 8. Test checklist

1. Sign into Scryve before opening the paywall; confirm the RevenueCat customer ID is the Clerk
   user ID.
2. Test monthly, yearly, and lifetime purchases with RevenueCat Test Store.
3. Confirm cancel leaves access unchanged and errors show a recoverable message.
4. Confirm restore updates Scryve Pro on a second installation signed into the same account.
5. Confirm active users do not see the paywall.
6. Confirm Customer Center opens and returning to Scryve refreshes `CustomerInfo`.
7. Repeat with Apple Sandbox/TestFlight and a Play license tester using development builds.
8. Verify expiration and billing-issue events remove server access after the webhook projection is
   installed.
