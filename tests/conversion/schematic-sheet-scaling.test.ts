import { expect, test } from "bun:test"
import { parseAltiumSchDoc } from "altiumts"
import type {
  AnyCircuitElement,
  SchematicComponent,
  SchematicLine,
  SchematicPort,
  SchematicText,
} from "circuit-json"
import { any_circuit_element } from "circuit-json"
import { convertAltiumSchDocToCircuitJson } from "../../lib"
import { TI_TMDS62LEVM_FIXTURE_NAME } from "../../scripts/references/reference-manifest"
import { readReferenceBytes } from "../helpers/read-reference"
import { renderImportedSchematicToSvg } from "../helpers/render-imported-schematic"

type SourceComponent = Extract<AnyCircuitElement, { type: "source_component" }>

test("TI schematic coordinates fit and center on the Circuit JSON sheet", async () => {
  const source = await readReferenceBytes(
    `${TI_TMDS62LEVM_FIXTURE_NAME}/17.SchDoc`,
  )
  const document = parseAltiumSchDoc(source)
  const circuitJson = convertAltiumSchDocToCircuitJson(document, {
    sheetName: "TI TMDS62LEVM Rev. B — sheet 17",
  })

  expect(
    circuitJson.filter((element) => element.type === "schematic_sheet"),
  ).toEqual([
    {
      type: "schematic_sheet",
      name: "TI TMDS62LEVM Rev. B — sheet 17",
      outline_color: "#334155",
      schematic_sheet_id: "schematic_sheet_altium",
      sheet_index: 0,
    },
  ])
  expect(
    circuitJson.some(
      (element) =>
        element.type === "schematic_rect" &&
        element.schematic_rect_id === "schematic_rect_altium_sheet_border",
    ),
  ).toBe(false)
  expect(
    circuitJson
      .filter(
        (element) =>
          element.type.startsWith("schematic_") &&
          element.type !== "schematic_sheet",
      )
      .every(
        (element) =>
          "schematic_sheet_id" in element &&
          element.schematic_sheet_id === "schematic_sheet_altium",
      ),
  ).toBe(true)

  const pmicSource = circuitJson.find(
    (element): element is SourceComponent =>
      element.type === "source_component" && element.name === "U50",
  )
  const pmicComponent = circuitJson.find(
    (element): element is SchematicComponent =>
      element.type === "schematic_component" &&
      element.source_component_id === pmicSource?.source_component_id,
  )
  expect(pmicComponent?.center.x).toBeCloseTo(-1.92318, 5)
  expect(pmicComponent?.center.y).toBeCloseTo(0.14246, 5)
  expect(pmicComponent?.size.width).toBeCloseTo(2.70669, 5)
  expect(pmicComponent?.size.height).toBeCloseTo(2.84915, 5)

  const sclPort = circuitJson.find(
    (element): element is SchematicPort =>
      element.type === "schematic_port" &&
      element.schematic_port_id === "schematic_port_altium_798",
  )
  expect(sclPort?.center.x).toBeCloseTo(-3.7039, 5)
  expect(sclPort?.center.y).toBeCloseTo(0.14246, 5)

  const note = circuitJson.find(
    (element): element is SchematicText =>
      element.type === "schematic_text" &&
      element.schematic_text_id === "schematic_text_frame_line_altium_1142_0",
  )
  expect(note).toMatchObject({ font_size: 0.2, text: "D-Note:-" })
  expect(
    circuitJson.every(
      (element) => any_circuit_element.safeParse(element).success,
    ),
  ).toBe(true)

  const svg = renderImportedSchematicToSvg(circuitJson)
  expect(svg).toContain('data-circuit-json-type="schematic_sheet"')
  expect(svg).toContain('data-schematic-sheet-id="schematic_sheet_altium"')
  expect(svg).not.toContain("Could not match ports")
  expect(svg).not.toContain("NaN")
})

test("the legacy Altium sheet border is an opt-in centered overlay", async () => {
  const source = await readReferenceBytes(
    `${TI_TMDS62LEVM_FIXTURE_NAME}/17.SchDoc`,
  )
  const circuitJson = convertAltiumSchDocToCircuitJson(
    parseAltiumSchDoc(source),
    { includeSheetBorder: true },
  )
  const border = circuitJson.find(
    (element) =>
      element.type === "schematic_rect" &&
      element.schematic_rect_id === "schematic_rect_altium_sheet_border",
  )

  expect(border).toMatchObject({
    center: { x: 0, y: 0 },
    height: 21.653543307086615,
    width: 28.776419394944057,
  })
})

test("no-ERC small crosses scale with the imported page", async () => {
  const source = await readReferenceBytes(
    `${TI_TMDS62LEVM_FIXTURE_NAME}/12.SchDoc`,
  )
  const circuitJson = convertAltiumSchDocToCircuitJson(
    parseAltiumSchDoc(source),
  )
  const crossStrokes = circuitJson.filter(
    (element): element is SchematicLine =>
      element.type === "schematic_line" &&
      /schematic_line_altium_\d+_[ab]/u.test(element.schematic_line_id),
  )

  expect(crossStrokes).toHaveLength(26)
  expect(
    Math.abs((crossStrokes[0]?.x2 ?? 0) - (crossStrokes[0]?.x1 ?? 0)),
  ).toBeCloseTo(0.113966, 5)
  expect(crossStrokes[0]?.stroke_width).toBe(0.02)
})
