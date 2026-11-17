import { Dimensions, Platform, StyleSheet } from "react-native"
import { act, fireEvent, render } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { Header, HeaderBack } from "./Header"

describe("Header", () => {
  it("exposes translated text actions as buttons with explicit state", () => {
    const view = render(
      <ThemeProvider initialContext="light">
        <Header
          title="New game"
          leftTx="common:back"
          onLeftPress={jest.fn()}
          rightText="Unavailable"
        />
      </ThemeProvider>,
    )

    const back = view.getByLabelText("Back")
    const unavailable = view.getByLabelText("Unavailable")
    expect(back.props.accessibilityRole).toBe("button")
    expect(back.props.accessibilityState).toEqual({ disabled: false })
    expect(unavailable.props.accessibilityRole).toBe("button")
    expect(unavailable.props.accessibilityState).toEqual({ disabled: true })
  })

  it("insets a centered title past the wider action so neither covers it", () => {
    const window = Dimensions.get("window")
    Dimensions.set({ window: { ...window, fontScale: 1 } })
    const view = render(
      <ThemeProvider initialContext="light">
        <Header title="Third-party game content" leftTx="common:back" onLeftPress={jest.fn()} />
      </ThemeProvider>,
    )
    const titleInset = () => {
      let node = view.getByText("Third-party game content").parent
      while (node && StyleSheet.flatten(node.props.style)?.paddingHorizontal === undefined) {
        node = node.parent
      }
      return StyleSheet.flatten(node?.props.style)?.paddingHorizontal
    }
    expect(titleInset()).toBe(48)

    act(() => {
      fireEvent(view.getByLabelText("Back"), "layout", {
        nativeEvent: { layout: { width: 72.4 } },
      })
    })

    expect(titleInset()).toBe(73)
    act(() => Dimensions.set({ window }))
  })

  it("moves a web title off center once it fills the centered space", () => {
    jest.replaceProperty(Platform, "OS", "web")
    const window = Dimensions.get("window")
    Dimensions.set({ window: { ...window, fontScale: 1 } })
    const view = render(
      <ThemeProvider initialContext="light">
        <Header title="Add deck" leftTx="common:back" onLeftPress={jest.fn()} />
      </ThemeProvider>,
    )
    const title = view.getByText("Add deck")
    let wrapperNode = title.parent
    while (wrapperNode && StyleSheet.flatten(wrapperNode.props.style)?.position !== "absolute") {
      wrapperNode = wrapperNode.parent
    }
    const wrapper = () => StyleSheet.flatten(wrapperNode?.props.style)
    const layout = (width: number) => ({ nativeEvent: { layout: { width } } })
    act(() => {
      fireEvent(view.getByLabelText("Back"), "layout", layout(120))
      if (wrapperNode) fireEvent(wrapperNode, "layout", layout(390))
      fireEvent(title, "layout", layout(140))
    })
    expect(wrapper()).toMatchObject({ paddingHorizontal: 120 })

    act(() => fireEvent(title, "layout", layout(150)))
    expect(wrapper()).toMatchObject({ paddingStart: 120 })
    expect(wrapper()).not.toHaveProperty("paddingHorizontal")
    act(() => Dimensions.set({ window }))
  })
})

describe("HeaderBack", () => {
  it("names where back lands beside the chevron on iOS", () => {
    const onBack = jest.fn()
    const view = render(
      <ThemeProvider initialContext="light">
        <Header title="Settings" onBack={onBack} />
      </ThemeProvider>,
    )
    // why: outside a navigator nothing is under the screen, so back falls back to Play.
    fireEvent.press(view.getByRole("button", { name: "Play" }))
    expect(view.getByText("Play")).toBeTruthy()
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it("reads Back when a caller's label is too long for the chevron", () => {
    const view = render(
      <ThemeProvider initialContext="light">
        <HeaderBack label="Ajouter un deck" onPress={jest.fn()} />
      </ThemeProvider>,
    )
    expect(view.getByText("Back")).toBeTruthy()
    expect(view.queryByText("Ajouter un deck")).toBeNull()
  })

  it("draws Material's bare arrow in a 48dp target on Android", () => {
    jest.replaceProperty(Platform, "OS", "android")
    const view = render(
      <ThemeProvider initialContext="light">
        <HeaderBack />
      </ThemeProvider>,
    )
    const back = view.getByRole("button", { name: "Back" })
    expect(view.queryByText("Play")).toBeNull()
    expect(back.props.accessibilityState).toEqual({ disabled: true })
    expect(StyleSheet.flatten(back.props.style)).toMatchObject({ width: 48, height: 48 })
  })
})
