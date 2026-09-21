import { expect, test } from "bun:test"
import { parseAltiumPcbDoc, serializeAltiumPcbToSvg } from "altiumts"
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg"
import { convertAltiumPcbDocToCircuitJson } from "../../lib"
import { stackAltiumAndCircuitJsonSvgs } from "../helpers/stack-svg-comparison"

const document = parseAltiumPcbDoc(
  [
    "|RECORD=Board|VERSION=5.0|KIND0=0|VX0=0mil|VY0=0mil|KIND1=0|VX1=500mil|VY1=0mil|KIND2=0|VX2=500mil|VY2=500mil|KIND3=0|VX3=0mil|VY3=500mil|KIND4=0|VX4=0mil|VY4=0mil",
    "|RECORD=Track|LAYER=TOPSOLDER|X1=100mil|Y1=100mil|X2=400mil|Y2=100mil|WIDTH=30mil",
    "|RECORD=Track|LAYER=TOPSOLDER|X1=100mil|Y1=200mil|X2=300mil|Y2=400mil|WIDTH=20mil",
    "|RECORD=Track|LAYER=TOP|X1=250mil|Y1=50mil|X2=250mil|Y2=450mil|WIDTH=10mil",
    "|RECORD=Track|LAYER=BOTTOMSOLDER|X1=100mil|Y1=100mil|X2=100mil|Y2=400mil|WIDTH=40mil",
    "|RECORD=Track|LAYER=BOTTOMSOLDER|X1=200mil|Y1=200mil|X2=400mil|Y2=400mil|WIDTH=20mil",
    "|RECORD=Track|LAYER=BOTTOMSOLDER|X1=350mil|Y1=100mil|X2=350mil|Y2=100mil|WIDTH=40mil",
    "|RECORD=Track|LAYER=BOTTOM|X1=50mil|Y1=250mil|X2=450mil|Y2=250mil|WIDTH=10mil",
  ].join("\n"),
)

test.each(["top", "bottom"] as const)(
  "renders imported %s solder-mask tracks",
  async (layer) => {
    const circuitJson = convertAltiumPcbDocToCircuitJson(document)
    const openings = circuitJson.filter(
      (element) =>
        element.type === "pcb_soldermask_opening" && element.layer === layer,
    )
    const svg = convertCircuitJsonToPcbSvg(circuitJson, {
      layer,
      showSolderMask: true,
      width: 800,
      height: 800,
      viewport: { minX: -0.635, minY: -0.635, maxX: 13.335, maxY: 13.335 },
    })
    expect(svg.match(/data-pcb-soldermask-opening-id=/gu)).toHaveLength(
      openings.length,
    )
    expect(svg).not.toContain("NaN")
    const comparison = stackAltiumAndCircuitJsonSvgs({
      altiumSvg: serializeAltiumPcbToSvg(document, {
        width: 800,
        height: 800,
        viewBox: { x: -25, y: -25, width: 550, height: 550 },
        layers: [layer.toUpperCase(), `${layer.toUpperCase()}SOLDER`],
      }),
      circuitJsonSvg: svg,
      label: `${layer} solder-mask tracks`,
    })
    await expect(comparison).toMatchSvgSnapshot(import.meta.path, layer)
  },
)
