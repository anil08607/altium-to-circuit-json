import type { AnyCircuitElement, LayerRef } from "circuit-json"

const LAYER_INDEPENDENT_PCB_TYPES = new Set<AnyCircuitElement["type"]>([
  "pcb_board",
  "pcb_cutout",
  "pcb_hole",
  "pcb_plated_hole",
  "pcb_via",
])

export function filterCircuitJsonToCopperLayer(
  circuitJson: AnyCircuitElement[],
  layer: LayerRef,
): AnyCircuitElement[] {
  return circuitJson.filter((element) => {
    if (LAYER_INDEPENDENT_PCB_TYPES.has(element.type)) return true
    if (element.type === "pcb_trace") {
      return element.route.some(
        (routePoint) =>
          routePoint.route_type === "wire" && routePoint.layer === layer,
      )
    }
    return element.type === "pcb_smtpad" && element.layer === layer
  })
}

export function getPcbBoardViewport(circuitJson: AnyCircuitElement[]): {
  maxX: number
  maxY: number
  minX: number
  minY: number
} {
  const board = circuitJson.find((element) => element.type === "pcb_board")
  if (!board) throw new Error("Circuit JSON does not contain a pcb_board")

  if (board.outline && board.outline.length >= 3) {
    return {
      minX: Math.min(...board.outline.map((point) => point.x)),
      minY: Math.min(...board.outline.map((point) => point.y)),
      maxX: Math.max(...board.outline.map((point) => point.x)),
      maxY: Math.max(...board.outline.map((point) => point.y)),
    }
  }

  if (board.width === undefined || board.height === undefined) {
    throw new Error("pcb_board does not contain outline or rectangular bounds")
  }

  return {
    minX: board.center.x - board.width / 2,
    minY: board.center.y - board.height / 2,
    maxX: board.center.x + board.width / 2,
    maxY: board.center.y + board.height / 2,
  }
}
