import { expect, test } from "bun:test"
import { parseAltiumSchDoc } from "altiumts"
import { any_circuit_element } from "circuit-json"
import type { SchematicText } from "circuit-json"
import { convertAltiumSchDocToCircuitJson } from "../../lib"
import { TI_TMDS62LEVM_FIXTURE_NAME } from "../../scripts/references/reference-manifest"
import { readReferenceBytes } from "../helpers/read-reference"

test("TI sheet 17 preserves dense schematic typography and port styles", async () => {
  const source = await readReferenceBytes(
    `${TI_TMDS62LEVM_FIXTURE_NAME}/17.SchDoc`,
  )
  const circuitJson = convertAltiumSchDocToCircuitJson(
    parseAltiumSchDoc(source),
    { sheetName: "TI TMDS62LEVM Rev. B — sheet 17" },
  )
  const dNoteLines = circuitJson.filter(
    (element): element is SchematicText =>
      element.type === "schematic_text" &&
      element.schematic_text_id.startsWith(
        "schematic_text_frame_line_altium_1142_",
      ),
  )

  expect(dNoteLines.map((element) => element.text)).toEqual([
    "D-Note:-",
    "PORz inputs have slew rate requirements specified. When",
    "PMIC nRSTOUT is connected to PORz. Adjust the pull-up to",
    "minimize the rise time (100-200 ns) when using an open drain",
    "output. PORz is fail-safe and 3.3 V tolerant. The PORz input",
    "can to 1.8 V or 3.3 V.",
  ])
  expect(
    circuitJson.find(
      (element) =>
        element.type === "schematic_rect" &&
        element.schematic_rect_id === "schematic_text_frame_altium_1142",
    ),
  ).toMatchObject({
    color: "transparent",
    fill_color: "#ffffff",
    is_filled: true,
    stroke_width: 0,
  })
  const sclPinText = circuitJson.find(
    (element): element is SchematicText =>
      element.type === "schematic_text" &&
      element.schematic_text_id === "schematic_pin_name_altium_798",
  )
  expect(sclPinText?.text).toBe("SCL")
  expect(sclPinText?.font_size).toBeCloseTo(0.6)
  expect(
    circuitJson.find(
      (element) =>
        element.type === "schematic_path" &&
        element.schematic_path_id === "schematic_port_altium_1090",
    ),
  ).toMatchObject({
    fill_color: "#ffff80",
    points: [
      { x: 106, y: 74.5 },
      { x: 110, y: 74.5 },
      { x: 111, y: 74 },
      { x: 110, y: 73.5 },
      { x: 106, y: 73.5 },
    ],
  })
  expect(
    circuitJson.find(
      (element) =>
        element.type === "schematic_path" &&
        element.schematic_path_id === "schematic_port_altium_1102",
    ),
  ).toMatchObject({
    points: [
      { x: 32, y: 76.5 },
      { x: 39, y: 76.5 },
      { x: 39, y: 75.5 },
      { x: 32, y: 75.5 },
    ],
  })
  expect(
    circuitJson.find(
      (element) =>
        element.type === "schematic_path" &&
        element.schematic_path_id === "schematic_power_port_altium_1069",
    ),
  ).toMatchObject({ is_filled: false })
  expect(
    circuitJson.every(
      (element) => any_circuit_element.safeParse(element).success,
    ),
  ).toBe(true)
})
