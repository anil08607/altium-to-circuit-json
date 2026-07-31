import { expect, test } from "bun:test"
import { join } from "node:path"
import { parseAltiumPcbDoc, serializeAltiumPcbToSvg } from "altiumts"
import { any_circuit_element } from "circuit-json"
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg"
import { stackSvgsHorizontally } from "stack-svgs"
import { convertAltiumPcbDocToCircuitJson } from "../../lib"

const referencePath = join(
  import.meta.dir,
  "../fixtures/downloaded/simplefocmini-2024-04-26.PcbDoc",
)

test(
  "SimpleFOC Mini PCB: altiumts SVG on the left, Circuit JSON SVG on the right",
  async () => {
    const source = await Bun.file(referencePath).text()
    const document = parseAltiumPcbDoc(source)
    const circuitJson = convertAltiumPcbDocToCircuitJson(document)

    expect(
      circuitJson.filter((element) => element.type === "pcb_smtpad").length,
    ).toBeGreaterThan(0)
    expect(
      circuitJson.filter((element) => element.type === "pcb_trace").length,
    ).toBeGreaterThan(0)
    expect(
      circuitJson.every(
        (element) => any_circuit_element.safeParse(element).success,
      ),
    ).toBe(true)
    expect(
      circuitJson
        .filter((element) => element.type === "pcb_silkscreen_text")
        .every((element) => !/^\d+(?:,\d+)+$/u.test(element.text)),
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
