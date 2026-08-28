import type { PcbBoard } from "circuit-json"
import { convertAltiumToCircuitJson } from "../../lib"
import { readReferenceBytes } from "./read-reference"

export async function getImportedPcbBoard({
  filename,
}: {
  filename: string
}): Promise<PcbBoard> {
  const source = await readReferenceBytes(filename)
  const circuitJson = convertAltiumToCircuitJson(source, { sourceType: "pcb" })
  const board = circuitJson.find(
    (element): element is PcbBoard => element.type === "pcb_board",
  )
  if (!board) throw new Error(`${filename} did not produce a PCB board`)
  return board
}
