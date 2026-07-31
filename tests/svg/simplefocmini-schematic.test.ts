import { expect, test } from "bun:test"
import { parseAltiumSchDoc, serializeAltiumSheetToSvg } from "altiumts"
import { any_circuit_element } from "circuit-json"
import { convertAltiumToCircuitJson } from "../../lib"
import { readReferenceBytes } from "../helpers/read-reference"
import { renderImportedSchematicToSvg } from "../helpers/render-imported-schematic"
import { stackAltiumAndCircuitJsonSvgs } from "../helpers/stack-svg-comparison"

test(
  "SimpleFOC Mini schematic: altiumts SVG on the left, Circuit JSON SVG on the right",
  async () => {
    const source = await readReferenceBytes("simplefocmini-2024-04-26.SchDoc")
    const document = parseAltiumSchDoc(source)
    const circuitJson = convertAltiumToCircuitJson(source, {
      sourceType: "schematic",
      schematic: { sheetName: "SimpleFOC Mini" },
    })

    expect(
      circuitJson.filter((element) => element.type === "schematic_sheet"),
    ).toHaveLength(1)
    expect(
      circuitJson.filter((element) => element.type === "schematic_trace")
        .length,
    ).toBeGreaterThan(0)
    expect(
      circuitJson.filter((element) => element.type === "schematic_text").length,
    ).toBeGreaterThan(0)
    expect(
      circuitJson.every(
        (element) => any_circuit_element.safeParse(element).success,
      ),
    ).toBe(true)

    const altiumSvg = serializeAltiumSheetToSvg(document, {
      height: 600,
      title: "altiumts source rendering",
      width: 800,
    })
    const circuitJsonSvg = renderImportedSchematicToSvg(circuitJson)
    const comparisonSvg = stackAltiumAndCircuitJsonSvgs(
      altiumSvg,
      circuitJsonSvg,
      "SimpleFOC Mini schematic",
    )

    await expect(comparisonSvg).toMatchSvgSnapshot(import.meta.path)
  },
  { timeout: 40_000 },
)
