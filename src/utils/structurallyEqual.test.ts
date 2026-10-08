import { structurallyEqual } from "./structurallyEqual"

describe("structurallyEqual", () => {
  it("compares nested plain data by content and functions by identity", () => {
    const onPress = () => {}
    const props = () => ({ seats: [{ row: 0 }], incoming: { a: 3 }, onPress })

    expect(structurallyEqual(props(), props())).toBe(true)
    expect(structurallyEqual(props(), { ...props(), incoming: { a: 4 } })).toBe(false)
    expect(structurallyEqual(props(), { ...props(), onPress: () => {} })).toBe(false)
    expect(structurallyEqual({ a: undefined }, { b: undefined })).toBe(false)
  })
})
