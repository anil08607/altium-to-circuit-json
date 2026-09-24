import {
  AltiumSchPortRecord,
  type AltiumSchWireRecord,
  getSchematicRecordPoints,
} from "altiumts"
import { getLocation, pointKey, type SchematicPointKey } from "../geometry"
import { type SchematicSegmentKey, segmentKey } from "../identifiers"
import type { ConvertedPort, SemanticNet } from "../model"
import { isElectricalLabelRecord } from "../netLabels/isElectricalLabelRecord"
import { addIncidentSegment } from "./addIncidentSegment"
import { getPortConnectionGeometry } from "./getPortConnectionGeometry"
import { getWireSegments } from "./getWireSegments"
import { splitSegmentAtPoints } from "./splitSegmentAtPoints"
import type { PrunableSegment } from "./types"

export function getEquivalentPortPrunedSegmentKeys({
  convertedPorts,
  net,
  wires,
}: {
  convertedPorts: ConvertedPort[]
  net: SemanticNet
  wires: AltiumSchWireRecord[]
}): Set<SchematicSegmentKey> {
  const hiddenPortPoints = convertedPorts
    .filter((port) => !port.isSchematicVisible)
    .map((port) => port.point)
  if (hiddenPortPoints.length === 0) return new Set()

  const wireSegments = getWireSegments(wires)
  const protectedPointKeys = new Set(
    convertedPorts
      .filter((port) => port.isSchematicVisible)
      .map((port) => pointKey(port.point)),
  )
  for (const record of net.records) {
    if (!isElectricalLabelRecord(record)) continue
    const location =
      record instanceof AltiumSchPortRecord
        ? getPortConnectionGeometry(record, wireSegments)?.anchor
        : getLocation(record)
    if (location) protectedPointKeys.add(pointKey(location))
  }

  const segments = new Map<SchematicSegmentKey, PrunableSegment>()
  const segmentKeysByPoint = new Map<
    SchematicPointKey,
    Set<SchematicSegmentKey>
  >()

  for (const wire of wires) {
    const wirePoints = getSchematicRecordPoints(wire)
    for (let pointIndex = 1; pointIndex < wirePoints.length; pointIndex++) {
      const from = wirePoints[pointIndex - 1]
      const to = wirePoints[pointIndex]
      if (!from || !to) continue
      const segmentPoints = splitSegmentAtPoints({
        start: from,
        end: to,
        candidates: net.points,
      })
      for (
        let splitIndex = 1;
        splitIndex < segmentPoints.length;
        splitIndex++
      ) {
        const segmentFrom = segmentPoints[splitIndex - 1]
        const segmentTo = segmentPoints[splitIndex]
        if (!segmentFrom || !segmentTo) continue
        const key = segmentKey(segmentFrom, segmentTo)
        segments.set(key, {
          endKey: pointKey(segmentTo),
          key,
          startKey: pointKey(segmentFrom),
        })
        addIncidentSegment({ point: segmentFrom, key, segmentKeysByPoint })
        addIncidentSegment({ point: segmentTo, key, segmentKeysByPoint })
      }
    }
  }

  const removedSegmentKeys = new Set<SchematicSegmentKey>()
  const pendingPointKeys = hiddenPortPoints.map((point) => pointKey(point))
  while (pendingPointKeys.length > 0) {
    const currentPointKey = pendingPointKeys.shift()
    if (!currentPointKey || protectedPointKeys.has(currentPointKey)) continue
    const activeSegmentKeys = [
      ...(segmentKeysByPoint.get(currentPointKey) ?? []),
    ].filter((key) => !removedSegmentKeys.has(key))
    if (activeSegmentKeys.length !== 1) continue
    const onlySegmentKey = activeSegmentKeys[0]
    if (!onlySegmentKey) continue
    const segment = segments.get(onlySegmentKey)
    if (!segment) continue
    removedSegmentKeys.add(segment.key)
    pendingPointKeys.push(
      segment.startKey === currentPointKey ? segment.endKey : segment.startKey,
    )
  }
  return removedSegmentKeys
}
