import { expect, test } from "bun:test"
import {
  AltiumBinaryPcbDoc,
  AltiumTextRecord,
  parseAltiumFile,
  parseAltiumPcbDoc,
} from "altiumts"
import { any_circuit_element } from "circuit-json"
import { convertAltiumPcbDocToCircuitJson } from "../../lib"
import { readReferenceBytes } from "../helpers/read-reference"

test.each([
  { layer: "TOPOVERLAY", type: "pcb_silkscreen_text", side: "top" },
  { layer: "BOTTOMOVERLAY", type: "pcb_silkscreen_text", side: "bottom" },
  { layer: "TOP", type: "pcb_copper_text", side: "top" },
  { layer: "BOTTOM", type: "pcb_copper_text", side: "bottom" },
])("preserves inverted text and margin on $layer", ({ layer, type, side }) => {
  const document = parseAltiumPcbDoc(
    [
      "|RECORD=Board",
      `|RECORD=Text|LAYER=${layer}|X=100mil|Y=200mil|HEIGHT=60mil|WIDTH=10mil|ROTATION=90|MIRROR=TRUE|JUSTIFICATION=5|INVERTED=TRUE|INVERTEDRECT=FALSE|MARGINBORDERWIDTH=7mil|TEXT=CLK`,
    ].join("\n"),
  )
  const text = convertAltiumPcbDocToCircuitJson(document)
    .filter(
      (element) =>
        element.type === "pcb_silkscreen_text" ||
        element.type === "pcb_copper_text",
    )
    .find((element) => element.type === type)

  expect(text).toMatchObject({
    type,
    text: "CLK",
    font_size: 1.524,
    anchor_position: { x: 2.54, y: 5.08 },
    anchor_alignment: "center",
    ccw_rotation: 90,
    is_mirrored: true,
    layer: side,
    is_knockout: true,
  })
  for (const side of ["left", "right", "top", "bottom"] as const) {
    expect(text?.knockout_padding?.[side]).toBeCloseTo(0.1778, 10)
  }
  expect(any_circuit_element.safeParse(text).success).toBe(true)
})

test.each([
  { fields: "INVERTED=TRUE|MARGINBORDERWIDTH=0mm", margin: 0 },
  { fields: "INVERTED=TRUE|MARGINBORDERWIDTH=0.2mm", margin: 0.2 },
  { fields: "INVERTED=TRUE", margin: undefined },
  { fields: "INVERTED=TRUE|MARGINBORDERWIDTH=-1mil", margin: undefined },
  { fields: "INVERTED=TRUE|MARGINBORDERWIDTH=invalid", margin: undefined },
  {
    fields:
      "INVERTED=TRUE|INVERTEDRECT=TRUE|MARGINBORDERWIDTH=7mil|TEXTBOXWIDTH=200mil|TEXTBOXHEIGHT=100mil",
    margin: undefined,
  },
])("handles knockout border fields: $fields", ({ fields, margin }) => {
  const document = parseAltiumPcbDoc(
    `|RECORD=Board\n|RECORD=Text|LAYER=TOPOVERLAY|X=0mil|Y=0mil|HEIGHT=60mil|TEXT=CLK|${fields}`,
  )
  const text = convertAltiumPcbDocToCircuitJson(document).find(
    (element) => element.type === "pcb_silkscreen_text",
  )
  expect(text?.is_knockout).toBe(true)
  if (margin === undefined) {
    expect(text?.knockout_padding).toBeUndefined()
  } else {
    for (const side of ["left", "right", "top", "bottom"] as const) {
      expect(text?.knockout_padding?.[side]).toBeCloseTo(margin, 10)
    }
  }
})

test.each(["", "|INVERTED=FALSE"])(
  "leaves non-inverted text unchanged (%s)",
  (inversion) => {
    const document = parseAltiumPcbDoc(
      [
        "|RECORD=Board",
        ...["TOPOVERLAY", "TOP"].map(
          (layer) =>
            `|RECORD=Text|LAYER=${layer}|X=0mil|Y=0mil|HEIGHT=30mil|MARGINBORDERWIDTH=7mil|TEXT=CLK${inversion}`,
        ),
      ].join("\n"),
    )
    const texts = convertAltiumPcbDocToCircuitJson(document).filter(
      (element) =>
        element.type === "pcb_silkscreen_text" ||
        element.type === "pcb_copper_text",
    )
    expect(texts).toHaveLength(2)
    for (const text of texts) {
      expect(text.is_knockout).toBeUndefined()
      expect(text.knockout_padding).toBeUndefined()
    }
  },
)

test("preserves the 19 inverted silkscreen labels in the binary NodeMCU board", async () => {
  const source = await readReferenceBytes("nodemcu-esp12.PcbDoc")
  const document = parseAltiumFile(source).document
  if (!(document instanceof AltiumBinaryPcbDoc)) {
    throw new Error("Expected a binary PCB fixture")
  }
  const invertedRecords = document.records.flatMap((record, index) =>
    record instanceof AltiumTextRecord &&
    record.inverted &&
    ["TOPOVERLAY", "BOTTOMOVERLAY"].includes(record.layer ?? "")
      ? [{ record, index }]
      : [],
  )
  expect(invertedRecords).toHaveLength(19)
  const texts = convertAltiumPcbDocToCircuitJson(document).filter(
    (element) => element.type === "pcb_silkscreen_text",
  )

  for (const { record, index } of invertedRecords) {
    expect(record.getBoolean("INVERTEDRECT")).toBe(false)
    const expectedMargins: Record<string, number> = {
      "5mil": 0.127,
      "7mil": 0.1778,
      "20mil": 0.508,
    }
    const expectedMargin =
      expectedMargins[record.getDecoded("MARGINBORDERWIDTH") ?? ""]
    if (expectedMargin === undefined)
      throw new Error("Unexpected source margin")
    const text = texts.find(
      (element) =>
        element.pcb_silkscreen_text_id ===
        `pcb_silkscreen_text_altium_${index}`,
    )
    expect(text?.text).toBe(record.text)
    expect(text?.is_knockout).toBe(true)
    for (const side of ["left", "right", "top", "bottom"] as const) {
      expect(text?.knockout_padding?.[side]).toBeCloseTo(expectedMargin, 10)
    }
    expect(any_circuit_element.safeParse(text).success).toBe(true)
  }
})
