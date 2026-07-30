import { Linking, Platform } from "react-native"
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { InviteScannerScreen } from "./InviteScannerScreen"

let mockPermission: { granted: boolean; canAskAgain: boolean } | null = {
  granted: true,
  canAskAgain: true,
}
const mockRequestPermission = jest.fn(async () => mockPermission)

jest.mock("expo-camera", () => ({
  CameraView: (props: any) => {
    const MockView = jest.requireActual("react-native").View
    return <MockView {...props} />
  },
  useCameraPermissions: () => [mockPermission, mockRequestPermission],
}))

function scanner(onInvite = jest.fn(), onCancel = jest.fn()) {
  return {
    onInvite,
    onCancel,
    view: render(
      <ThemeProvider initialContext="light">
        <InviteScannerScreen onInvite={onInvite} onCancel={onCancel} />
      </ThemeProvider>,
    ),
  }
}

describe("InviteScannerScreen", () => {
  const originalPlatform = Platform.OS
  const token = "A".repeat(43)

  beforeEach(() => {
    jest.clearAllMocks()
    mockPermission = { granted: true, canAskAgain: true }
    Object.defineProperty(Platform, "OS", { configurable: true, value: originalPlatform })
  })

  afterAll(() =>
    Object.defineProperty(Platform, "OS", { configurable: true, value: originalPlatform }),
  )

  it("provides an accessible web manual-code fallback", () => {
    Object.defineProperty(Platform, "OS", { configurable: true, value: "web" })
    const { onCancel } = scanner()
    fireEvent.press(screen.getByText("Enter code manually"))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it("explains and requests camera permission", () => {
    mockPermission = { granted: false, canAskAgain: true }
    scanner()
    expect(screen.getByText(/Images are not captured, stored, or uploaded/)).toBeTruthy()
    fireEvent.press(screen.getByText("Allow camera"))
    expect(mockRequestPermission).toHaveBeenCalledTimes(1)
  })

  it("handles permanent denial with settings and manual fallback", async () => {
    mockPermission = { granted: false, canAskAgain: false }
    const settings = jest.spyOn(Linking, "openSettings").mockResolvedValue(undefined)
    const { onCancel } = scanner()
    expect(screen.getByRole("alert")).toBeTruthy()
    fireEvent.press(screen.getByText("Open settings"))
    await waitFor(() => expect(settings).toHaveBeenCalledTimes(1))
    fireEvent.press(screen.getByText("Enter code manually"))
    expect(onCancel).toHaveBeenCalledTimes(1)
    settings.mockRestore()
  })

  it.each([
    [`count://join/${token}`, { kind: "token", token }],
    ["ab-12cd", { kind: "code", code: "AB12CD" }],
  ])("routes a supported scan without duplicate delivery", (data, expected) => {
    const { onInvite } = scanner()
    const camera = screen.getByTestId("invite-camera")
    fireEvent(camera, "onBarcodeScanned", { data })
    fireEvent(camera, "onBarcodeScanned", { data })
    expect(onInvite).toHaveBeenCalledTimes(1)
    expect(onInvite).toHaveBeenCalledWith(expected)
  })

  it("announces malformed or foreign payloads and still allows cancellation", () => {
    const { onInvite, onCancel } = scanner()
    fireEvent(screen.getByTestId("invite-camera"), "onBarcodeScanned", {
      data: `https://foreign.example/join/${token}`,
    })
    expect(screen.getByRole("alert").props.children).toContain("not a trusted Count invitation")
    expect(onInvite).not.toHaveBeenCalled()
    fireEvent.press(screen.getByText("Cancel and enter code"))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
