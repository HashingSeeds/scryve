import { render } from "@testing-library/react-native"

import ConnectedIndex from "../src/app/connected"
import NewConnectedGameRoute from "../src/app/connected/new"

const mockRedirect = jest.fn((_props: { href: string }) => null)

jest.mock("expo-router", () => ({
  Redirect: (props: { href: string }) => mockRedirect(props),
}))

describe("connected route aliases", () => {
  beforeEach(() => jest.clearAllMocks())

  it.each([
    ["connected home", <ConnectedIndex key="connected-home" />],
    ["connected new game", <NewConnectedGameRoute key="connected-new" />],
  ])("redirects %s to the shared setup route", (_name, route) => {
    render(route)
    expect(mockRedirect).toHaveBeenCalledWith({ href: "/game/new?mode=connected" })
  })
})
