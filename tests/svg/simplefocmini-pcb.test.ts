import { expect, test } from "bun:test"
import { parseAltiumPcbDoc, serializeAltiumPcbToSvg } from "altiumts"
import { any_circuit_element } from "circuit-json"
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg"
import { convertAltiumPcbDocToCircuitJson } from "../../lib"
import { readReferenceText } from "../helpers/read-reference"
import { stackAltiumAndCircuitJsonSvgs } from "../helpers/stack-svg-comparison"

test(
  "SimpleFOC Mini PCB: altiumts SVG on the left, Circuit JSON SVG on the right",
  async () => {
    const source = await readReferenceText("simplefocmini-2024-04-26.PcbDoc")
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
    const comparisonSvg = stackAltiumAndCircuitJsonSvgs(
      altiumSvg,
      circuitJsonSvg,
      "SimpleFOC Mini PCB",
    )

    await expect(comparisonSvg).toMatchSvgSnapshot(import.meta.path)
  },
  { timeout: 40_000 },
)
