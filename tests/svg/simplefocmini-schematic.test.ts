import { expect, test } from "bun:test"
import { join } from "node:path"
import { parseAltiumSchDoc, serializeAltiumSheetToSvg } from "altiumts"
import { any_circuit_element } from "circuit-json"
import { convertCircuitJsonToSchematicSvg } from "circuit-to-svg"
import { stackSvgsHorizontally } from "stack-svgs"
import { convertAltiumToCircuitJson } from "../../lib"

const referencePath = join(
  import.meta.dir,
  "../fixtures/downloaded/simplefocmini-2024-04-26.SchDoc",
)

test(
  "SimpleFOC Mini schematic: altiumts SVG on the left, Circuit JSON SVG on the right",
  async () => {
    const source = new Uint8Array(await Bun.file(referencePath).arrayBuffer())
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
    const circuitJsonSvg = convertCircuitJsonToSchematicSvg(circuitJson)
    const comparisonSvg = stackSvgsHorizontally([altiumSvg, circuitJsonSvg], {
      gap: 24,
      normalizeSize: true,
      targetSize: 800,
      rootAttributes: {
        "aria-label": "altiumts source on left, Circuit JSON on right",
        role: "img",
      },
    })

    await expect(comparisonSvg).toMatchSvgSnapshot(import.meta.path)
  },
  { timeout: 40_000 },
)
