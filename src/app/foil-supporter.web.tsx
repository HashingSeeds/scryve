import { useState } from "react"
import { View } from "react-native"
import { router } from "expo-router"
import Head from "expo-router/head"

import { Button } from "@/components/Button"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { useAuthAccess } from "@/features/auth/AuthContext"
import { FOIL_PRODUCT_ID } from "@/features/billing/config"
import { useRevenueCat } from "@/features/billing/RevenueCatContext"

export default function FoilSupporterRoute() {
  const auth = useAuthAccess()
  const billing = useRevenueCat()
  const [purchasing, setPurchasing] = useState(false)

  async function purchase() {
    setPurchasing(true)
    try {
      await billing.purchase(FOIL_PRODUCT_ID)
    } finally {
      setPurchasing(false)
    }
  }

  return (
    <>
      <Head>
        <title>Scryve Foil Supporter</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <Screen
        preset="auto"
        contentInset="standard"
        header={{
          title: "Foil Supporter",
          collapseTitle: false,
          leftTx: "common:back",
          onLeftPress: () => router.replace("/"),
        }}
      >
        <View style={$content}>
          <Text text="US$500/year" preset="heading" accessibilityRole="header" />
          <Text text="The same Pro features. Optional support for Scryve. Renews yearly until canceled." />
          {!auth.isSignedIn ? (
            <>
              <Text
                text={auth.configurationMessage || "Sign in to link Foil to your Scryve account."}
              />
              <Button
                text="Sign in"
                disabled={!auth.configured || !auth.isLoaded}
                onPress={auth.openAuth}
              />
            </>
          ) : billing.isCountPro ? (
            <>
              <Text text="You already have Pro access. Manage your existing subscription before switching plans." />
              <Button
                text="Manage subscription"
                onPress={() => void billing.presentCustomerCenter()}
              />
            </>
          ) : (
            <Button
              text={purchasing ? "Opening checkout…" : "Choose Foil Supporter"}
              disabled={!billing.isReady || billing.isLoading || purchasing}
              onPress={() => void purchase()}
            />
          )}
          {auth.isSignedIn && !billing.configured ? (
            <Text
              text={billing.configurationMessage || "Purchases are unavailable in this build."}
              accessibilityRole="alert"
            />
          ) : null}
          {billing.error ? <Text text={billing.error} accessibilityRole="alert" /> : null}
        </View>
      </Screen>
    </>
  )
}

const $content = { gap: 16 }
