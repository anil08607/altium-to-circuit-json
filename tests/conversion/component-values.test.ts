import { expect, test } from "bun:test"
import { convertSingleSchematicComponent } from "../helpers/convert-single-schematic-component"

test("uses Altium Value parameter instead of manufacturer part number", () => {
  const capacitor = convertSingleSchematicComponent({
    componentValue: "10uF",
    designator: "C1",
    libraryReference: "Capacitor",
    comment: "UMK325AB7106KMHT",
  }).find((element) => element.type === "source_component")
  const resistor = convertSingleSchematicComponent({
    componentValue: "1.0k",
    designator: "R1",
    libraryReference: "Resistor",
    comment: "RC0603FR-071KL",
  }).find((element) => element.type === "source_component")

  expect(capacitor).toMatchObject({
    display_value: "10uF",
    display_capacitance: "10uF",
  })
  expect(resistor).toMatchObject({
    display_value: "1.0k",
    display_resistance: "1.0k",
  })
})
