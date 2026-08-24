import { expect, test } from "bun:test"
import { parseAltiumSchDoc } from "altiumts"
import type { SchematicNetLabel, SchematicText } from "circuit-json"
import { any_circuit_element } from "circuit-json"
import { convertAltiumSchDocToCircuitJson } from "../../lib"

test("inline Altium net labels render as schematic text", () => {
  const document = parseAltiumSchDoc(
    [
      "|RECORD=31|CUSTOMX=100|CUSTOMY=100|SIZE1=10|FONTNAME1=Arial",
      "|RECORD=27|LOCATIONCOUNT=3|X1=10|Y1=50|X2=50|Y2=50|X3=90|Y3=50",
      "|RECORD=25|LOCATION.X=30|LOCATION.Y=50|TEXT=STRICT_INTERIOR|FONTID=1|COLOR=128",
      "|RECORD=25|LOCATION.X=50|LOCATION.Y=50|TEXT=INLINE_VERTEX|FONTID=1|COLOR=128",
      "|RECORD=25|LOCATION.X=90|LOCATION.Y=50|TEXT=TERMINAL|FONTID=1|COLOR=128",
    ].join("\n"),
  )

  const circuitJson = convertAltiumSchDocToCircuitJson(document, {
    centerOnSchematicSheet: false,
    schematicUnitScale: 0.1,
  })
  const schematicTexts = circuitJson.filter(
    (element): element is SchematicText => element.type === "schematic_text",
  )
  const netLabels = circuitJson.filter(
    (element): element is SchematicNetLabel =>
      element.type === "schematic_net_label",
  )

  expect(schematicTexts).toEqual([
    expect.objectContaining({
      position: { x: 3, y: 5 },
      schematic_text_id: "schematic_text_altium_2",
      text: "STRICT_INTERIOR",
    }),
    expect.objectContaining({
      position: { x: 5, y: 5 },
      schematic_text_id: "schematic_text_altium_3",
      text: "INLINE_VERTEX",
    }),
  ])
  expect(netLabels).toEqual([
    expect.objectContaining({
      anchor_position: { x: 9, y: 5 },
      schematic_net_label_id: "schematic_net_label_altium_4",
      text: "TERMINAL",
    }),
  ])
  expect(
    circuitJson.find((element) => element.type === "source_trace"),
  ).toMatchObject({
    connected_source_net_ids: [
      "source_net_altium_strict_interior",
      "source_net_altium_inline_vertex",
      "source_net_altium_terminal",
    ],
  })
  expect(
    circuitJson.every(
      (element) => any_circuit_element.safeParse(element).success,
    ),
  ).toBe(true)
})
