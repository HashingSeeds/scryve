import { StyleSheet } from "react-native"
import { fireEvent, screen } from "@testing-library/react-native"

export function seatRows(size = { width: 400, height: 800 }) {
  fireEvent(screen.getByTestId("player-grid"), "layout", { nativeEvent: { layout: size } })
  const seats = screen.getAllByTestId(/^player-cell-seat-\d+$/).map((node) => {
    const { top, left, height } = StyleSheet.flatten(node.props.style)
    return {
      seat: Number(String(node.props.testID).split("-").pop()),
      top: Number(top),
      left: Number(left),
      height: Number(height),
    }
  })
  const tops = [...new Set(seats.map(({ top }) => top))].sort((a, b) => a - b)
  return tops.map((top) => {
    const row = seats.filter((seat) => seat.top === top).sort((a, b) => a.left - b.left)
    return { seats: row.map(({ seat }) => seat), height: row[0].height }
  })
}
