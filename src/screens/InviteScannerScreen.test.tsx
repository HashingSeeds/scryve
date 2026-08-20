import { Linking, Platform } from "react-native"
import { CameraView } from "expo-camera"
import * as Haptics from "expo-haptics"
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"
import { delay } from "@/utils/delay"

import { InviteScannerScreen } from "./InviteScannerScreen"

let mockPermission: { granted: boolean; canAskAgain: boolean } | null = {
  granted: true,
  canAskAgain: true,
}
const mockRequestPermission = jest.fn(async () => mockPermission)
const mockLaunchScanner = jest.fn(async () => undefined)
const mockDismissScanner = jest.fn(async () => undefined)
const mockRemoveScannerListener = jest.fn()
let mockModernScannerListener: ((result: { data: string; type: string }) => void) | undefined

jest.mock("expo-camera", () => {
  return {
    ...jest.requireActual("expo-camera"),
    useCameraPermissions: () => [mockPermission, mockRequestPermission],
  }
})

jest.mock("@/utils/delay", () => ({
  delay: jest.fn(async () => undefined),
}))

jest.mock("@/utils/useReducedMotion", () => ({
  useReducedMotion: () => false,
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
    mockModernScannerListener = undefined
    mockPermission = { granted: true, canAskAgain: true }
    Object.assign(CameraView, {
      isModernBarcodeScannerAvailable: true,
      launchScanner: mockLaunchScanner,
      dismissScanner: mockDismissScanner,
      onModernBarcodeScanned: (listener: typeof mockModernScannerListener) => {
        mockModernScannerListener = listener
        return { remove: mockRemoveScannerListener }
      },
    })
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

  it("opens Expo's native scanner with guidance and highlighting", async () => {
    scanner()
    await waitFor(() =>
      expect(mockLaunchScanner).toHaveBeenCalledWith({
        barcodeTypes: ["qr"],
        isGuidanceEnabled: true,
        isHighlightingEnabled: true,
        isPinchToZoomEnabled: true,
      }),
    )
    expect(screen.queryByTestId("invite-camera")).toBeNull()
  })

  it("surfaces native scanner launch errors and allows retry", async () => {
    mockLaunchScanner.mockRejectedValueOnce(new Error("Native scanner unavailable"))
    scanner()
    await waitFor(() => {
      expect(screen.getByRole("alert").props.children).toContain("Native scanner unavailable")
    })
    fireEvent.press(screen.getByText("Open QR scanner"))
    await waitFor(() => expect(mockLaunchScanner).toHaveBeenCalledTimes(2))
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
    ["count://join/AB12CD", { kind: "code", code: "AB12CD" }],
    ["ab-12cd", { kind: "code", code: "AB12CD" }],
  ])("acknowledges and routes a supported native scan once", async (data, expected) => {
    const { onInvite } = scanner()
    await waitFor(() => expect(mockModernScannerListener).toBeDefined())
    mockModernScannerListener?.({ data, type: "qr" })
    mockModernScannerListener?.({ data, type: "qr" })
    await waitFor(() => expect(onInvite).toHaveBeenCalledTimes(1))
    expect(Haptics.notificationAsync).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Success)
    expect(delay).toHaveBeenCalledWith(250)
    expect(mockDismissScanner).toHaveBeenCalledTimes(1)
    expect(onInvite).toHaveBeenCalledTimes(1)
    expect(onInvite).toHaveBeenCalledWith(expected)
  })

  it("dismisses and explains a malformed or foreign native scan", async () => {
    const { onInvite, onCancel } = scanner()
    await waitFor(() => expect(mockModernScannerListener).toBeDefined())
    mockModernScannerListener?.({
      data: `https://foreign.example/join/${token}`,
      type: "qr",
    })
    await waitFor(() =>
      expect(screen.getByRole("alert").props.children).toContain(
        "not a trusted Scryve invitation",
      ),
    )
    expect(mockDismissScanner).toHaveBeenCalledTimes(1)
    expect(onInvite).not.toHaveBeenCalled()
    fireEvent.press(screen.getByText("Cancel and enter code"))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
