import { expect, test } from "bun:test"
import { parseAltiumSchDoc } from "altiumts"
import type {
  AnyCircuitElement,
  SchematicComponent,
  SchematicPort,
  SchematicText,
  SchematicTrace,
} from "circuit-json"
import { any_circuit_element } from "circuit-json"
import { convertAltiumSchDocToCircuitJson } from "../../lib"
import { TI_TMDS62LEVM_FIXTURE_NAME } from "../../scripts/references/reference-manifest"
import { readReferenceBytes } from "../helpers/read-reference"
import { renderImportedSchematicToSvg } from "../helpers/render-imported-schematic"

type SourceComponent = Extract<AnyCircuitElement, { type: "source_component" }>

test("TI sheet 17 converts components, ports, nets, and text idiomatically", async () => {
  const source = await readReferenceBytes(
    `${TI_TMDS62LEVM_FIXTURE_NAME}/17.SchDoc`,
  )
  const circuitJson = convertAltiumSchDocToCircuitJson(
    parseAltiumSchDoc(source),
    { sheetName: "TI TMDS62LEVM Rev. B — sheet 17" },
  )
  const dNoteLines = circuitJson.filter(
    (element): element is SchematicText =>
      element.type === "schematic_text" &&
      element.schematic_text_id.startsWith(
        "schematic_text_frame_line_altium_1142_",
      ),
  )

  expect(dNoteLines.map((element) => element.text)).toEqual([
    "D-Note:-",
    "PORz inputs have slew rate requirements specified. When",
    "PMIC nRSTOUT is connected to PORz. Adjust the pull-up to",
    "minimize the rise time (100-200 ns) when using an open drain",
    "output. PORz is fail-safe and 3.3 V tolerant. The PORz input",
    "can to 1.8 V or 3.3 V.",
  ])
  expect(
    circuitJson.find(
      (element) =>
        element.type === "schematic_rect" &&
        element.schematic_rect_id === "schematic_text_frame_altium_1142",
    ),
  ).toMatchObject({
    color: "transparent",
    fill_color: "#ffffff",
    is_filled: true,
    stroke_width: 0,
  })
  const pmicSource = circuitJson.find(
    (element): element is SourceComponent =>
      element.type === "source_component" && element.display_name === "U50",
  )
  expect(pmicSource).toMatchObject({
    ftype: "simple_chip",
    manufacturer_part_number: "PTPS6521401VAFR",
    name: "U50",
  })
  const pmicComponent = circuitJson.find(
    (element): element is SchematicComponent =>
      element.type === "schematic_component" &&
      element.source_component_id === pmicSource?.source_component_id,
  )
  expect(pmicComponent).toMatchObject({
    center: { x: 87.5, y: 77 },
    is_box_with_pins: true,
    size: { height: 20, width: 19 },
    symbol_display_value: "PTPS6521401VAFR",
  })
  expect(
    circuitJson.filter(
      (element) =>
        element.type === "schematic_port" &&
        element.schematic_component_id ===
          pmicComponent?.schematic_component_id,
    ),
  ).toHaveLength(24)

  const sclPort = circuitJson.find(
    (element): element is SchematicPort =>
      element.type === "schematic_port" &&
      element.schematic_port_id === "schematic_port_altium_798",
  )
  expect(sclPort).toMatchObject({
    center: { x: 75, y: 77 },
    display_pin_label: "SCL",
    facing_direction: "left",
    is_connected: true,
    pin_number: 14,
    side_of_component: "left",
    source_port_id: "source_port_altium_798",
  })

  expect(
    circuitJson.find(
      (element) =>
        element.type === "source_trace" &&
        element.connected_source_port_ids.includes("source_port_altium_798"),
    ),
  ).toMatchObject({
    connected_source_net_ids: ["source_net_altium_pmic2_i2c_scl"],
  })

  const inductorSource = circuitJson.find(
    (element): element is SourceComponent =>
      element.type === "source_component" && element.display_name === "L8",
  )
  expect(inductorSource).toMatchObject({
    display_inductance: "470nH",
    ftype: "simple_inductor",
  })
  expect(
    inductorSource?.ftype === "simple_inductor"
      ? inductorSource.inductance
      : undefined,
  ).toBeCloseTo(4.7e-7, 12)
  expect(
    circuitJson.find(
      (element) =>
        element.type === "schematic_component" &&
        element.source_component_id === "source_component_altium_66",
    ),
  ).toMatchObject({
    is_box_with_pins: true,
    symbol_name: "inductor_right",
  })
  expect(
    circuitJson.find(
      (element) =>
        element.type === "schematic_component" &&
        element.source_component_id === "source_component_altium_113",
    ),
  ).toMatchObject({ symbol_name: "capacitor_down" })
  expect(
    circuitJson.find(
      (element) =>
        element.type === "schematic_component" &&
        element.source_component_id === "source_component_altium_388",
    ),
  ).toMatchObject({ symbol_name: "boxresistor_right" })

  const testpointSource = circuitJson.find(
    (element): element is SourceComponent =>
      element.type === "source_component" && element.display_name === "TP98",
  )
  const testpointComponent = circuitJson.find(
    (element): element is SchematicComponent =>
      element.type === "schematic_component" &&
      element.source_component_id === testpointSource?.source_component_id,
  )
  const testpointPort = circuitJson.find(
    (element): element is SchematicPort =>
      element.type === "schematic_port" &&
      element.schematic_component_id ===
        testpointComponent?.schematic_component_id,
  )
  const testpointLead = circuitJson.find(
    (element): element is SchematicTrace =>
      element.type === "schematic_trace" &&
      element.schematic_trace_id === "schematic_trace_altium_port_lead_319",
  )
  expect(testpointComponent).toMatchObject({
    center: { x: 23.5, y: 111 },
    size: { height: 0.2, width: 0.325 },
    symbol_name: "testpoint_left",
  })
  expect(testpointPort).toMatchObject({
    center: { x: 23.7, y: 111 },
    facing_direction: "right",
    is_connected: true,
    side_of_component: "right",
  })
  expect(testpointLead).toMatchObject({
    edges: [
      {
        from: { x: 23.7, y: 111 },
        from_schematic_port_id: testpointPort?.schematic_port_id,
        to: { x: 25, y: 111 },
      },
    ],
    source_trace_id: "source_trace_altium_15",
  })

  expect(
    circuitJson.find(
      (element) =>
        element.type === "schematic_net_label" &&
        element.schematic_net_label_id === "schematic_net_label_altium_1069",
    ),
  ).toMatchObject({
    anchor_position: { x: 87, y: 61 },
    source_net_id: "source_net_altium_dgnd",
    symbol_name: "ground_down",
    text: "DGND",
  })
  expect(
    circuitJson.some(
      (element) =>
        element.type === "schematic_path" &&
        (element.schematic_path_id.startsWith("schematic_port_altium_") ||
          element.schematic_path_id.startsWith("schematic_power_port_altium_")),
    ),
  ).toBe(false)
  expect(
    circuitJson.some(
      (element) =>
        element.type === "schematic_trace" &&
        element.edges.some(
          (edge) =>
            edge.from_schematic_port_id === sclPort?.schematic_port_id ||
            edge.to_schematic_port_id === sclPort?.schematic_port_id,
        ),
    ),
  ).toBe(true)
  expect(
    circuitJson.every(
      (element) => any_circuit_element.safeParse(element).success,
    ),
  ).toBe(true)

  const renderedSvg = renderImportedSchematicToSvg(circuitJson)
  expect(renderedSvg).not.toContain("Could not match ports")
  expect(renderedSvg).not.toContain("Symbol not found")
  expect(renderedSvg).not.toContain("NaN")
})
