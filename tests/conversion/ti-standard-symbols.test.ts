import { expect, test } from "bun:test"
import { parseAltiumSchDoc } from "altiumts"
import type {
  AnyCircuitElement,
  SchematicComponent,
  SchematicPort,
  SchematicTrace,
} from "circuit-json"
import { convertAltiumSchDocToCircuitJson } from "../../lib"
import { TI_TMDS62LEVM_FIXTURE_NAME } from "../../scripts/references/reference-manifest"
import { findDetachedSymbolPortIds } from "../helpers/find-detached-symbol-ports"
import { readReferenceBytes } from "../helpers/read-reference"
import { renderImportedSchematicToSvg } from "../helpers/render-imported-schematic"

type SourceComponent = Extract<AnyCircuitElement, { type: "source_component" }>
type SourcePortElement = Extract<AnyCircuitElement, { type: "source_port" }>

async function convertTiSheet(
  sheetNumber: string,
): Promise<AnyCircuitElement[]> {
  const source = await readReferenceBytes(
    `${TI_TMDS62LEVM_FIXTURE_NAME}/${sheetNumber}.SchDoc`,
  )
  return convertAltiumSchDocToCircuitJson(parseAltiumSchDoc(source), {
    centerOnSchematicSheet: false,
    schematicUnitScale: 0.1,
    sheetName: `TI TMDS62LEVM Rev. B — sheet ${sheetNumber}`,
  })
}

function expectCleanSymbolRendering(circuitJson: AnyCircuitElement[]): void {
  expect(findDetachedSymbolPortIds(circuitJson)).toEqual([])
  const svg = renderImportedSchematicToSvg(circuitJson)
  expect(svg).not.toContain("Could not match ports")
  expect(svg).not.toContain("Symbol not found")
  expect(svg).not.toContain("NaN")
}

test("TI sheet 13 maps a three-pin MOSFET by functional port geometry", async () => {
  const circuitJson = await convertTiSheet("13")
  const source = circuitJson.find(
    (element): element is SourceComponent =>
      element.type === "source_component" && element.name === "Q2",
  )
  const component = circuitJson.find(
    (element): element is SchematicComponent =>
      element.type === "schematic_component" &&
      element.source_component_id === source?.source_component_id,
  )
  const ports = circuitJson.filter(
    (element): element is SchematicPort =>
      element.type === "schematic_port" &&
      element.schematic_component_id === component?.schematic_component_id,
  )
  const drainPort = ports.find((port) => port.display_pin_label === "D")
  const drainLead = circuitJson.find(
    (element): element is SchematicTrace =>
      element.type === "schematic_trace" &&
      element.schematic_trace_id === "schematic_trace_altium_port_lead_462",
  )

  expect(source).toMatchObject({
    channel_type: "n",
    ftype: "simple_mosfet",
    mosfet_mode: "enhancement",
  })
  expect(component).toMatchObject({
    size: { height: 1.1, width: 0.84 },
    symbol_name: "n_channel_e_mosfet_transistor_gate_left_drain_top",
  })
  expect(ports.find((port) => port.display_pin_label === "G")).toMatchObject({
    center: { x: 38.83, y: 33.4 },
    facing_direction: "left",
    pin_number: 1,
  })
  expect(drainPort).toMatchObject({
    center: { x: 39.55, y: 34.05 },
    facing_direction: "up",
    pin_number: 3,
  })
  expect(ports.find((port) => port.display_pin_label === "S")).toMatchObject({
    center: { x: 39.56, y: 32.95 },
    facing_direction: "down",
    pin_number: 2,
  })
  expect(drainLead).toMatchObject({
    edges: [
      {
        from: { x: 39.55, y: 34.05 },
        from_schematic_port_id: drainPort?.schematic_port_id,
        to: { x: 39.55, y: 40 },
      },
      {
        from: { x: 39.55, y: 40 },
        to: { x: 40, y: 40 },
      },
    ],
  })
  expectCleanSymbolRendering(circuitJson)
})

test("TI sheet 32 collapses equivalent power MOSFET pads schematically", async () => {
  const circuitJson = await convertTiSheet("32")
  const source = circuitJson.find(
    (element): element is SourceComponent =>
      element.type === "source_component" && element.name === "Q9",
  )
  const component = circuitJson.find(
    (element): element is SchematicComponent =>
      element.type === "schematic_component" &&
      element.source_component_id === source?.source_component_id,
  )
  const sourcePorts = circuitJson.filter(
    (element): element is SourcePortElement =>
      element.type === "source_port" &&
      element.source_component_id === source?.source_component_id,
  )
  const schematicPorts = circuitJson.filter(
    (element): element is SchematicPort =>
      element.type === "schematic_port" &&
      element.schematic_component_id === component?.schematic_component_id,
  )
  const sourceTraces = circuitJson.filter(
    (element) => element.type === "source_trace",
  )
  const schematicTraceIds = new Set(
    circuitJson.flatMap((element) =>
      element.type === "schematic_trace" ? [element.schematic_trace_id] : [],
    ),
  )

  expect(source).toMatchObject({
    channel_type: "n",
    ftype: "simple_mosfet",
    mosfet_mode: "enhancement",
  })
  expect(component).toMatchObject({
    symbol_name: "n_channel_e_mosfet_transistor_gate_left_drain_top",
  })
  expect(sourcePorts).toHaveLength(8)
  expect(
    schematicPorts.map((port) => ({
      center: port.center,
      name: port.display_pin_label,
      pin: port.pin_number,
    })),
  ).toEqual([
    { center: { x: 182.8, y: 28.05 }, name: "D3", pin: 5 },
    { center: { x: 182.08, y: 27.4 }, name: "G", pin: 3 },
    { center: { x: 182.81, y: 26.95 }, name: "S2", pin: 7 },
  ])
  expect(
    sourceTraces.some(
      (trace) =>
        trace.connected_source_port_ids?.filter((id) =>
          sourcePorts.some((port) => port.source_port_id === id),
        ).length === 5,
    ),
  ).toBe(true)
  expect(schematicTraceIds.has("schematic_trace_altium_port_lead_1585")).toBe(
    false,
  )
  expect(schematicTraceIds.has("schematic_trace_altium_port_lead_1599")).toBe(
    false,
  )
  expect(schematicTraceIds.has("schematic_trace_altium_port_lead_1589")).toBe(
    true,
  )
  expectCleanSymbolRendering(circuitJson)
})

