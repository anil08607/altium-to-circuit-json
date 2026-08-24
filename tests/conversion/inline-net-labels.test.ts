import { expect, test } from "bun:test"
import { parseAltiumSchDoc } from "altiumts"
import type { SchematicNetLabel, SchematicText } from "circuit-json"
import { any_circuit_element } from "circuit-json"
import { convertAltiumSchDocToCircuitJson } from "../../lib"
import { TI_TMDS62LEVM_FIXTURE_NAME } from "../../scripts/references/reference-manifest"
import { readReferenceBytes } from "../helpers/read-reference"

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

  expect(schematicTexts).toHaveLength(3)
  expect(schematicTexts.map((text) => text.text)).toEqual([
    "STRICT_INTERIOR",
    "INLINE_VERTEX",
    "TERMINAL",
  ])
  expect(
    schematicTexts.every(
      (text) =>
        text.anchor === "center" &&
        text.color === "rgb(132, 0, 0)" &&
        text.font_size === 0.18 &&
        text.rotation === 0 &&
        text.source_trace_id === "source_trace_altium_0" &&
        text.schematic_text_id.startsWith("schematic_inline_net_label_altium_"),
    ),
  ).toBe(true)
  expect(netLabels).toEqual([])
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

test("sheet 12 preserves inline and anchored Altium labels independently", async () => {
  const source = await readReferenceBytes(
    `${TI_TMDS62LEVM_FIXTURE_NAME}/12.SchDoc`,
  )
  const circuitJson = convertAltiumSchDocToCircuitJson(
    parseAltiumSchDoc(source),
  )
  const schematicTexts = circuitJson.filter(
    (element): element is SchematicText => element.type === "schematic_text",
  )
  const netLabels = circuitJson.filter(
    (element): element is SchematicNetLabel =>
      element.type === "schematic_net_label",
  )
  const inlineUsbcLabels = schematicTexts.filter((text) =>
    ["USBC_CONN2_CC1", "USBC_CONN2_CC2"].includes(text.text),
  )
  const anchoredUsbcLabels = netLabels.filter((label) =>
    ["USBC_CONN2_CC1", "USBC_CONN2_CC2"].includes(label.text),
  )
  const inlineDrain2Labels = schematicTexts.filter(
    (text) => text.text === "DRAIN2",
  )

  expect(inlineUsbcLabels).toHaveLength(4)
  expect(inlineUsbcLabels.map((text) => text.schematic_text_id)).toEqual([
    "schematic_inline_net_label_altium_2541",
    "schematic_inline_net_label_altium_2543",
    "schematic_inline_net_label_altium_2747",
    "schematic_inline_net_label_altium_2749",
  ])
  expect(
    inlineUsbcLabels.every(
      (text) =>
        ["center", "left", "right"].includes(text.anchor) &&
        text.color === "rgb(132, 0, 0)" &&
        text.font_size >= 0.1 &&
        text.font_size <= 0.18 &&
        Boolean(text.source_trace_id),
    ),
  ).toBe(true)
  expect(anchoredUsbcLabels).toHaveLength(2)
  expect(
    anchoredUsbcLabels.map((label) => label.schematic_net_label_id),
  ).toEqual([
    "schematic_net_label_altium_2750",
    "schematic_net_label_altium_2752",
  ])
  expect(netLabels.some((label) => label.text === "P2_PP_EXT_ENABLE")).toBe(
    true,
  )
  expect(inlineDrain2Labels).toHaveLength(2)
  expect(
    inlineDrain2Labels.every(
      (text) =>
        text.color === "rgb(132, 0, 0)" &&
        text.anchor === "center" &&
        text.font_size === 0.1 &&
        Boolean(text.source_trace_id),
    ),
  ).toBe(true)
  expect(
    circuitJson.every(
      (element) => any_circuit_element.safeParse(element).success,
    ),
  ).toBe(true)
})
