import { Alert } from "react-native"

import { storage } from "@/utils/storage"

import { offerFeedbackReplies } from "./prefs"

jest.mock("./device", () => ({ pushSupported: true, requestPush: async () => true }))

beforeEach(() => {
  storage.clearAll()
  jest.spyOn(Alert, "alert").mockImplementation(() => undefined)
})

afterEach(() => jest.restoreAllMocks())

describe("offerFeedbackReplies", () => {
  it("asks once, and Not now sticks", () => {
    offerFeedbackReplies()
    offerFeedbackReplies()
    expect(Alert.alert).toHaveBeenCalledTimes(1)
    expect(storage.getBoolean("notifications.feedbackReplies")).toBeUndefined()
  })

  it("turns on reply notifications when the player says yes", async () => {
    offerFeedbackReplies()
    const buttons = jest.mocked(Alert.alert).mock.calls[0][2] ?? []
    buttons.find((button) => button.text === "Notify me")?.onPress?.()
    await Promise.resolve()
    expect(storage.getBoolean("notifications.feedbackReplies")).toBe(true)
  })

  it("stays quiet when reply notifications are already on", () => {
    storage.set("notifications.feedbackReplies", true)
    offerFeedbackReplies()
    expect(Alert.alert).not.toHaveBeenCalled()
  })
})
