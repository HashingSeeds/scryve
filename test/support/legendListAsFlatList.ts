import { createElement } from "react"
import { FlatList, type FlatListProps } from "react-native"

/**
 * why: Legend List draws no rows until a device layout pass sizes it, so tests that find rows by
 * label swap in FlatList: `jest.mock("@legendapp/list/react-native", () => require(<this file>))`.
 * FlatList rejects a one-column columnWrapperStyle and has no use for the size estimates.
 */
export function LegendList({
  columnWrapperStyle: _gap,
  estimatedItemSize: _size,
  recycleItems: _recycle,
  ...props
}: FlatListProps<unknown> & { estimatedItemSize?: number; recycleItems?: boolean }) {
  return createElement(FlatList, { initialNumToRender: 100, ...props })
}
