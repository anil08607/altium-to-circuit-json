import { expect, test } from "bun:test"
import { parseAltiumPcbDoc, serializeAltiumPcbToSvg } from "altiumts"
import { any_circuit_element } from "circuit-json"
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg"
import { convertAltiumPcbDocToCircuitJson } from "../../lib"
import { stackAltiumAndCircuitJsonSvgs } from "../helpers/stack-svg-comparison"

const validCourtyardRecords = [
  "|RECORD=Board|VERSION=5.0|KIND0=0|VX0=-100mil|VY0=-100mil|KIND1=0|VX1=450mil|VY1=-100mil|KIND2=0|VX2=450mil|VY2=450mil|KIND3=0|VX3=-100mil|VY3=450mil|KIND4=0|VX4=-100mil|VY4=-100mil",
  "|RECORD=Component|ID=4|LAYER=TOP|X=0mil|Y=0mil|HEIGHT=20mil",
  "|RECORD=Track|COMPONENT=4|LAYER=MECHANICAL15|X1=0mil|Y1=0mil|X2=100mil|Y2=0mil|WIDTH=2mil",
  "|RECORD=Track|COMPONENT=4|LAYER=MECHANICAL15|X1=100mil|Y1=100mil|X2=0mil|Y2=100mil|WIDTH=2mil",
  "|RECORD=Track|COMPONENT=4|LAYER=MECHANICAL15|X1=100mil|Y1=0mil|X2=100mil|Y2=100mil|WIDTH=2mil",
  "|RECORD=Track|COMPONENT=4|LAYER=MECHANICAL15|X1=0mil|Y1=0mil|X2=0mil|Y2=100mil|WIDTH=2mil",
  "|RECORD=Arc|COMPONENT=4|LAYER=MECHANICAL16|LOCATION.X=200mil|LOCATION.Y=200mil|RADIUS=50mil|STARTANGLE=0|ENDANGLE=360|WIDTH=2mil",
  "|RECORD=Region|COMPONENT=4|LAYER=MECHANICAL15|REGIONKIND=COPPER|HOLECOUNT=0|KIND0=0|VX0=300mil|VY0=300mil|KIND1=0|VX1=350mil|VY1=300mil|KIND2=0|VX2=325mil|VY2=350mil|KIND3=0|VX3=300mil|VY3=300mil",
]

const courtyardPcbDoc = parseAltiumPcbDoc(
  [
    ...validCourtyardRecords,
    "|RECORD=Track|COMPONENT=4|LAYER=MECHANICAL15|X1=500mil|Y1=500mil|X2=550mil|Y2=500mil|WIDTH=2mil",
    "|RECORD=Track|LAYER=MECHANICAL15|X1=600mil|Y1=600mil|X2=650mil|Y2=600mil|WIDTH=2mil",
  ].join("\n"),
)

const courtyardSnapshotPcbDoc = parseAltiumPcbDoc(
  validCourtyardRecords.join("\n"),
)

test("converts component-owned Mechanical 15/16 closed paths to courtyards", () => {
  const circuitJson = convertAltiumPcbDocToCircuitJson(courtyardPcbDoc)
  const courtyards = circuitJson.filter(
    (element) => element.type === "pcb_courtyard_outline",
  )

  expect(courtyards).toHaveLength(3)
  expect(
    courtyards.every(
      (element) => element.pcb_component_id === "pcb_component_altium_0",
    ),
  ).toBeTrue()
  expect(courtyards.map((element) => element.layer).sort()).toEqual([
    "bottom",
    "top",
    "top",
  ])
  expect(
    courtyards.map((element) => element.outline.length).sort((a, b) => a - b),
  ).toEqual([3, 4, 48])
  expect(
    courtyards.every(
      (element) => any_circuit_element.safeParse(element).success,
    ),
  ).toBeTrue()
})

test("can exclude courtyards", () => {
  const circuitJson = convertAltiumPcbDocToCircuitJson(courtyardPcbDoc, {
    includeCourtyards: false,
  })

  expect(
    circuitJson.some((element) => element.type.startsWith("pcb_courtyard_")),
  ).toBeFalse()
})

test("does not emit courtyards without their owning components", () => {
  const circuitJson = convertAltiumPcbDocToCircuitJson(courtyardPcbDoc, {
    includeComponents: false,
  })

  expect(
    circuitJson.some((element) => element.type.startsWith("pcb_courtyard_")),
  ).toBeFalse()
})

test("PCB courtyards: Altium source and Circuit JSON SVG", async () => {
  const circuitJson = convertAltiumPcbDocToCircuitJson(courtyardSnapshotPcbDoc)
  const altiumSvg = serializeAltiumPcbToSvg(courtyardSnapshotPcbDoc, {
    height: 600,
    title: "Altium courtyard source",
    width: 800,
  })
  const circuitJsonSvg = convertCircuitJsonToPcbSvg(circuitJson, {
    height: 600,
    matchBoardAspectRatio: true,
    showCourtyards: true,
    width: 800,
  })
  const comparisonSvg = stackAltiumAndCircuitJsonSvgs(
    altiumSvg,
    circuitJsonSvg,
    "PCB courtyards",
  )

  await expect(comparisonSvg).toMatchSvgSnapshot(import.meta.path)
})
