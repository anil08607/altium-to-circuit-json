import { expect, test } from "bun:test"
import { parseAltiumPcbDoc } from "altiumts"
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg"
import { convertAltiumPcbDocToCircuitJson } from "../../lib"
import { expectValidImportedPcb } from "../helpers/expect-valid-imported-pcb"

test("renders normal and inverted PCB text with source margins", async () => {
  const source = await Bun.file(
    `${import.meta.dir}/../fixtures/pcb-inverted-text.PcbDoc`,
  ).text()
  const circuitJson = convertAltiumPcbDocToCircuitJson(
    parseAltiumPcbDoc(source),
  )
  const circuitJsonSvg = convertCircuitJsonToPcbSvg(circuitJson, {
    matchBoardAspectRatio: true,
  })

  expectValidImportedPcb({
    circuitJson,
    circuitJsonSvg,
    requiredElementTypes: ["pcb_silkscreen_text", "pcb_copper_text"],
  })
  expect(circuitJsonSvg.match(/<mask\b/gu)).toHaveLength(5)
  await expect(circuitJsonSvg).toMatchSvgSnapshot(import.meta.path)
})
