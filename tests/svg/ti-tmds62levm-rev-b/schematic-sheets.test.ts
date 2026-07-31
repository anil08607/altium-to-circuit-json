import { expect, test } from "bun:test"
import { parseAltiumSchDoc, serializeAltiumSheetToSvg } from "altiumts"
import { any_circuit_element } from "circuit-json"
import { convertCircuitJsonToSchematicSvg } from "circuit-to-svg"
import { convertAltiumSchDocToCircuitJson } from "../../../lib"
import {
  TI_TMDS62LEVM_FIXTURE_NAME,
  TI_TMDS62LEVM_SCHEMATIC_SHEET_NUMBERS,
} from "../../../scripts/references/reference-manifest"
import { readReferenceBytes } from "../../helpers/read-reference"
import { stackAltiumAndCircuitJsonSvgs } from "../../helpers/stack-svg-comparison"

for (const sheetNumber of TI_TMDS62LEVM_SCHEMATIC_SHEET_NUMBERS) {
  test(
    `TI TMDS62LEVM Rev. B schematic sheet ${sheetNumber}`,
    async () => {
      const filename = `${TI_TMDS62LEVM_FIXTURE_NAME}/${sheetNumber}.SchDoc`
      const source = await readReferenceBytes(filename)
      const document = parseAltiumSchDoc(source)
      const circuitJson = convertAltiumSchDocToCircuitJson(document, {
        sheetName: `TI TMDS62LEVM Rev. B — sheet ${sheetNumber}`,
      })

      expect(
        circuitJson.filter((element) => element.type === "schematic_sheet"),
      ).toHaveLength(1)
      expect(circuitJson.length).toBeGreaterThan(1)
      expect(
        circuitJson.every(
          (element) => any_circuit_element.safeParse(element).success,
        ),
      ).toBe(true)

      const title = `TI TMDS62LEVM Rev. B schematic sheet ${sheetNumber}`
      const altiumSvg = serializeAltiumSheetToSvg(document, {
        height: 600,
        title: `${title} — altiumts source`,
        width: 800,
      })
      const circuitJsonSvg = convertCircuitJsonToSchematicSvg(circuitJson)
      const comparisonSvg = stackAltiumAndCircuitJsonSvgs(
        altiumSvg,
        circuitJsonSvg,
        title,
      )

      await expect(comparisonSvg).toMatchSvgSnapshot(
        import.meta.path,
        `sheet-${sheetNumber}`,
      )
    },
    { timeout: 45_000 },
  )
}
