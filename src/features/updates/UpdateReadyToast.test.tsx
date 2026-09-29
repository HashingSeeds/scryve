import { render } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"
import { storage } from "@/utils/storage"

import { UpdateReadyToastWithForegroundChecks } from "./UpdateReadyToast"

let mockPathname = "/"
jest.mock("expo-router", () => ({ usePathname: () => mockPathname }))
jest.mock("expo-updates", () => ({
  __esModule: true,
  isEnabled: false,
  useUpdates: () => ({
    isDownloading: false,
    isUpdatePending: true,
    downloadedUpdate: { updateId: "next-update", manifest: {} },
  }),
}))

const renderToast = () => (
  <ThemeProvider initialContext="dark">
    <UpdateReadyToastWithForegroundChecks />
  </ThemeProvider>
)

describe("UpdateReadyToastWithForegroundChecks", () => {
  beforeEach(() => storage.clearAll())

  it("waits until the player leaves the board, then announces the update once", () => {
    mockPathname = "/"
    const view = render(renderToast())
    expect(view.queryByTestId("update-ready-toast")).toBeNull()

    mockPathname = "/connected/decks"
    view.rerender(renderToast())
    expect(view.getByTestId("update-ready-toast")).toBeTruthy()
    view.unmount()

    expect(render(renderToast()).queryByTestId("update-ready-toast")).toBeNull()
  })
})
