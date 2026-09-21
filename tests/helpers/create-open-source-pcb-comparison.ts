import {
  AltiumBinaryPcbDoc,
  AltiumPcbDoc,
  getPcbBoardGeometry,
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
  focusOnBoard = false,
  pcbName,
}: {
  filename: string
  focusOnBoard?: boolean
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
  const hasSolderMask = document.records.some((record) =>
    /^(?:TOP|BOTTOM)SOLDER$/u.test(
      (record.getDecoded("LAYER") ?? "")
        .replace(/[\s_.-]+/gu, "")
        .toUpperCase(),
    ),
  )
  const circuitJson = convertAltiumToCircuitJson(source, {
    pcb: { includeSolderMask: hasSolderMask },
    sourceType: "pcb",
  })
  const board = circuitJson.find((element) => element.type === "pcb_board")
  if (!board) throw new Error(`${filename} did not produce a PCB board`)

  const boardBounds = focusOnBoard
    ? getPcbBoardGeometry(document).outline.bounds
    : undefined
  if (focusOnBoard && !boardBounds) {
    throw new Error(`${filename} does not contain an Altium board outline`)
  }
  const boardPadding = boardBounds
    ? Math.max(
        boardBounds.maxX - boardBounds.minX,
        boardBounds.maxY - boardBounds.minY,
      ) * 0.05
    : 0
  const altiumSvg = serializeAltiumPcbToSvg(document, {
    height: 600,
    title: "altiumts source rendering",
    viewBox:
      focusOnBoard && boardBounds
        ? {
            height: boardBounds.maxY - boardBounds.minY + 2 * boardPadding,
            width: boardBounds.maxX - boardBounds.minX + 2 * boardPadding,
            x: boardBounds.minX - boardPadding,
            y: boardBounds.minY - boardPadding,
          }
        : undefined,
    width: 800,
  })
  const circuitJsonSvg = convertCircuitJsonToPcbSvg(circuitJson, {
    matchBoardAspectRatio: true,
    showSolderMask: hasSolderMask,
    viewportTarget: focusOnBoard
      ? { pcb_board_id: board.pcb_board_id }
      : undefined,
  })
  const comparisonSvg = stackAltiumAndCircuitJsonSvgs({
    altiumSvg,
    circuitJsonSvg,
    label: `${pcbName} PCB`,
  })

  return { circuitJson, circuitJsonSvg, comparisonSvg }
}
