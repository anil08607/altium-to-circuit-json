import { expect, test } from "bun:test"
import { parseAltiumBinaryPcbDoc, serializeAltiumPcbLayerToSvg } from "altiumts"
import { any_circuit_element } from "circuit-json"
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg"
import { convertAltiumPcbDocToCircuitJson } from "../../../lib"
import { TI_TMDS62LEVM_PCB_FILENAME } from "../../../scripts/references/reference-manifest"
import {
  filterCircuitJsonToCopperLayer,
  getPcbBoardViewport,
} from "../../helpers/filter-pcb-layer"
import { readReferenceBytes } from "../../helpers/read-reference"
import { stackAltiumAndCircuitJsonSvgs } from "../../helpers/stack-svg-comparison"

test(
  "TI TMDS62LEVM Rev. B PCB top copper",
  async () => {
    const source = await readReferenceBytes(TI_TMDS62LEVM_PCB_FILENAME)
    const document = parseAltiumBinaryPcbDoc(source)
    const circuitJson = convertAltiumPcbDocToCircuitJson(document)

    expect(
      circuitJson.filter((element) => element.type === "pcb_board"),
    ).toHaveLength(1)
    expect(
      circuitJson.filter((element) => element.type === "pcb_component").length,
    ).toBeGreaterThan(1_000)
    expect(
      circuitJson.filter((element) => element.type === "pcb_trace").length,
    ).toBeGreaterThan(20_000)
    expect(
      circuitJson.filter((element) => element.type === "pcb_smtpad").length,
    ).toBeGreaterThan(5_000)
    const representativeElements = [
      ...new Map(
        circuitJson.map((element) => [element.type, element]),
      ).values(),
    ]
    expect(
      representativeElements.every(
        (element) => any_circuit_element.safeParse(element).success,
      ),
    ).toBe(true)

    const topCopperCircuitJson = filterCircuitJsonToCopperLayer(
      circuitJson,
      "top",
    )
    const boardViewport = getPcbBoardViewport(circuitJson)
    expect(boardViewport.maxX - boardViewport.minX).toBeGreaterThan(130)
    expect(boardViewport.maxY - boardViewport.minY).toBeGreaterThan(140)
    const title = "TI TMDS62LEVM Rev. B PCB top copper"
    const altiumSvg = serializeAltiumPcbLayerToSvg(document, "TOP", {
      height: 800,
      showText: false,
      title: `${title} — altiumts source`,
      width: 800,
    })
    const circuitJsonSvg = convertCircuitJsonToPcbSvg(topCopperCircuitJson, {
      height: 800,
      layer: "top",
      matchBoardAspectRatio: true,
      viewport: boardViewport,
      width: 800,
    })
    const comparisonSvg = stackAltiumAndCircuitJsonSvgs(
      altiumSvg,
      circuitJsonSvg,
      title,
    )

    await expect(comparisonSvg).toMatchSvgSnapshot(import.meta.path)
  },
  { timeout: 180_000 },
)
