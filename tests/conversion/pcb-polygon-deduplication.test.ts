import { expect, test } from "bun:test"
import { parseAltiumPcbDoc } from "altiumts"
import { convertAltiumPcbDocToCircuitJson } from "../../lib"

const outline =
  "|KIND0=0|VX0=0mil|VY0=0mil|KIND1=0|VX1=100mil|VY1=0mil|KIND2=0|VX2=100mil|VY2=100mil|KIND3=0|VX3=0mil|VY3=100mil|KIND4=0|VX4=0mil|VY4=0mil"

function convertPours(records: string[]) {
  const document = parseAltiumPcbDoc(["|RECORD=Board", ...records].join("\n"))
  return convertAltiumPcbDocToCircuitJson(document).filter(
    (element) => element.type === "pcb_copper_pour",
  )
}

test.each([0, 7])(
  "deduplicates a polygon with explicit ID=%s against its region",
  (polygonId) => {
    const pours = convertPours([
      `|RECORD=Polygon|ID=${polygonId}|LAYER=TOP${outline}`,
      `|RECORD=Region|POLYGON=${polygonId}|LAYER=TOP|REGIONKIND=COPPER${outline}`,
    ])
    expect(pours).toHaveLength(1)
    expect(pours[0]?.pcb_copper_pour_id).toBe("pcb_copper_pour_altium_region_2")
    expect(pours[0]?.shape).toBe("polygon")
    expect(pours[0]?.layer).toBe("top")
  },
)

test("suppresses the resolved polygon, not a different polygon at that array position", () => {
  const pours = convertPours([
    `|RECORD=Polygon|ID=7|LAYER=BOTTOM${outline}`,
    `|RECORD=Polygon|ID=0|LAYER=TOP${outline}`,
    `|RECORD=Region|POLYGON=0|LAYER=TOP|REGIONKIND=COPPER${outline}`,
  ])
  expect(
    pours.map(({ pcb_copper_pour_id, layer }) => ({
      pcb_copper_pour_id,
      layer,
    })),
  ).toEqual([
    { pcb_copper_pour_id: "pcb_copper_pour_altium_polygon_0", layer: "bottom" },
    { pcb_copper_pour_id: "pcb_copper_pour_altium_region_3", layer: "top" },
  ])
})

test("keeps positional polygon references when there are no explicit IDs", () => {
  const pours = convertPours([
    `|RECORD=Polygon|LAYER=BOTTOM${outline}`,
    `|RECORD=Polygon|LAYER=TOP${outline}`,
    `|RECORD=Region|POLYGON=1|LAYER=TOP|REGIONKIND=COPPER${outline}`,
  ])
  expect(pours.map((pour) => pour.pcb_copper_pour_id)).toEqual([
    "pcb_copper_pour_altium_polygon_0",
    "pcb_copper_pour_altium_region_3",
  ])
})

test.each([
  "",
  "|POLYGON=0",
  "|POLYGON=42",
  "|POLYGON=65535",
  "|POLYGON=-1",
  "|POLYGON=0.5",
])("does not suppress a polygon for unresolved reference %s", (reference) => {
  const pours = convertPours([
    `|RECORD=Polygon|ID=7|LAYER=TOP${outline}`,
    `|RECORD=Region${reference}|LAYER=TOP|REGIONKIND=COPPER${outline}`,
  ])
  expect(pours.map((pour) => pour.pcb_copper_pour_id)).toEqual([
    "pcb_copper_pour_altium_polygon_0",
    "pcb_copper_pour_altium_region_2",
  ])
})

test("does not infer positional references in a document with explicit polygon IDs", () => {
  const pours = convertPours([
    `|RECORD=Polygon|ID=7|LAYER=TOP${outline}`,
    `|RECORD=Polygon|LAYER=BOTTOM${outline}`,
    `|RECORD=Region|POLYGON=1|LAYER=BOTTOM|REGIONKIND=COPPER${outline}`,
  ])
  expect(pours.map((pour) => pour.pcb_copper_pour_id)).toEqual([
    "pcb_copper_pour_altium_polygon_0",
    "pcb_copper_pour_altium_polygon_1",
    "pcb_copper_pour_altium_region_3",
  ])
})

test("preserves all poured regions and their holes for a resolved polygon", () => {
  const pours = convertPours([
    `|RECORD=Polygon|ID=7|LAYER=TOP${outline}`,
    `|RECORD=Region|POLYGON=7|LAYER=TOP|REGIONKIND=COPPER${outline}|HOLECOUNT=1|HOLE0COUNT=4|HOLE0VX0=25mil|HOLE0VY0=25mil|HOLE0VX1=75mil|HOLE0VY1=25mil|HOLE0VX2=75mil|HOLE0VY2=75mil|HOLE0VX3=25mil|HOLE0VY3=75mil`,
    "|RECORD=Region|POLYGON=7|LAYER=TOP|REGIONKIND=COPPER|VX0=200mil|VY0=200mil|VX1=300mil|VY1=200mil|VX2=300mil|VY2=300mil|VX3=200mil|VY3=200mil",
  ])
  expect(pours.map((pour) => pour.pcb_copper_pour_id)).toEqual([
    "pcb_copper_pour_altium_region_2",
    "pcb_copper_pour_altium_region_3",
  ])
  expect(pours[0]?.shape).toBe("brep")
  if (pours[0]?.shape === "brep") {
    expect(pours[0].brep_shape.inner_rings).toHaveLength(1)
  }
})
