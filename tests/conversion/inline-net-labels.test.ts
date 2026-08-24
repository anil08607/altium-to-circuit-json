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

test("inline net labels follow the Altium text orientation", () => {
  const document = parseAltiumSchDoc(
    [
      "|RECORD=31|CUSTOMX=120|CUSTOMY=120|SIZE1=10|FONTNAME1=Arial",
      "|RECORD=27|LOCATIONCOUNT=2|X1=50|Y1=10|X2=50|Y2=90",
      "|RECORD=25|LOCATION.X=50|LOCATION.Y=30|TEXT=VERTICAL|ORIENTATION=1|FONTID=1|COLOR=128",
      "|RECORD=27|LOCATIONCOUNT=2|X1=10|Y1=100|X2=90|Y2=100",
      "|RECORD=25|LOCATION.X=30|LOCATION.Y=100|TEXT=HORIZONTAL|ORIENTATION=0|FONTID=1|COLOR=128",
    ].join("\n"),
  )
  const schematicTexts = convertAltiumSchDocToCircuitJson(document, {
    centerOnSchematicSheet: false,
    schematicUnitScale: 0.1,
  }).filter(
    (element): element is SchematicText => element.type === "schematic_text",
  )

  expect(schematicTexts.find((text) => text.text === "VERTICAL")).toMatchObject(
    {
      anchor: "center",
      rotation: -90,
      source_trace_id: "source_trace_altium_0",
    },
  )
  expect(
    schematicTexts.find((text) => text.text === "HORIZONTAL"),
  ).toMatchObject({
    anchor: "center",
    rotation: 0,
    source_trace_id: "source_trace_altium_1",
  })
})

test("anchored Altium ports face away from their wired end", () => {
  const document = parseAltiumSchDoc(
    [
      "|RECORD=31|CUSTOMX=120|CUSTOMY=120|SIZE1=10|FONTNAME1=Arial",
      "|RECORD=27|LOCATIONCOUNT=2|X1=10|Y1=30|X2=30|Y2=30",
      "|RECORD=18|LOCATION.X=30|LOCATION.Y=30|NAME=ORIGIN_RIGHT|IOTYPE=1|WIDTH=40|HEIGHT=10|FONTID=1",
      "|RECORD=27|LOCATIONCOUNT=2|X1=100|Y1=50|X2=110|Y2=50",
      "|RECORD=18|LOCATION.X=60|LOCATION.Y=50|NAME=EXTREMITY_RIGHT|IOTYPE=1|WIDTH=40|HEIGHT=10|FONTID=1",
      "|RECORD=27|LOCATIONCOUNT=2|X1=50|Y1=90|X2=50|Y2=110",
      "|RECORD=18|LOCATION.X=50|LOCATION.Y=70|NAME=EXTREMITY_UP|ORIENTATION=1|IOTYPE=1|WIDTH=20|HEIGHT=10|FONTID=1",
      "|RECORD=27|LOCATIONCOUNT=2|X1=10|Y1=60|X2=30|Y2=60",
      "|RECORD=18|LOCATION.X=50|LOCATION.Y=60|NAME=EXTREMITY_LEFT|ORIENTATION=2|IOTYPE=1|WIDTH=20|HEIGHT=10|FONTID=1",
      "|RECORD=27|LOCATIONCOUNT=2|X1=90|Y1=10|X2=90|Y2=30",
      "|RECORD=18|LOCATION.X=90|LOCATION.Y=50|NAME=EXTREMITY_DOWN|ORIENTATION=3|IOTYPE=1|WIDTH=20|HEIGHT=10|FONTID=1",
    ].join("\n"),
  )
  const labelsByText = Object.fromEntries(
    convertAltiumSchDocToCircuitJson(document, {
      centerOnSchematicSheet: false,
      schematicUnitScale: 0.1,
    })
      .filter(
        (element): element is SchematicNetLabel =>
          element.type === "schematic_net_label",
      )
      .map((label) => [label.text, label]),
  )

  expect(labelsByText.ORIGIN_RIGHT).toMatchObject({
    anchor_position: { x: 3, y: 3 },
    anchor_side: "left",
    schematic_trace_id: "schematic_trace_altium_1",
  })
  expect(labelsByText.EXTREMITY_RIGHT).toMatchObject({
    anchor_position: { x: 10, y: 5 },
    anchor_side: "right",
    schematic_trace_id: "schematic_trace_altium_3",
  })
  expect(labelsByText.EXTREMITY_UP).toMatchObject({
    anchor_position: { x: 5, y: 9 },
    anchor_side: "top",
    schematic_trace_id: "schematic_trace_altium_5",
  })
  expect(labelsByText.EXTREMITY_LEFT).toMatchObject({
    anchor_position: { x: 3, y: 6 },
    anchor_side: "left",
    schematic_trace_id: "schematic_trace_altium_7",
  })
  expect(labelsByText.EXTREMITY_DOWN).toMatchObject({
    anchor_position: { x: 9, y: 3 },
    anchor_side: "bottom",
    schematic_trace_id: "schematic_trace_altium_9",
  })
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
  expect(
    anchoredUsbcLabels.every(
      (label) =>
        label.anchor_side === "right" && Boolean(label.schematic_trace_id),
    ),
  ).toBe(true)
  expect(
    netLabels.find((label) => label.text === "P2_PP_EXT_ENABLE"),
  ).toMatchObject({
    anchor_side: "left",
    schematic_trace_id: "schematic_trace_altium_2634",
  })
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
