import { tokenCache } from "./tokenCache"

const mockSaveToken = jest.fn()
jest.mock("@clerk/expo/token-cache", () => ({
  tokenCache: {
    saveToken: (key: string, token: string) => mockSaveToken(key, token),
  },
}))

describe("tokenCache", () => {
  it("keeps the session when the keychain can't store the token", async () => {
    mockSaveToken.mockRejectedValueOnce(new Error("No keychain is available"))

    await expect(tokenCache?.saveToken("__clerk_client_jwt", "jwt")).resolves.toBeUndefined()
    expect(mockSaveToken).toHaveBeenCalledWith("__clerk_client_jwt", "jwt")
  })
})
