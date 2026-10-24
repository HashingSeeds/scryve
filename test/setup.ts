import { createElement, forwardRef, useImperativeHandle, type ReactNode } from "react"
import "react-native-url-polyfill/auto"
import "react-native-gesture-handler/jestSetup"
// eslint-disable-next-line no-restricted-imports
import * as ReactNative from "react-native"

import mockFile from "./mockFile"

jest.doMock("react-native", () => {
  return Object.setPrototypeOf(
    {
      AccessibilityInfo: {
        ...ReactNative.AccessibilityInfo,
        announceForAccessibility: jest.fn(),
        isReduceMotionEnabled: jest.fn(() => new Promise<boolean>(() => undefined)),
        addEventListener: jest.fn(() => ({ remove: jest.fn() })),
      },
      Image: Object.assign(
        function Image(props: ReactNative.ImageProps) {
          return createElement(ReactNative.Image, props)
        },
        ReactNative.Image,
        {
          // why: expo-asset calls resolveAssetSource.setCustomSourceTransformer on import, so every suite that loads expo fails without it.
          resolveAssetSource: Object.assign(
            jest.fn((_source) => mockFile), // eslint-disable-line @typescript-eslint/no-unused-vars
            { setCustomSourceTransformer: jest.fn() },
          ),
          getSize: jest.fn(
            (
              uri: string, // eslint-disable-line @typescript-eslint/no-unused-vars
              success: (width: number, height: number) => void,
              failure?: (_error: any) => void, // eslint-disable-line @typescript-eslint/no-unused-vars
            ) => success(100, 100),
          ),
        },
      ),
      Pressable: Object.assign(
        forwardRef<
          {
            measureInWindow: (
              callback: (x: number, y: number, width: number, height: number) => void,
            ) => void
          },
          ReactNative.PressableProps
        >(function TestPressable(props, ref) {
          useImperativeHandle(ref, () => ({
            measureInWindow: (callback) => {
              if (
                (globalThis as { __SELECT_FIELD_DELAY_MEASURE__?: boolean })
                  .__SELECT_FIELD_DELAY_MEASURE__
              )
                setTimeout(() => callback(24, 200, 300, 56), 0)
              else callback(24, 200, 300, 56)
            },
          }))
          return createElement(ReactNative.Pressable, props)
        }),
        { displayName: "Pressable" },
      ),
    },
    ReactNative,
  )
})

jest.mock("react-native-keyboard-controller", () => ({
  KeyboardAwareScrollView: jest.requireActual("react-native").ScrollView,
  KeyboardProvider: ({ children }: { children: ReactNode }) => children,
  KeyboardAvoidingView: jest.requireActual("react-native").View,
  useKeyboardState: <T>(select: (state: { isVisible: boolean; height: number }) => T) =>
    select({ isVisible: false, height: 0 }),
}))

// why: GestureDetector throws without a GestureHandlerRootView ancestor, which the app root provides but component tests don't.
jest.mock(
  "react-native-gesture-handler/lib/module/v3/detectors/useEnsureGestureHandlerRootView",
  () => ({
    useEnsureGestureHandlerRootView: () => undefined,
  }),
)

jest.mock("expo-hinge", () => ({
  isAvailable: () => false,
  getHinge: () => null,
  addHingeListener: () => ({ remove: () => undefined }),
}))

jest.mock("react-native-worklets", () => require("react-native-worklets/src/mock"))
jest.mock("react-native-reanimated", () => ({
  ...require("react-native-reanimated/mock"),
  // why: Reanimated's mock leaves this out.
  LayoutAnimationConfig: ({ children }: { children: ReactNode }) => children,
}))

jest.mock("react-native-safe-area-context", () => ({
  ...jest.requireActual("react-native-safe-area-context"),
  SafeAreaProvider: ({ children }: { children: ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}))

jest.mock("expo-localization", () => ({
  ...jest.requireActual("expo-localization"),
  getLocales: () => [{ languageTag: "en-US", textDirection: "ltr" }],
}))

jest.mock("expo-haptics", () => ({
  ImpactFeedbackStyle: { Light: "light" },
  NotificationFeedbackType: { Success: "success", Warning: "warning", Error: "error" },
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
}))

let mockCryptoUuidSequence = 0
jest.mock("expo-crypto", () => ({
  ...jest.requireActual("expo-crypto"),
  randomUUID: jest.fn(
    () => `00000000-0000-4000-8000-${String(++mockCryptoUuidSequence).padStart(12, "0")}`,
  ),
}))

jest.mock("expo-keep-awake", () => ({
  useKeepAwake: jest.fn(),
}))

jest.mock("expo-alternate-app-icons", () => ({
  supportsAlternateIcons: false,
  getAppIconName: () => null,
  setAlternateAppIcon: jest.fn(async (name: string | null) => name),
}))

jest.mock("expo-network", () => ({
  NetworkStateType: jest.requireActual("expo-network/build/Network.types").NetworkStateType,
  addNetworkStateListener: jest.fn(() => ({ remove: jest.fn() })),
  useNetworkState: jest.fn(() => ({})),
}))

declare global {
  let __TEST__: boolean
}

jest.mock("expo-screen-orientation", () => ({
  ...jest.requireActual("expo-screen-orientation"),
  getOrientationAsync: jest.fn(async () => 0),
  addOrientationChangeListener: jest.fn(() => ({ remove: jest.fn() })),
}))
