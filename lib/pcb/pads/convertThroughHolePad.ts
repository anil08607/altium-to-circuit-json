import type { LayerRef, PcbPlatedHole } from "circuit-json"
import { createOctagonPoints, milsToMillimeters } from "../geometry"
import { MILS_TO_MILLIMETERS } from "../model"
import { convertSlottedThroughHolePad } from "./convertSlottedThroughHolePad"
import { getRotatedHoleOffset } from "./getRotatedHoleOffset"
import { isRectangularShape } from "./isRectangularShape"
import { isSlottedThroughHolePad } from "./isSlottedThroughHolePad"
import type { ThroughHolePadConversionOptions } from "./types"

export function convertThroughHolePad(
  options: ThroughHolePadConversionOptions,
): PcbPlatedHole {
  if (isSlottedThroughHolePad(options)) {
    return convertSlottedThroughHolePad(options)
  }

  const {
    cornerRadius,
    geometry,
    height,
    holeDiameter,
    id,
    shape,
    width,
    x,
    y,
  } = options
  const holeOffset = getRotatedHoleOffset(geometry)
  const layers: LayerRef[] = ["top", "bottom"]

  if (isRectangularShape(shape)) {
    return {
      type: "pcb_plated_hole",
      pcb_plated_hole_id: `pcb_plated_hole_${id}`,
      shape: "circular_hole_with_rect_pad",
      hole_shape: "circle",
      pad_shape: "rect",
      hole_diameter: Math.max(holeDiameter, MILS_TO_MILLIMETERS),
      rect_pad_width: width,
      rect_pad_height: height,
      rect_border_radius: cornerRadius,
      rect_ccw_rotation: geometry.ccwRotationDegrees,
      hole_offset_x: milsToMillimeters(holeOffset.x),
      hole_offset_y: milsToMillimeters(holeOffset.y),
      x,
      y,
      layers,
    }
  }

  if (shape.includes("OCTAGON")) {
    return {
      type: "pcb_plated_hole",
      pcb_plated_hole_id: `pcb_plated_hole_${id}`,
      shape: "hole_with_polygon_pad",
      hole_shape: "circle",
      hole_diameter: Math.max(holeDiameter, MILS_TO_MILLIMETERS),
      pad_outline: createOctagonPoints({
        x,
        y,
        width,
        height,
        ccwRotationDegrees: geometry.ccwRotationDegrees,
      }),
      hole_offset_x: milsToMillimeters(holeOffset.x),
      hole_offset_y: milsToMillimeters(holeOffset.y),
      x,
      y,
      layers,
    }
  }

  if (
    (shape === "ROUND" || shape === "CIRCLE" || shape === "OVAL") &&
    Math.abs(width - height) >= 0.0001
  ) {
    return {
      type: "pcb_plated_hole",
      pcb_plated_hole_id: `pcb_plated_hole_${id}`,
      shape: "pill",
      outer_width: width,
      outer_height: height,
      hole_width: Math.max(holeDiameter, MILS_TO_MILLIMETERS),
      hole_height: Math.max(holeDiameter, MILS_TO_MILLIMETERS),
      ccw_rotation: geometry.ccwRotationDegrees,
      x,
      y,
      layers,
    }
  }

  return {
    type: "pcb_plated_hole",
    pcb_plated_hole_id: `pcb_plated_hole_${id}`,
    shape: "circle",
    outer_diameter: Math.max(width, height),
    hole_diameter: Math.max(holeDiameter, MILS_TO_MILLIMETERS),
    x,
    y,
    layers,
  }
}
