/* global document, URL, URLSearchParams */

const form = document.querySelector("#waitlist-form")
const submitButton = document.querySelector("#submit")
const status = document.querySelector("#form-status")
const signInLink = document.querySelector("#sign-in")

const returnTo = new URLSearchParams(window.location.search).get("return_to")
if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) {
  const signInUrl = new URL(signInLink.href)
  signInUrl.searchParams.set("redirect_url", new URL(returnTo, window.location.origin).href)
  signInLink.href = signInUrl.href
}

function setStatus(message, isError = false) {
  status.textContent = message
  status.dataset.error = String(isError)
}

form.addEventListener("submit", async (event) => {
  event.preventDefault()
  setStatus("")

  const formData = new FormData(form)
  const platforms = formData.getAll("platform")
  const turnstileToken = formData.get("cf-turnstile-response")

  if (!form.reportValidity()) return
  if (platforms.length === 0) {
    setStatus("Choose at least one platform.", true)
    return
  }
  if (typeof turnstileToken !== "string" || !turnstileToken) {
    setStatus("Complete the verification, then try again.", true)
    return
  }

  submitButton.disabled = true
  setStatus("Joining…")

  try {
    const response = await fetch("/api/waitlist", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: formData.get("email"),
        platforms,
        turnstileToken,
      }),
    })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || "Could not join the wait list")

    form.reset()
    setStatus(result.alreadyJoined ? "You’re already on the list." : "You’re on the list.")
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Could not join the wait list", true)
  } finally {
    submitButton.disabled = false
    if (window.turnstile) window.turnstile.reset()
  }
})
