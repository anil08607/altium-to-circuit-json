import {
  AltiumBinaryPcbDoc,
  AltiumPcbDoc,
  parseAltiumFile,
  serializeAltiumPcbToSvg,
} from "altiumts"
import type { AnyCircuitElement } from "circuit-json"
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg"
import { convertAltiumToCircuitJson } from "../../lib"
import { readReferenceBytes } from "./read-reference"
import { stackAltiumAndCircuitJsonSvgs } from "./stack-svg-comparison"

interface OpenSourcePcbComparison {
  circuitJson: AnyCircuitElement[]
  circuitJsonSvg: string
  comparisonSvg: string
}

export async function createOpenSourcePcbComparison({
  filename,
  pcbName,
}: {
  filename: string
  pcbName: string
}): Promise<OpenSourcePcbComparison> {
  const source = await readReferenceBytes(filename)
  const document = parseAltiumFile(source).document
  if (
    !(document instanceof AltiumPcbDoc) &&
    !(document instanceof AltiumBinaryPcbDoc)
  ) {
    throw new Error(
      `Expected ${filename} to contain an Altium PCB document, got ${document.type}`,
    )
  }
  const circuitJson = convertAltiumToCircuitJson(source, { sourceType: "pcb" })
  const altiumSvg = serializeAltiumPcbToSvg(document, {
    height: 600,
    title: "altiumts source rendering",
    width: 800,
  })
  const circuitJsonSvg = convertCircuitJsonToPcbSvg(circuitJson, {
    matchBoardAspectRatio: true,
  })
  const comparisonSvg = stackAltiumAndCircuitJsonSvgs({
    altiumSvg,
    circuitJsonSvg,
    label: `${pcbName} PCB`,
  })

  return { circuitJson, circuitJsonSvg, comparisonSvg }
}
