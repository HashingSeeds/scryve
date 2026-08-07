import { Component, ErrorInfo, ReactNode } from "react"

import { Button } from "@/components/Button"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"

interface Props {
  children: ReactNode
  onBack?: () => void
}

interface State {
  error?: Error
}

/** Keeps backend/query failures inside connected play and leaves local routes usable. */
export class ConnectedErrorBoundary extends Component<Props, State> {
  state: State = {}

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // A production telemetry adapter may report this later; invite secrets must never be included.
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <Screen preset="auto" safeAreaEdges={["top", "bottom"]}>
        <Text accessibilityRole="header" preset="heading" text="Connected game unavailable" />
        <Text
          accessibilityRole="alert"
          text={`Check your internet connection, invitation, and game membership, then retry. ${this.state.error.message}`}
        />
        <Button
          testID="retry-connected-button"
          text="Retry"
          preset="reversed"
          onPress={() => this.setState({ error: undefined })}
        />
        {this.props.onBack ? (
          <Button
            testID="leave-connected-error-button"
            text="Back to a safe screen"
            onPress={this.props.onBack}
          />
        ) : null}
      </Screen>
    )
  }
}
