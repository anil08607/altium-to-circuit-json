import { parseAltiumSchDoc, serializeAltiumSheetToSvg } from "altiumts"
import type { AnyCircuitElement } from "circuit-json"
import { convertAltiumToCircuitJson } from "../../lib"
import { readReferenceBytes } from "./read-reference"
import { renderImportedSchematicToSvg } from "./render-imported-schematic"
import { stackAltiumAndCircuitJsonSvgs } from "./stack-svg-comparison"

export interface OpenSourceSchematicComparison {
  circuitJson: AnyCircuitElement[]
  circuitJsonSvg: string
  comparisonSvg: string
}

export async function createOpenSourceSchematicComparison({
  filename,
  schematicName,
}: {
  filename: string
  schematicName: string
}): Promise<OpenSourceSchematicComparison> {
  const source = await readReferenceBytes(filename)
  const document = parseAltiumSchDoc(source)
  const circuitJson = convertAltiumToCircuitJson(source, {
    sourceType: "schematic",
    schematic: { sheetName: schematicName },
  })
  const altiumSvg = serializeAltiumSheetToSvg(document, {
    height: 600,
    title: "altiumts source rendering",
    width: 800,
  })
  const circuitJsonSvg = renderImportedSchematicToSvg(circuitJson)
  const comparisonSvg = stackAltiumAndCircuitJsonSvgs({
    altiumSvg,
    circuitJsonSvg,
    label: `${schematicName} schematic`,
  })

  return { circuitJson, circuitJsonSvg, comparisonSvg }
}
