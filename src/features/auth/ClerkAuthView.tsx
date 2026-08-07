import { AuthView } from "@clerk/expo/native"

export function ClerkAuthView({ onDismiss }: { onDismiss: () => void }) {
  return <AuthView mode="signInOrUp" isDismissible onDismiss={onDismiss} />
}
