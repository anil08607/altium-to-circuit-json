import { expect, test } from "bun:test"
import {
  AltiumPadRecord,
  getAltiumPcbPadGeometry,
  parseAltiumPcbDoc,
} from "altiumts"
import { convertAltiumPcbDocToCircuitJson } from "../../lib"
import { milsToMillimeters } from "../../lib/pcb/geometry"
import {
  convertSlottedThroughHolePad,
  convertThroughHolePad,
  normalizeShape,
} from "../../lib/pcb/pads"

const platedSlotPcbDoc = parseAltiumPcbDoc(
  [
    "|RECORD=Board|SHEETWIDTH=400mil|SHEETHEIGHT=300mil",
    "|RECORD=Pad|NAME=1|LAYER=MULTILAYER|X=100mil|Y=100mil|XSIZE=80mil|YSIZE=220mil|SHAPE=ROUND|HOLESIZE=190mil|HOLETYPE=2|HOLESHAPE=SLOT|SLOTLENGTH=60mil|LAYER0ALTSHAPE=ROUNDRECT|LAYER0CORNERRADIUS=5|LAYER0HOLEXOFFSET=10mil|LAYER0HOLEYOFFSET=20mil|ROTATION=180|HOLEROTATION=90|PLATED=TRUE",
    "|RECORD=Pad|NAME=2|LAYER=MULTILAYER|X=300mil|Y=100mil|XSIZE=190mil|YSIZE=75mil|SHAPE=ROUND|HOLESIZE=50mil|HOLETYPE=2|HOLESHAPE=SLOT|SLOTLENGTH=165mil|LAYER0ALTSHAPE=ROUNDRECT|LAYER0CORNERRADIUS=100|PLATED=TRUE",
    "|RECORD=Pad|NAME=3|LAYER=BOTTOM|X=200mil|Y=200mil|XSIZE=120mil|YSIZE=60mil|BOTTOMXSIZE=80mil|BOTTOMYSIZE=40mil|SHAPE=RECT|BOTTOMSHAPE=ROUND|LAYER31ALTSHAPE=ROUNDRECT|LAYER31CORNERRADIUS=25|PLATED=TRUE",
  ].join("\n"),
)

test("preserves plated slot, hole offset, and pad geometry", () => {
  const circuitJson = convertAltiumPcbDocToCircuitJson(platedSlotPcbDoc)
  const platedHoles = circuitJson.filter(
    (element) => element.type === "pcb_plated_hole",
  )

  expect(platedHoles).toEqual([
    expect.objectContaining({
      shape: "rotated_pill_hole_with_rect_pad",
      hole_width: 4.826,
      hole_height: 4.826,
      hole_ccw_rotation: 270,
      rect_pad_width: 2.032,
      rect_pad_height: 5.588,
      rect_border_radius: 0.0508,
      rect_ccw_rotation: 180,
      hole_offset_x: expect.closeTo(-0.254),
      hole_offset_y: expect.closeTo(-0.508),
    }),
    expect.objectContaining({
      shape: "pill_hole_with_rect_pad",
      hole_width: 4.191,
      hole_height: 1.27,
      rect_pad_width: 4.826,
      rect_pad_height: 1.905,
      rect_border_radius: 0.9525,
    }),
  ])

  expect(circuitJson.find((element) => element.type === "pcb_smtpad")).toEqual(
    expect.objectContaining({
      layer: "bottom",
      shape: "rect",
      width: 2.032,
      height: 1.016,
      corner_radius: 0.127,
    }),
  )
})

test("calculates a slotted pad's hole offset only in the slot converter", () => {
  const record = platedSlotPcbDoc.records.find(
    (record): record is AltiumPadRecord => record instanceof AltiumPadRecord,
  )
  if (!record?.position) throw new Error("Expected a positioned pad")
  const geometry = getAltiumPcbPadGeometry({
    record,
    useRequestedLayerGeometry: true,
  })
  const options = {
    cornerRadius: milsToMillimeters(geometry.cornerRadiusMils),
    geometry,
    height: milsToMillimeters(geometry.heightMils),
    holeDiameter: milsToMillimeters(geometry.holeSizeMils),
    id: "slot_regression",
    record,
    shape: normalizeShape(geometry.shape),
    width: milsToMillimeters(geometry.widthMils),
    x: milsToMillimeters(record.position.x),
    y: milsToMillimeters(record.position.y),
  }
  const expected = convertSlottedThroughHolePad(options)
  let offsetReads = 0
  const actual = convertThroughHolePad({
    ...options,
    geometry: {
      ...geometry,
      get holeOffsetXMils() {
        offsetReads++
        return geometry.holeOffsetXMils
      },
    },
  })

  expect(actual).toEqual(expected)
  expect(offsetReads).toBe(1)
})
