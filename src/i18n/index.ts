import { I18nManager } from "react-native"
import * as Localization from "expo-localization"
import i18n, { type BackendModule } from "i18next"
import { initReactI18next } from "react-i18next"
import "intl-pluralrules"

import type { Translations } from "./en"
import type { LocaleNamespace } from "./localeNamespace"
import { resources } from "./resources"

const fallbackLocale = "en-US"

const systemLocales = Localization.getLocales()

const isBundledLocale = (tag: string): tag is keyof typeof resources =>
  Object.hasOwn(resources, tag)

// Device locale may be more specific and still match (e.g., en-US matches en)
const systemTagMatchesSupportedTags = (deviceTag: string) =>
  isBundledLocale(deviceTag.split("-")[0])

const pickSupportedLocale: () => Localization.Locale | undefined = () => {
  return systemLocales.find((locale) => systemTagMatchesSupportedTags(locale.languageTag))
}

const locale = pickSupportedLocale()

const devLocaleOverride = __DEV__ ? process.env.EXPO_PUBLIC_LOCALE : undefined

export const appLocale = devLocaleOverride || locale?.languageTag || fallbackLocale

export let isRTL = false

// Need to set RTL ASAP to ensure the app is rendered correctly. Waiting for i18n to init is too late.
if (!devLocaleOverride && locale?.languageTag && locale?.textDirection === "rtl") {
  I18nManager.allowRTL(true)
  isRTL = true
} else {
  I18nManager.allowRTL(false)
}

const loadLocaleOnDemand: BackendModule = {
  type: "backend",
  init: () => undefined,
  read: (language, namespace, callback) => {
    const bundle: Readonly<Record<string, LocaleNamespace>> | undefined = isBundledLocale(language)
      ? resources[language]()
      : undefined
    callback(null, bundle?.[namespace])
  },
}

// why: the backend reads synchronously, so with initImmediate off the copy is ready before the first render.
void i18n
  .use(loadLocaleOnDemand)
  .use(initReactI18next)
  .init({
    ns: Object.keys(resources.en()),
    lng: appLocale,
    fallbackLng: fallbackLocale,
    interpolation: {
      escapeValue: false,
    },
    initImmediate: false,
  })

export { i18n }

export type TxKeyPath = RecursiveKeyOf<Translations>

type PluralSuffix = "zero" | "one" | "two" | "few" | "many" | "other"

type WithoutPluralSuffix<Key extends string> = Key extends `${infer Base}_${PluralSuffix}`
  ? Base
  : Key

// via: https://stackoverflow.com/a/65333050
type RecursiveKeyOf<TObj extends object> = {
  [TKey in keyof TObj & (string | number)]: RecursiveKeyOfHandleValue<TObj[TKey], `${TKey}`, true>
}[keyof TObj & (string | number)]

type RecursiveKeyOfInner<TObj extends object> = {
  [TKey in keyof TObj & (string | number)]: RecursiveKeyOfHandleValue<TObj[TKey], `${TKey}`, false>
}[keyof TObj & (string | number)]

type RecursiveKeyOfHandleValue<
  TValue,
  Text extends string,
  IsFirstLevel extends boolean,
> = TValue extends readonly unknown[]
  ? Text
  : TValue extends object
    ? IsFirstLevel extends true
      ? Text | `${Text}:${RecursiveKeyOfInner<TValue>}`
      : Text | `${Text}.${RecursiveKeyOfInner<TValue>}`
    : WithoutPluralSuffix<Text>
