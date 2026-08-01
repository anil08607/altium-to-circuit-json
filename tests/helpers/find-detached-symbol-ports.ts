import type { AnyCircuitElement } from "circuit-json"

/**
 * A connected standard-symbol port must be referenced by a schematic trace
 * edge. This catches symbols that render correctly in isolation but leave the
 * imported net visually detached from their native terminal geometry.
 */
export function findDetachedSymbolPortIds(
  circuitJson: AnyCircuitElement[],
): string[] {
  const symbolComponentIds = new Set(
    circuitJson.flatMap((element) =>
      element.type === "schematic_component" && element.symbol_name
        ? [element.schematic_component_id]
        : [],
    ),
  )
  const tracedPortIds = new Set(
    circuitJson.flatMap((element) =>
      element.type === "schematic_trace"
        ? element.edges.flatMap((edge) =>
            [edge.from_schematic_port_id, edge.to_schematic_port_id].filter(
              (portId): portId is string => Boolean(portId),
            ),
          )
        : [],
    ),
  )

  return circuitJson.flatMap((element) =>
    element.type === "schematic_port" &&
    element.is_connected &&
    element.schematic_component_id !== undefined &&
    symbolComponentIds.has(element.schematic_component_id) &&
    !tracedPortIds.has(element.schematic_port_id)
      ? [element.schematic_port_id]
      : [],
  )
}
