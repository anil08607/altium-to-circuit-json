import { expect, test } from "bun:test"
import { any_circuit_element } from "circuit-json"
import { convertSingleSchematicComponent } from "../helpers/convert-single-schematic-component"

test("keeps a nonnumeric passive value as a valid generic component", () => {
  const circuitJson = convertSingleSchematicComponent({
    comment: "L78M08 regulator",
    componentValue: "L78M08CDT-TR",
    designator: "L1",
    libraryReference: "L78M08",
  })
  const sourceComponent = circuitJson.find(
    (element) => element.type === "source_component",
  )

  expect(sourceComponent).toMatchObject({
    display_value: "L78M08CDT-TR",
    ftype: "simple_chip",
    name: "L1",
  })
  expect(
    circuitJson.every(
      (element) => any_circuit_element.safeParse(element).success,
    ),
  ).toBe(true)
})
