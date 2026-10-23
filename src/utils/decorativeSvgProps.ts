import { Platform } from "react-native"

// why: react-native-svg forwards unknown props to the DOM on web, where `accessible` and `accessibilityElementsHidden` make React warn.
export function decorativeSvgProps<T extends object>(native: T) {
  return Platform.OS === "web" ? ({ "aria-hidden": true } as const) : native
}
