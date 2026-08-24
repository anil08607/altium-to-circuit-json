import { expect, test } from "bun:test"
import { parseAltiumSchDoc } from "altiumts"
import type {
  AnyCircuitElement,
  SchematicComponent,
  SchematicPort,
} from "circuit-json"
import { convertAltiumSchDocToCircuitJson } from "../../lib"
import { TI_TMDS62LEVM_FIXTURE_NAME } from "../../scripts/references/reference-manifest"
import { readReferenceBytes } from "../helpers/read-reference"

type SourceComponent = Extract<AnyCircuitElement, { type: "source_component" }>

test("hidden Altium pin names do not render inside J17", async () => {
  const source = await readReferenceBytes(
    `${TI_TMDS62LEVM_FIXTURE_NAME}/13.SchDoc`,
  )
  const circuitJson = convertAltiumSchDocToCircuitJson(
    parseAltiumSchDoc(source),
  )
  const sourceComponent = circuitJson.find(
    (element): element is SourceComponent =>
      element.type === "source_component" && element.name === "J17",
  )
  const schematicComponent = circuitJson.find(
    (element): element is SchematicComponent =>
      element.type === "schematic_component" &&
      element.source_component_id === sourceComponent?.source_component_id,
  )
  const ports = circuitJson.filter(
    (element): element is SchematicPort =>
      element.type === "schematic_port" &&
      element.schematic_component_id ===
        schematicComponent?.schematic_component_id,
  )

  expect(ports).toHaveLength(28)
  expect(ports.every((port) => port.display_pin_label === undefined)).toBe(true)
  expect(
    circuitJson.some(
      (element) =>
        element.type === "source_port" &&
        element.source_component_id === sourceComponent?.source_component_id &&
        element.name === "CC1",
    ),
  ).toBe(true)
})
