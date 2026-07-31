import { mkdir, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { parseAltiumBinaryPcbDoc, parseAltiumSchDoc } from "altiumts"
import type { AnyCircuitElement } from "circuit-json"
import { any_circuit_element } from "circuit-json"
import {
  convertAltiumPcbDocToCircuitJson,
  convertAltiumSchDocToCircuitJson,
} from "../lib"
import {
  REFERENCE_OUTPUT_DIRECTORY,
  TI_TMDS62LEVM_FIXTURE_NAME,
  TI_TMDS62LEVM_PCB_FILENAME,
  TI_TMDS62LEVM_SCHEMATIC_SHEET_NUMBERS,
} from "./references/reference-manifest"

const outputFlagIndex = Bun.argv.indexOf("--output")
const outputDirectory = resolve(
  outputFlagIndex >= 0
    ? (Bun.argv[outputFlagIndex + 1] ??
        (() => {
          throw new Error("--output requires a directory")
        })())
    : `artifacts/${TI_TMDS62LEVM_FIXTURE_NAME}`,
)
const schematicOutputDirectory = resolve(outputDirectory, "schematics")

await mkdir(schematicOutputDirectory, { recursive: true })

const pcbSource = await readReference(TI_TMDS62LEVM_PCB_FILENAME)
const pcbDocument = parseAltiumBinaryPcbDoc(pcbSource)
const pcbCircuitJson = convertAltiumPcbDocToCircuitJson(pcbDocument)
validateCircuitJson(pcbCircuitJson, TI_TMDS62LEVM_PCB_FILENAME)
await writeCircuitJson(
  resolve(outputDirectory, "pcb.circuit.json"),
  pcbCircuitJson,
)

const schematicSheets: Array<{ elementCount: number; sheetNumber: string }> = []
for (const sheetNumber of TI_TMDS62LEVM_SCHEMATIC_SHEET_NUMBERS) {
  const filename = `${TI_TMDS62LEVM_FIXTURE_NAME}/${sheetNumber}.SchDoc`
  const source = await readReference(filename)
  const document = parseAltiumSchDoc(source)
  const circuitJson = convertAltiumSchDocToCircuitJson(document, {
    sheetName: `TI TMDS62LEVM Rev. B — sheet ${sheetNumber}`,
  })
  validateCircuitJson(circuitJson, filename)
  await writeCircuitJson(
    resolve(schematicOutputDirectory, `${sheetNumber}.circuit.json`),
    circuitJson,
  )
  schematicSheets.push({ elementCount: circuitJson.length, sheetNumber })
}

await writeFile(
  resolve(outputDirectory, "manifest.json"),
  `${JSON.stringify(
    {
      source: "Texas Instruments SPRCAL9 / TMDS62LEVM Rev. B",
      pcb: {
        elementCount: pcbCircuitJson.length,
        output: "pcb.circuit.json",
        source: TI_TMDS62LEVM_PCB_FILENAME,
      },
      schematicSheets,
    },
    null,
    2,
  )}\n`,
)

console.log(
  `Converted the PCB and ${schematicSheets.length} schematic sheets to ${outputDirectory}`,
)

async function readReference(filename: string): Promise<Uint8Array> {
  return new Uint8Array(
    await Bun.file(resolve(REFERENCE_OUTPUT_DIRECTORY, filename)).arrayBuffer(),
  )
}

async function writeCircuitJson(
  outputPath: string,
  circuitJson: AnyCircuitElement[],
): Promise<void> {
  await writeFile(outputPath, `${JSON.stringify(circuitJson, null, 2)}\n`)
}

function validateCircuitJson(
  circuitJson: AnyCircuitElement[],
  sourceName: string,
): void {
  for (const [index, element] of circuitJson.entries()) {
    const result = any_circuit_element.safeParse(element)
    if (!result.success) {
      throw new Error(
        `${sourceName} generated invalid Circuit JSON at index ${index}: ${result.error.message}`,
      )
    }
  }
}
