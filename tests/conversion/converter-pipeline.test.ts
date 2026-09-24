import { expect, test } from "bun:test"
import { parseAltiumPcbDoc, parseAltiumSchDoc } from "altiumts"

import {
  AltiumToCircuitJsonConverter,
  convertAltiumPcbDocToCircuitJson,
  convertAltiumSchDocToCircuitJson,
} from "../../lib"

test.each(["converter", "manual stage"])(
  "PCB conversion after %s execution does not duplicate nets",
  (execution) => {
    const document = parseAltiumPcbDoc(
      [
        "|RECORD=Board|VERSION=5.0|KIND0=0|VX0=0mil|VY0=0mil|KIND1=0|VX1=500mil|VY1=0mil|KIND2=0|VX2=500mil|VY2=500mil|KIND3=0|VX3=0mil|VY3=500mil|KIND4=0|VX4=0mil|VY4=0mil",
        "|RECORD=Net|NAME=POWER",
        "|RECORD=Track|LAYER=TOP|NET=0|X1=50mil|Y1=100mil|X2=250mil|Y2=100mil|WIDTH=10mil",
      ].join("\n"),
    )
    const converter = new AltiumToCircuitJsonConverter(document)

    expect(converter.currentStage?.constructor.name).toBe("AddPcbNetsStage")
    expect(() => converter.getOutput()).toThrow(
      "Converter must finish before its output is read",
    )
    const netStage = converter.currentStage
    if (!netStage) throw new Error("Expected a PCB net stage")
    if (execution === "manual stage") netStage.runUntilFinished()
    converter.step()
    expect(converter.currentStage?.constructor.name).toBe(
      "ConvertPcbBoardStage",
    )
    converter.runUntilFinished()

    expect(converter.finished).toBe(true)
    expect(
      converter.getOutput().filter((element) => element.type === "source_net"),
    ).toHaveLength(1)
    expect(netStage.iteration).toBe(1)
    expect(converter.getOutput()).toEqual(
      convertAltiumPcbDocToCircuitJson(document),
    )
  },
)

test.each(["converter", "manual stage"])(
  "schematic conversion after %s execution does not duplicate sheets",
  (execution) => {
    const document = parseAltiumSchDoc(
      [
        "|RECORD=31|CUSTOMX=100|CUSTOMY=100|SIZE1=10|FONTNAME1=Arial",
        "|RECORD=27|LOCATIONCOUNT=2|X1=10|Y1=50|X2=90|Y2=50",
        "|RECORD=25|LOCATION.X=50|LOCATION.Y=50|TEXT=SIGNAL|FONTID=1|COLOR=128",
      ].join("\n"),
    )
    const options = {
      schematic: {
        centerOnSchematicSheet: false,
        schematicUnitScale: 0.1,
      },
    }
    const converter = new AltiumToCircuitJsonConverter(document, options)

    expect(converter.pipeline.map((stage) => stage.constructor.name)).toEqual([
      "AddSchematicSheetStage",
      "ConvertSchematicSemanticsStage",
      "ConvertRemainingSchematicRecordsStage",
      "FinalizeSchematicConversionStage",
    ])
    const sheetStage = converter.currentStage
    if (!sheetStage) throw new Error("Expected a schematic sheet stage")
    if (execution === "manual stage") sheetStage.runUntilFinished()
    converter.runUntilFinished()

    expect(
      converter
        .getOutput()
        .filter((element) => element.type === "schematic_sheet"),
    ).toHaveLength(1)
    expect(sheetStage.iteration).toBe(1)
    expect(converter.getOutput()).toEqual(
      convertAltiumSchDocToCircuitJson(document, options.schematic),
    )
  },
)

test("resuming after manual finalization does not center the schematic twice", () => {
  const document = parseAltiumSchDoc(
    [
      "|RECORD=31|CUSTOMX=100|CUSTOMY=100|SIZE1=10|FONTNAME1=Arial",
      "|RECORD=27|LOCATIONCOUNT=2|X1=10|Y1=50|X2=90|Y2=50",
    ].join("\n"),
  )
  const options = {
    schematic: { includeSheetBorder: true, schematicUnitScale: 0.1 },
  }
  const converter = new AltiumToCircuitJsonConverter(document, options)
  converter.step()
  converter.step()
  converter.step()

  const finalStage = converter.currentStage
  if (!finalStage) throw new Error("Expected a schematic finalization stage")
  expect(finalStage.constructor.name).toBe("FinalizeSchematicConversionStage")
  finalStage.runUntilFinished()
  expect(converter.finished).toBe(false)
  const centeredElements = structuredClone(converter.context.elements)
  expect(
    centeredElements.find((element) => element.type === "schematic_rect"),
  ).toMatchObject({ center: { x: 0, y: 0 } })

  converter.runUntilFinished()

  expect(converter.finished).toBe(true)
  expect(converter.getOutput()).toEqual(centeredElements)
  expect(finalStage.iteration).toBe(1)
  expect(converter.getOutput()).toEqual(
    convertAltiumSchDocToCircuitJson(document, options.schematic),
  )
})
