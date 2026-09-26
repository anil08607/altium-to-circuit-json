import {
  AltiumFillRecord,
  type AltiumPcbDocument,
  AltiumPolygonRecord,
  type AltiumRecord,
  AltiumRegionRecord,
} from "altiumts"
import type { PcbCopperPour } from "circuit-json"
import { PcbCopperLayerMap } from "../layers"
import { convertCopperFill } from "./convertCopperFill"
import { convertCopperPolygon } from "./convertCopperPolygon"
import { convertCopperRegion } from "./convertCopperRegion"

export function convertAltiumCopperAreas(
  document: AltiumPcbDocument,
  {
    layerMap = new PcbCopperLayerMap(document),
    getSourceNetId = () => undefined,
  }: {
    layerMap?: PcbCopperLayerMap
    getSourceNetId?: (record: AltiumRecord) => string | undefined
  } = {},
): PcbCopperPour[] {
  const polygonsWithRegions = new Set(
    document.records.flatMap((record) => {
      if (
        !(record instanceof AltiumRegionRecord) ||
        record.recordKind !== "Region"
      ) {
        return []
      }
      const polygon = document.getPolygonForRecord(record)
      return polygon ? [polygon] : []
    }),
  )
  const polygonIndexes = new Map(
    document.polygons.map((polygon, index) => [polygon, index]),
  )

  return document.records.flatMap((record, recordIndex) => {
    if (record instanceof AltiumRegionRecord) {
      return convertCopperRegion({
        layerMap,
        record,
        recordIndex,
        sourceNetId: getSourceNetId(record),
      })
    }
    if (record instanceof AltiumPolygonRecord) {
      const polygonIndex = polygonIndexes.get(record)
      if (
        record.shelved === true ||
        polygonIndex === undefined ||
        polygonsWithRegions.has(record)
      ) {
        return []
      }
      return convertCopperPolygon({
        layerMap,
        polygonIndex,
        record,
        sourceNetId: getSourceNetId(record),
      })
    }
    if (record instanceof AltiumFillRecord) {
      return convertCopperFill({
        layerMap,
        record,
        recordIndex,
        sourceNetId: getSourceNetId(record),
      })
    }
    return []
  })
}
