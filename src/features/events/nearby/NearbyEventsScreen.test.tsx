import { fireEvent, render, screen } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { NearbyEventsScreen } from "./NearbyEventsScreen"

function renderScreen(unsaved: boolean) {
  const onHost = jest.fn()
  render(
    <ThemeProvider>
      <NearbyEventsScreen
        hosted={{ name: "Friday Modern", detail: "Finished", running: false, unsaved }}
        events={[]}
        denied={false}
        name="Ada"
        askName={false}
        onNameChange={jest.fn()}
        onBack={jest.fn()}
        onHost={onHost}
        onOpenHosted={jest.fn()}
        onJoin={jest.fn()}
      />
    </ThemeProvider>,
  )
  return onHost
}

it("asks before a new event replaces a finished one that isn't saved", () => {
  const onHost = renderScreen(true)
  fireEvent.press(screen.getByTestId("host-nearby-event"))
  expect(onHost).not.toHaveBeenCalled()
  fireEvent.press(screen.getByTestId("replace-hosted-event"))
  expect(onHost).toHaveBeenCalledTimes(1)
})

it("hosts right away when the finished event is saved", () => {
  const onHost = renderScreen(false)
  fireEvent.press(screen.getByTestId("host-nearby-event"))
  expect(onHost).toHaveBeenCalledTimes(1)
})
