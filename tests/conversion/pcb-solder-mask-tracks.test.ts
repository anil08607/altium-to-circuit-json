import { expect, test } from "bun:test"
import { parseAltiumPcbDoc } from "altiumts"
import { any_circuit_element } from "circuit-json"
import { getFullConnectivityMapFromCircuitJson } from "circuit-json-to-connectivity-map"
import {
  convertAltiumDocumentToCircuitJson,
  convertAltiumPcbDocToCircuitJson,
  convertAltiumToCircuitJson,
} from "../../lib"

const board = "|RECORD=Board|VERSION=5.0"
const track = "X1=100mil|Y1=200mil|X2=400mil|Y2=200mil|WIDTH=20mil"

test.each([
  ["TOPSOLDER", "top"],
  ["BOTTOMSOLDER", "bottom"],
  ["Top Solder", "top"],
  ["bottom_solder", "bottom"],
] as const)(
  "converts %s tracks into native mask openings",
  (sourceLayer, layer) => {
    const document = parseAltiumPcbDoc(
      `${board}\n|RECORD=Track|LAYER=${sourceLayer}|${track}`,
    )
    const circuitJson = convertAltiumPcbDocToCircuitJson(document)
    const openings = circuitJson.filter(
      (element) => element.type === "pcb_soldermask_opening",
    )
    expect(openings).toHaveLength(1)
    const opening = openings[0]!
    expect(opening.layer).toBe(layer)
    expect(any_circuit_element.parse(opening)).toEqual(opening)
    expect(opening.shape).toBe("polygon")
    if (opening.shape !== "polygon")
      throw new Error("Expected a capsule polygon")
    const xs = opening.points.map((point) => point.x)
    const ys = opening.points.map((point) => point.y)
    expect(Math.min(...xs)).toBeCloseTo(2.286, 8)
    expect(Math.max(...xs)).toBeCloseTo(10.414, 8)
    expect(Math.min(...ys)).toBeCloseTo(4.826, 8)
    expect(Math.max(...ys)).toBeCloseTo(5.334, 8)
    expect(circuitJson.map((element) => element.type)).toEqual([
      "pcb_board",
      "pcb_soldermask_opening",
    ])
  },
)

test.each([
  [100, 200, 100, 500],
  [400, 500, 100, 200],
  [-200, -100, 100, 300],
])(
  "preserves rotated round-cap geometry from (%s,%s) to (%s,%s)",
  (x1, y1, x2, y2) => {
    const document = parseAltiumPcbDoc(
      `${board}\n|RECORD=Track|LAYER=TOPSOLDER|X1=${x1}mil|Y1=${y1}mil|X2=${x2}mil|Y2=${y2}mil|WIDTH=20mil`,
    )
    const opening = convertAltiumPcbDocToCircuitJson(document).find(
      (element) => element.type === "pcb_soldermask_opening",
    )!
    expect(opening.shape).toBe("polygon")
    if (opening.shape !== "polygon") throw new Error("Expected polygon")
    const radius = 0.254
    const angle = Math.atan2(y2! - y1!, x2! - x1!)
    const localPoints = opening.points.map((point) => {
      const dx = point.x - x1! * 0.0254
      const dy = point.y - y1! * 0.0254
      return {
        x: dx * Math.cos(angle) + dy * Math.sin(angle),
        y: -dx * Math.sin(angle) + dy * Math.cos(angle),
      }
    })
    expect(Math.min(...localPoints.map((point) => point.x))).toBeCloseTo(
      -radius,
      8,
    )
    expect(Math.max(...localPoints.map((point) => point.x))).toBeCloseTo(
      Math.hypot(x2! - x1!, y2! - y1!) * 0.0254 + radius,
      8,
    )
    expect(Math.min(...localPoints.map((point) => point.y))).toBeCloseTo(
      -radius,
      8,
    )
    expect(Math.max(...localPoints.map((point) => point.y))).toBeCloseTo(
      radius,
      8,
    )

    const capPoints = opening.points.slice(0, opening.points.length / 2)
    for (let index = 1; index < capPoints.length; index++) {
      const a = capPoints[index - 1]!
      const b = capPoints[index]!
      const chordMidpointRadius = Math.hypot(
        (a.x + b.x) / 2 - x2! * 0.0254,
        (a.y + b.y) / 2 - y2! * 0.0254,
      )
      expect(radius - chordMidpointRadius).toBeLessThanOrEqual(0.001)
    }
  },
)

