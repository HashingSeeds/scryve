import * as StoreReview from "expo-store-review"

import { storage } from "@/utils/storage"

import { recordReviewCompletion, requestStoreReview } from "./storeReview"

jest.mock("expo-store-review", () => ({
  isAvailableAsync: jest.fn(async () => true),
  requestReview: jest.fn(async () => undefined),
}))

beforeEach(() => {
  storage.clearAll()
  jest.clearAllMocks()
  jest.mocked(StoreReview.isAvailableAsync).mockResolvedValue(true)
  jest.mocked(StoreReview.requestReview).mockResolvedValue(undefined)
})

function completeFiveGames() {
  for (let index = 0; index < 5; index++) recordReviewCompletion(`local:${index}`)
}

it("requires five distinct completions and persists one attempt across further games", async () => {
  recordReviewCompletion("local:0")
  recordReviewCompletion("local:0")
  await requestStoreReview(() => true)
  expect(StoreReview.isAvailableAsync).not.toHaveBeenCalled()
  completeFiveGames()
  await Promise.all([requestStoreReview(() => true), requestStoreReview(() => true)])
  recordReviewCompletion("connected:0")
  await requestStoreReview(() => true)
  expect(StoreReview.requestReview).toHaveBeenCalledTimes(1)
  expect(JSON.parse(storage.getString("scryve.review.completedGames.v1")!)).toHaveLength(5)
})

it("defers unavailable native reviews and cancels when the summary is no longer visible", async () => {
  completeFiveGames()
  jest.mocked(StoreReview.isAvailableAsync).mockResolvedValueOnce(false)
  await requestStoreReview(() => true)
  await requestStoreReview(() => false)
  expect(StoreReview.requestReview).not.toHaveBeenCalled()
  await requestStoreReview(() => true)
  expect(StoreReview.requestReview).toHaveBeenCalledTimes(1)
})

it("does not repeatedly ask after a failed native request", async () => {
  completeFiveGames()
  jest.mocked(StoreReview.requestReview).mockRejectedValueOnce(new Error("unavailable"))
  await requestStoreReview(() => true)
  await requestStoreReview(() => true)
  expect(StoreReview.requestReview).toHaveBeenCalledTimes(1)
})

it("fails closed when review state cannot be read or persisted", async () => {
  storage.set("scryve.review.completedGames.v1", "invalid json")
  expect(() => recordReviewCompletion("local:0")).not.toThrow()
  await requestStoreReview(() => true)
  expect(StoreReview.requestReview).not.toHaveBeenCalled()
  storage.clearAll()
  completeFiveGames()
  const write = jest.spyOn(storage, "set").mockImplementation(() => {
    throw new Error("storage unavailable")
  })
  await requestStoreReview(() => true)
  expect(StoreReview.requestReview).not.toHaveBeenCalled()
  write.mockRestore()
})
