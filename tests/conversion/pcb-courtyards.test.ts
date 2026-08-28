import { expect, test } from "bun:test"
import { parseAltiumPcbDoc, serializeAltiumPcbToSvg } from "altiumts"
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg"
import { convertAltiumPcbDocToCircuitJson } from "../../lib"
import { stackAltiumAndCircuitJsonSvgs } from "../helpers/stack-svg-comparison"

const courtyardRecords = [
  "|RECORD=Board|VERSION=5.0|KIND0=0|VX0=-100mil|VY0=-100mil|KIND1=0|VX1=450mil|VY1=-100mil|KIND2=0|VX2=450mil|VY2=450mil|KIND3=0|VX3=-100mil|VY3=450mil|KIND4=0|VX4=-100mil|VY4=-100mil",
  "|RECORD=Component|ID=4|LAYER=TOP|X=0mil|Y=0mil|HEIGHT=20mil",
  "|RECORD=Track|COMPONENT=4|LAYER=MECHANICAL15|X1=0mil|Y1=0mil|X2=100mil|Y2=0mil|WIDTH=2mil",
  "|RECORD=Track|COMPONENT=4|LAYER=MECHANICAL15|X1=100mil|Y1=100mil|X2=0mil|Y2=100mil|WIDTH=2mil",
  "|RECORD=Track|COMPONENT=4|LAYER=MECHANICAL15|X1=100mil|Y1=0mil|X2=100mil|Y2=100mil|WIDTH=2mil",
  "|RECORD=Track|COMPONENT=4|LAYER=MECHANICAL15|X1=0mil|Y1=0mil|X2=0mil|Y2=100mil|WIDTH=2mil",
  "|RECORD=Arc|COMPONENT=4|LAYER=MECHANICAL16|LOCATION.X=200mil|LOCATION.Y=200mil|RADIUS=50mil|STARTANGLE=0|ENDANGLE=360|WIDTH=2mil",
  "|RECORD=Region|COMPONENT=4|LAYER=MECHANICAL15|REGIONKIND=COPPER|HOLECOUNT=0|KIND0=0|VX0=300mil|VY0=300mil|KIND1=0|VX1=350mil|VY1=300mil|KIND2=0|VX2=325mil|VY2=350mil|KIND3=0|VX3=300mil|VY3=300mil",
]

const courtyardPcbDoc = parseAltiumPcbDoc(courtyardRecords.join("\n"))

test("repro: Mechanical 15/16 courtyards are missing from Circuit JSON", async () => {
  const circuitJson = convertAltiumPcbDocToCircuitJson(courtyardPcbDoc)
  const altiumSvg = serializeAltiumPcbToSvg(courtyardPcbDoc, {
    height: 800,
    title: "Altium courtyard source",
    width: 800,
  })
  const circuitJsonSvg = convertCircuitJsonToPcbSvg(circuitJson, {
    height: 800,
    matchBoardAspectRatio: true,
    showCourtyards: true,
    width: 800,
  })
  const comparisonSvg = stackAltiumAndCircuitJsonSvgs({
    altiumSvg,
    circuitJsonSvg,
    label: "PCB courtyards",
  })

  await expect(comparisonSvg).toMatchSvgSnapshot(import.meta.path)
})
