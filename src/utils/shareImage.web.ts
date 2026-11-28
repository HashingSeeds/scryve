import type { ShareOutcome } from "./shareImage"

export const canShareImage = true

export async function shareImage(
  base64: string,
  fileName: string,
  caption: string,
): Promise<ShareOutcome> {
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
  const file = new File([bytes], fileName, { type: "image/png" })
  if (navigator.canShare?.({ files: [file], text: caption })) {
    // why: a browser that counts the tap as spent by the time the PNG is drawn rejects with NotAllowedError, so that one downloads instead.
    const outcome = await navigator.share({ files: [file], text: caption }).then(
      (): ShareOutcome => "shared",
      (cause: unknown) => {
        if (cause instanceof Error && cause.name === "AbortError") return "dismissed"
        if (cause instanceof Error && cause.name === "NotAllowedError") return undefined
        throw cause
      },
    )
    if (outcome) return outcome
  }
  const url = URL.createObjectURL(file)
  const link = document.createElement("a")
  link.href = url
  link.download = fileName
  link.click()
  // why: revoking in the same task can cancel the download in Safari and Firefox.
  setTimeout(() => URL.revokeObjectURL(url), 0)
  return "unreported"
}
