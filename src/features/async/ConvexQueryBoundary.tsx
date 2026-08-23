import { Component, type ReactNode } from "react"

interface ConvexQueryBoundaryProps {
  children: ReactNode
  resetKey?: string
  fallback: (failure: { error: Error; retry: () => void }) => ReactNode
}

interface ConvexQueryBoundaryState {
  error?: Error
  resetKey?: string
}

export class ConvexQueryBoundary extends Component<
  ConvexQueryBoundaryProps,
  ConvexQueryBoundaryState
> {
  state: ConvexQueryBoundaryState = { resetKey: this.props.resetKey }

  static getDerivedStateFromError(error: Error): Partial<ConvexQueryBoundaryState> {
    return { error }
  }

  static getDerivedStateFromProps(
    props: ConvexQueryBoundaryProps,
    state: ConvexQueryBoundaryState,
  ): Partial<ConvexQueryBoundaryState> | null {
    if (props.resetKey === state.resetKey) return null
    return { error: undefined, resetKey: props.resetKey }
  }

  private retry = () => this.setState({ error: undefined })

  render(): ReactNode {
    if (!this.state.error) return this.props.children
    return this.props.fallback({ error: this.state.error, retry: this.retry })
  }
}
