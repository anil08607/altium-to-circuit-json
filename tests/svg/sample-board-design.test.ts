import { expect, test } from "bun:test"
import { parseAltiumPcbDoc, serializeAltiumPcbToSvg } from "altiumts"
import { any_circuit_element } from "circuit-json"
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg"
import { convertAltiumToCircuitJson } from "../../lib"
import { readReferenceText } from "../helpers/read-reference"
import { stackAltiumAndCircuitJsonSvgs } from "../helpers/stack-svg-comparison"

test(
  "sample board: altiumts SVG on the left, Circuit JSON SVG on the right",
  async () => {
    const source = await readReferenceText("sample-board-design.PcbDoc")
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
    const comparisonSvg = stackAltiumAndCircuitJsonSvgs(
      altiumSvg,
      circuitJsonSvg,
      "sample board",
    )

    await expect(comparisonSvg).toMatchSvgSnapshot(import.meta.path)
  },
  { timeout: 40_000 },
)
