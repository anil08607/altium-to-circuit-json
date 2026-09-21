import { expect, test } from "bun:test"
import { parseAltiumPcbDoc, serializeAltiumPcbToSvg } from "altiumts"
import type { PcbFabricationNotePath } from "circuit-json"
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

test("renders top and bottom solder-mask tracks with solder-mask color", async () => {
  expect(
    convertAltiumPcbDocToCircuitJson(solderMaskTrackPcbDoc).some(
      (element) => element.type === "pcb_fabrication_note_path",
    ),
  ).toBe(false)

  const circuitJson = convertAltiumPcbDocToCircuitJson(solderMaskTrackPcbDoc, {
    includeSolderMask: true,
  })
  const paths = circuitJson.filter(
    (element): element is PcbFabricationNotePath =>
      element.type === "pcb_fabrication_note_path",
  )

  expect(paths).toHaveLength(2)
  const normalizedPaths = paths.map(
    ({ color, layer, route, stroke_width }) => ({
      color,
      layer,
      route: route.map(({ x, y }) => ({
        x: Number(x.toFixed(3)),
        y: Number(y.toFixed(3)),
      })),
      stroke_width,
    }),
  )
  expect(normalizedPaths).toEqual([
    {
      color: "rgb(52, 135, 73)",
      layer: "top",
      route: [
        { x: 2.54, y: 3.81 },
        { x: 10.16, y: 3.81 },
      ],
      stroke_width: 0.508,
    },
    {
      color: "rgb(52, 135, 73)",
      layer: "bottom",
      route: [
        { x: 2.54, y: 8.89 },
        { x: 10.16, y: 8.89 },
      ],
      stroke_width: 0.762,
    },
  ])

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
