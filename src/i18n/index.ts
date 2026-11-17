import * as Localization from "expo-localization"
import i18n, { type BackendModule, type PostProcessorModule } from "i18next"
import { initReactI18next } from "react-i18next"
import "intl-pluralrules"

import type { Translations } from "./en"
import { formatInterpolation, isPseudoLocale } from "./format"
import type { LocaleNamespace } from "./localeNamespace"
import { namespaces, resources } from "./resources"

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

const RTL_LANGUAGES = new Set(["ar", "he", "fa", "ur"])

export const isRTL = RTL_LANGUAGES.has(appLocale.split("-")[0])

export const appDirection = isRTL ? "rtl" : "ltr"

type Bundle = Readonly<Record<string, LocaleNamespace>>

const loadLocaleOnDemand: BackendModule = {
  type: "backend",
  init: () => undefined,
  read: (language, namespace, callback) => {
    if (!isBundledLocale(language)) return callback(null, undefined)
    const bundle: Bundle | Promise<Bundle> = resources[language]()
    if (bundle instanceof Promise)
      bundle.then(
        (loaded) => callback(null, loaded[namespace]),
        (error: Error) => callback(error, undefined),
      )
    else callback(null, bundle[namespace])
  },
}

const pseudoLocaleBrackets: PostProcessorModule = {
  type: "postProcessor",
  name: "pseudoLocale",
  process: (value: string) => (isPseudoLocale() ? `\u27e6${value}\u27e7` : value),
}

export const languageLoaded = i18n
  .use(loadLocaleOnDemand)
  .use(pseudoLocaleBrackets)
  .use(initReactI18next)
  .init({
    ns: namespaces,
    lng: appLocale,
    fallbackLng: fallbackLocale,
    interpolation: {
      escapeValue: false,
      alwaysFormat: true,
      format: formatInterpolation,
    },
    postProcess: ["pseudoLocale"],
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