test("TI sheet 21 maps two- and four-pin crystals with parsed frequencies", async () => {
  const circuitJson = await convertTiSheet("21")
  const source = circuitJson.find(
    (element): element is SourceComponent =>
      element.type === "source_component" && element.name === "Y2",
  )
  const component = circuitJson.find(
    (element): element is SchematicComponent =>
      element.type === "schematic_component" &&
      element.source_component_id === source?.source_component_id,
  )
  const ports = circuitJson.filter(
    (element): element is SchematicPort =>
      element.type === "schematic_port" &&
      element.schematic_component_id === component?.schematic_component_id,
  )
  const fourPinSource = circuitJson.find(
    (element): element is SourceComponent =>
      element.type === "source_component" && element.name === "Y3",
  )
  const fourPinComponent = circuitJson.find(
    (element): element is SchematicComponent =>
      element.type === "schematic_component" &&
      element.source_component_id === fourPinSource?.source_component_id,
  )
  const fourPinPorts = circuitJson.filter(
    (element): element is SchematicPort =>
      element.type === "schematic_port" &&
      element.schematic_component_id ===
        fourPinComponent?.schematic_component_id,
  )

  expect(source).toMatchObject({
    frequency: 32_768,
    ftype: "simple_crystal",
    pin_variant: "two_pin",
  })
  expect(component).toMatchObject({
    center: { x: 178, y: 116 },
    size: { height: 1.1, width: 0.5894553499999995 },
    symbol_name: "crystal_down",
  })
  expect(ports).toHaveLength(2)
  expect(ports.map((port) => port.center)).toEqual([
    { x: 178, y: 116.55 },
    { x: 178, y: 115.45 },
  ])
  expect(fourPinSource).toMatchObject({
    frequency: 25_000_000,
    ftype: "simple_crystal",
    pin_variant: "four_pin",
  })
  expect(fourPinComponent).toMatchObject({
    center: { x: 93, y: 119 },
    size: { height: 1.08, width: 1.42 },
    symbol_name: "crystal_4pin_down",
  })
  expect(
    Object.fromEntries(
      fourPinPorts.map((port) => [port.pin_number, port.center]),
    ),
  ).toEqual({
    1: { x: 92.99, y: 119.54 },
    2: { x: 93.71, y: 119 },
    3: { x: 92.99, y: 118.46 },
    4: { x: 92.29, y: 119.02 },
  })
  expectCleanSymbolRendering(circuitJson)
})

test("TI sheet 20 uses a canonical ferrite-bead symbol", async () => {
  const circuitJson = await convertTiSheet("20")
  const source = circuitJson.find(
    (element): element is SourceComponent =>
      element.type === "source_component" && element.name === "FL6",
  )
  const component = circuitJson.find(
    (element): element is SchematicComponent =>
      element.type === "schematic_component" &&
      element.source_component_id === source?.source_component_id,
  )
  const ports = circuitJson.filter(
    (element): element is SchematicPort =>
      element.type === "schematic_port" &&
      element.schematic_component_id === component?.schematic_component_id,
  )

  expect(source).toMatchObject({
    display_value: "26E",
    ftype: "simple_chip",
    manufacturer_part_number: "BLM18KG260TZ1D",
  })
  expect(component).toMatchObject({
    center: { x: 158.5, y: 126 },
    size: { height: 0.74, width: 0.88 },
    symbol_name: "ferrite_bead_right",
  })
  expect(ports.map((port) => port.center)).toEqual([
    { x: 158.06, y: 125.995 },
    { x: 158.94, y: 126.005 },
  ])
  expectCleanSymbolRendering(circuitJson)
})

test("TI sheet 14 preserves polarized-capacitor type and primary value", async () => {
  const circuitJson = await convertTiSheet("14")
  const source = circuitJson.find(
    (element): element is SourceComponent =>
      element.type === "source_component" && element.name === "C146",
  )
  const component = circuitJson.find(
    (element): element is SchematicComponent =>
      element.type === "schematic_component" &&
      element.source_component_id === source?.source_component_id,
  )

  expect(source).toMatchObject({
    capacitance: 0.0001,
    display_capacitance: "100uF_50V",
    ftype: "simple_capacitor",
  })
  expect(component).toMatchObject({
    center: { x: 38, y: 42 },
    size: { height: 0.6000000000000001, width: 1.1 },
    symbol_name: "capacitor_polarized_down",
  })
  expectCleanSymbolRendering(circuitJson)
})
