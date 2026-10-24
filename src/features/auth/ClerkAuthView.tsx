import { AuthView } from "@clerk/expo/native-components"

export function ClerkAuthView({ onDismiss }: { onDismiss: () => void }) {
  return <AuthView mode="signInOrUp" isDismissible onDismiss={onDismiss} />
}
