import { expect, test } from "bun:test"
import { join } from "node:path"
import { parseAltiumPcbDoc, serializeAltiumPcbToSvg } from "altiumts"
import { any_circuit_element } from "circuit-json"
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg"
import { stackSvgsHorizontally } from "stack-svgs"
import { convertAltiumToCircuitJson } from "../../lib"

const referencePath = join(
  import.meta.dir,
  "../fixtures/downloaded/sample-board-design.PcbDoc",
)

test(
  "sample board: altiumts SVG on the left, Circuit JSON SVG on the right",
  async () => {
    const source = await Bun.file(referencePath).text()
    const document = parseAltiumPcbDoc(source)
    const circuitJson = convertAltiumToCircuitJson(source, {
      sourceType: "pcb",
    })

    expect(
      circuitJson.filter((element) => element.type === "pcb_board"),
    ).toHaveLength(1)
    expect(
      circuitJson.filter((element) => element.type === "pcb_plated_hole")
        .length,
    ).toBeGreaterThan(0)
    expect(
      circuitJson.filter((element) => element.type === "pcb_silkscreen_line")
        .length,
    ).toBeGreaterThan(0)
    expect(
      circuitJson.some(
        (element) =>
          element.type === "pcb_plated_hole" && element.shape === "pill",
      ),
    ).toBe(true)
    expect(
      circuitJson.some(
        (element) =>
          element.type === "pcb_silkscreen_text" && element.text === "Q1",
      ),
    ).toBe(true)
    expect(
      circuitJson.every(
        (element) => any_circuit_element.safeParse(element).success,
      ),
    ).toBe(true)

    const altiumSvg = serializeAltiumPcbToSvg(document, {
      height: 600,
      title: "altiumts source rendering",
      width: 800,
    })
    const circuitJsonSvg = convertCircuitJsonToPcbSvg(circuitJson, {
      matchBoardAspectRatio: true,
    })
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
