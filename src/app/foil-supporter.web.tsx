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
import { translate } from "@/i18n/translate"

export default function FoilSupporterRoute() {
  const auth = useAuthAccess()
  const billing = useRevenueCat()
  const [purchasing, setPurchasing] = useState(false)

  const copy = {
    pageTitle: translate("account:foil.pageTitle"),
    signInPrompt: auth.configurationMessage || translate("account:foil.signInPrompt"),
    purchasesUnavailable:
      billing.configurationMessage || translate("account:foil.purchasesUnavailable"),
  }

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
        <title>{copy.pageTitle}</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <Screen
        preset="auto"
        contentInset="standard"
        header={{
          titleTx: "account:foil.title",
          collapseTitle: false,
          leftTx: "common:back",
          onLeftPress: () => router.dismissTo("/"),
        }}
      >
        <View style={$content}>
          <Text tx="account:foil.price" preset="heading" accessibilityRole="header" />
          <Text tx="account:foil.description" />
          {!auth.isSignedIn ? (
            <>
              <Text text={copy.signInPrompt} />
              <Button
                tx="account:signIn"
                disabled={!auth.configured || !auth.isLoaded}
                onPress={auth.openAuth}
              />
            </>
          ) : billing.isCountPro ? (
            <>
              <Text tx="account:foil.alreadyPro" />
              <Button
                tx="account:foil.manageSubscription"
                onPress={() => void billing.presentCustomerCenter()}
              />
            </>
          ) : (
            <Button
              tx={purchasing ? "account:foil.openingCheckout" : "account:foil.choose"}
              disabled={!billing.isReady || billing.isLoading || purchasing}
              onPress={() => void purchase()}
            />
          )}
          {auth.isSignedIn && !billing.configured ? (
            <Text text={copy.purchasesUnavailable} accessibilityRole="alert" />
          ) : null}
          {billing.error ? <Text text={billing.error} accessibilityRole="alert" /> : null}
        </View>
      </Screen>
    </>
  )
}

const $content = { gap: 16 }