test("preserves a zero-length track as a circular mask opening", () => {
  const document = parseAltiumPcbDoc(
    `${board}\n|RECORD=Track|LAYER=BOTTOMSOLDER|X1=100mil|Y1=200mil|X2=100mil|Y2=200mil|WIDTH=20mil`,
  )
  const opening = convertAltiumPcbDocToCircuitJson(document).find(
    (element) => element.type === "pcb_soldermask_opening",
  )
  expect(opening).toMatchObject({
    type: "pcb_soldermask_opening",
    shape: "circle",
    layer: "bottom",
    x: 2.54,
    y: 5.08,
    radius: 0.254,
  })
  expect(any_circuit_element.safeParse(opening).success).toBe(true)
})

test.each([
  "X1=0|Y1=0|X2=100|Y2=100|WIDTH=0",
  "X1=0|Y1=0|X2=100|Y2=100|WIDTH=-10",
  "X1=0|Y1=0|X2=100|Y2=100",
  "X1=0|Y1=0|WIDTH=10",
])("skips malformed mask geometry: %s", (geometry) => {
  const document = parseAltiumPcbDoc(
    `${board}\n|RECORD=Track|LAYER=TOPSOLDER|${geometry}`,
  )
  expect(
    convertAltiumPcbDocToCircuitJson(document).filter(
      (element) => element.type === "pcb_soldermask_opening",
    ),
  ).toHaveLength(0)
})

test("keeps mask openings independent of copper, paste, silkscreen, and nets", () => {
  const source = [
    board,
    "|RECORD=Net|NAME=VCC",
    ...[
      "TOPSOLDER",
      "BOTTOMSOLDER",
      "TOP",
      "TOPOVERLAY",
      "TOPPASTE",
      "BOTTOMPASTE",
    ].map((layer) => `|RECORD=Track|LAYER=${layer}|NET=0|${track}`),
  ].join("\n")
  const document = parseAltiumPcbDoc(source)
  const circuitJson = convertAltiumPcbDocToCircuitJson(document)
  const openings = circuitJson.filter(
    (element) => element.type === "pcb_soldermask_opening",
  )
  expect(openings).toHaveLength(2)
  expect(
    circuitJson.filter((element) => element.type === "pcb_trace"),
  ).toHaveLength(1)
  expect(
    circuitJson.filter((element) => element.type === "pcb_copper_pour"),
  ).toHaveLength(0)
  expect(
    circuitJson.filter((element) => element.type === "pcb_silkscreen_line"),
  ).toHaveLength(1)
  const connectivity = getFullConnectivityMapFromCircuitJson(circuitJson)
  for (const opening of openings) {
    expect(opening).not.toHaveProperty("source_net_id")
    expect(opening).not.toHaveProperty("source_trace_id")
    expect(
      connectivity.areIdsConnected(
        "source_net_altium_pcb_0",
        opening.pcb_soldermask_opening_id,
      ),
    ).toBe(false)
  }
  const maskOnly = convertAltiumPcbDocToCircuitJson(document, {
    includeTraces: false,
    includeCopperAreas: false,
    includeSilkscreen: false,
    includePads: false,
  })
  expect(
    maskOnly.filter((element) => element.type === "pcb_soldermask_opening"),
  ).toEqual(openings)
  expect(
    convertAltiumPcbDocToCircuitJson(document, { includeSolderMask: false }),
  ).toEqual(
    circuitJson.filter((element) => element.type !== "pcb_soldermask_opening"),
  )
  expect(convertAltiumDocumentToCircuitJson(document)).toEqual(circuitJson)
  expect(convertAltiumToCircuitJson(source, { sourceType: "pcb" })).toEqual(
    circuitJson,
  )
  expect(convertAltiumToCircuitJson(new TextEncoder().encode(source))).toEqual(
    circuitJson,
  )
  expect(
    convertAltiumToCircuitJson(source, {
      sourceType: "pcb",
      pcb: { includeSolderMask: false },
    }),
  ).toEqual(
    circuitJson.filter((element) => element.type !== "pcb_soldermask_opening"),
  )
})
