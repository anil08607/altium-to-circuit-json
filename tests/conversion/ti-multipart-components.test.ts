import { expect, test } from "bun:test"
import { parseAltiumSchDoc } from "altiumts"
import type { AnyCircuitElement } from "circuit-json"
import { any_circuit_element } from "circuit-json"
import { convertAltiumSchDocToCircuitJson } from "../../lib"
import { TI_TMDS62LEVM_FIXTURE_NAME } from "../../scripts/references/reference-manifest"
import { readReferenceBytes } from "../helpers/read-reference"

type SourceComponent = Extract<AnyCircuitElement, { type: "source_component" }>
type SchematicComponent = Extract<
  AnyCircuitElement,
  { type: "schematic_component" }
>

test("TI multipart symbols share one source component and keep per-part boxes", async () => {
  const source = await readReferenceBytes(
    `${TI_TMDS62LEVM_FIXTURE_NAME}/19.SchDoc`,
  )
  const circuitJson = convertAltiumSchDocToCircuitJson(
    parseAltiumSchDoc(source),
    { sheetName: "TI TMDS62LEVM Rev. B — sheet 19" },
  )
  const sourceComponents = circuitJson.filter(
    (element): element is SourceComponent =>
      element.type === "source_component" && element.name === "U28",
  )

  expect(sourceComponents).toHaveLength(1)
  expect(sourceComponents[0]).toMatchObject({
    display_value: "XAM62L32AOGHAANB",
    ftype: "simple_chip",
    manufacturer_part_number: "XAM62L32AOGHAANB",
    source_component_id: "source_component_altium_226",
  })

  const schematicComponents = circuitJson.filter(
    (element): element is SchematicComponent =>
      element.type === "schematic_component" &&
      element.source_component_id === sourceComponents[0]?.source_component_id,
  )
  expect(
    schematicComponents.map((component) => component.schematic_component_id),
  ).toEqual([
    "schematic_component_altium_226",
    "schematic_component_altium_1103",
    "schematic_component_altium_1898",
  ])
  expect(
    schematicComponents
      .map(
        (component) =>
          circuitJson.filter(
            (element) =>
              element.type === "schematic_port" &&
              element.schematic_component_id ===
                component.schematic_component_id,
          ).length,
      )
      .sort((left, right) => left - right),
  ).toEqual([6, 44, 97])
  expect(
    circuitJson.every(
      (element) => any_circuit_element.safeParse(element).success,
    ),
  ).toBe(true)
})
