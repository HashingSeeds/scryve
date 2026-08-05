import { render } from "@testing-library/react-native"

import { AccountProfile } from "./AccountControls"

jest.mock("@clerk/expo/native", () => {
  const { View } = jest.requireActual("react-native")
  return {
    UserProfileView: (props: object) => <View testID="native-user-profile" {...props} />,
  }
})

describe("AccountControls", () => {
  it("fills the account route without adding a second native dismiss control", () => {
    const view = render(<AccountProfile />)
    expect(view.getByTestId("native-user-profile")).toHaveStyle({ flex: 1 })
    expect(view.getByTestId("native-user-profile").props.isDismissible).toBe(false)
  })
})
