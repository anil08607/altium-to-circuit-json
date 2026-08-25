import { expect, test } from "bun:test"
import { parseAltiumSchDoc } from "altiumts"
import type { AnyCircuitElement } from "circuit-json"
import { convertAltiumSchDocToCircuitJson } from "../../lib"

function convertSingleComponent(params: {
  designator: string
  libraryReference: string
  value: string
  comment: string
}): AnyCircuitElement[] {
  const { designator, libraryReference, value, comment } = params
  const source = [
    "|RECORD=31|CUSTOMX=100|CUSTOMY=100|SIZE1=10|FONTNAME1=Arial",
    `|RECORD=1|LibReference=${libraryReference}|Designator=${designator}|PartCount=1|DisplayModeCount=1|IndexInSheet=1|OwnerPartId=-1|Location.X=50|Location.Y=50|Orientation=0|CurrentPartId=1|AllPinCount=2`,
    "|RECORD=2|OwnerIndex=1|OwnerPartId=1|Location.X=40|Location.Y=50|Name=1|Designator=1|PinLength=10|Electrical=3|Orientation=2|Hidden=False",
    "|RECORD=2|OwnerIndex=1|OwnerPartId=1|Location.X=60|Location.Y=50|Name=2|Designator=2|PinLength=10|Electrical=3|Orientation=0|Hidden=False",
    `|RECORD=41|OwnerIndex=1|OwnerPartId=-1|Name=Value|Text=${value}`,
    `|RECORD=41|OwnerIndex=1|OwnerPartId=-1|Name=Comment|Text=${comment}`,
  ].join("\n")

  return convertAltiumSchDocToCircuitJson(parseAltiumSchDoc(source), {
    centerOnSchematicSheet: false,
    schematicUnitScale: 0.1,
  })
}

test("uses Altium Value parameter instead of manufacturer part number", () => {
  const capacitor = convertSingleComponent({
    designator: "C1",
    libraryReference: "Capacitor",
    value: "10uF",
    comment: "UMK325AB7106KMHT",
  }).find((element) => element.type === "source_component")
  const resistor = convertSingleComponent({
    designator: "R1",
    libraryReference: "Resistor",
    value: "1.0k",
    comment: "RC0603FR-071KL",
  }).find((element) => element.type === "source_component")

  expect(capacitor).toMatchObject({
    display_value: "10uF",
    display_capacitance: "10uF",
  })
  expect(resistor).toMatchObject({
    display_value: "1.0k",
    display_resistance: "1.0k",
  })
})
