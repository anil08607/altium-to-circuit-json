import { expect, test } from "bun:test"
import { parseAltiumPcbDoc, serializeAltiumPcbToSvg } from "altiumts"
import type { PcbCopperPour } from "circuit-json"
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg"
import { convertAltiumPcbDocToCircuitJson } from "../../lib"
import { stackAltiumAndCircuitJsonSvgs } from "../helpers/stack-svg-comparison"

const solderMaskTrackPcbDoc = parseAltiumPcbDoc(
  [
    "|RECORD=Board|VERSION=5.0|KIND0=0|VX0=0mil|VY0=0mil|KIND1=0|VX1=500mil|VY1=0mil|KIND2=0|VX2=500mil|VY2=500mil|KIND3=0|VX3=0mil|VY3=500mil|KIND4=0|VX4=0mil|VY4=0mil",
    "|RECORD=Track|LAYER=TOPSOLDER|X1=100mil|Y1=150mil|X2=400mil|Y2=150mil|WIDTH=20mil",
    "|RECORD=Track|LAYER=BOTTOMSOLDER|X1=100mil|Y1=350mil|X2=400mil|Y2=350mil|WIDTH=30mil",
  ].join("\n"),
)

test("imports top and bottom tracks as solder-mask openings", async () => {
  expect(
    convertAltiumPcbDocToCircuitJson(solderMaskTrackPcbDoc).some(
      (element) =>
        element.type === "pcb_copper_pour" &&
        element.pcb_copper_pour_id.includes("soldermask_opening"),
    ),
  ).toBe(false)

  const circuitJson = convertAltiumPcbDocToCircuitJson(solderMaskTrackPcbDoc, {
    includeSolderMask: true,
  })
  const openings = circuitJson.filter(
    (element): element is PcbCopperPour =>
      element.type === "pcb_copper_pour" &&
      element.pcb_copper_pour_id.includes("soldermask_opening"),
  )

  expect(openings).toHaveLength(2)
  const normalizedOpenings = openings.map((opening) => {
    expect(opening.shape).toBe("polygon")
    if (opening.shape !== "polygon") throw new Error("Expected polygon opening")
    const xs = opening.points.map((point) => point.x)
    const ys = opening.points.map((point) => point.y)
    return {
      center: {
        x: Number(((Math.min(...xs) + Math.max(...xs)) / 2).toFixed(3)),
        y: Number(((Math.min(...ys) + Math.max(...ys)) / 2).toFixed(3)),
      },
      covered_with_solder_mask: opening.covered_with_solder_mask,
      height: Number((Math.max(...ys) - Math.min(...ys)).toFixed(3)),
      layer: opening.layer,
      point_count: opening.points.length,
      shape: opening.shape,
      width: Number((Math.max(...xs) - Math.min(...xs)).toFixed(3)),
    }
  })
  expect(normalizedOpenings).toEqual([
    {
      center: { x: 6.35, y: 3.81 },
      covered_with_solder_mask: false,
      height: 0.508,
      layer: "top",
      point_count: 18,
      shape: "polygon",
      width: 8.128,
    },
    {
      center: { x: 6.35, y: 8.89 },
      covered_with_solder_mask: false,
      height: 0.762,
      layer: "bottom",
      point_count: 18,
      shape: "polygon",
      width: 8.382,
    },
  ])

  expect(
    circuitJson.find((element) => element.type === "pcb_board")
      ?.solder_mask_color,
  ).toBe("green")

  const circuitJsonSvg = convertCircuitJsonToPcbSvg(circuitJson, {
    showSolderMask: true,
  })
  expect(circuitJsonSvg).toContain('class="pcb-board-soldermask"')

  const comparisonSvg = stackAltiumAndCircuitJsonSvgs({
    altiumSvg: serializeAltiumPcbToSvg(solderMaskTrackPcbDoc),
    circuitJsonSvg,
    label: "Solder-mask tracks",
  })
  await expect(comparisonSvg).toMatchSvgSnapshot(import.meta.path)
})
