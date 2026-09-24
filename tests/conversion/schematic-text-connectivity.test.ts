import { expect, test } from "bun:test"
import { parseAltiumSchDoc } from "altiumts"
import { convertAltiumSchDocToCircuitJson } from "../../lib"

test("generic text stays graphical when it touches disconnected wires", () => {
  const document = parseAltiumSchDoc(
    [
      "|RECORD=31|CUSTOMX=120|CUSTOMY=120|SIZE1=10|FONTNAME1=Arial",
      "|RECORD=27|LOCATIONCOUNT=2|X1=10|Y1=10|X2=50|Y2=10",
      "|RECORD=4|TEXT=NOTE|LOCATION.X=50|LOCATION.Y=10|FONTID=1",
      "|RECORD=27|LOCATIONCOUNT=2|X1=10|Y1=100|X2=50|Y2=100",
      "|RECORD=4|TEXT=NOTE|LOCATION.X=50|LOCATION.Y=100|FONTID=1",
      "|RECORD=4|TEXT=ISOLATED|LOCATION.X=80|LOCATION.Y=80|FONTID=1",
    ].join("\n"),
  )
  const circuitJson = convertAltiumSchDocToCircuitJson(document)
  const traces = circuitJson.filter(
    (element) => element.type === "source_trace",
  )
  const text = circuitJson.filter(
    (element) => element.type === "schematic_text",
  )

  expect(traces).toHaveLength(2)
  expect(traces.map((trace) => trace.connected_source_net_ids)).toEqual([
    [],
    [],
  ])
  expect(
    circuitJson.filter((element) => element.type === "source_net"),
  ).toEqual([])
  expect(
    circuitJson.filter((element) => element.type === "schematic_net_label"),
  ).toEqual([])
  expect(text.map((element) => element.text)).toEqual([
    "NOTE",
    "NOTE",
    "ISOLATED",
  ])
  expect(text.every((element) => element.source_trace_id === undefined)).toBe(
    true,
  )
})

test("generic text cannot create a junction at an unconnected wire crossing", () => {
  const circuitJson = convertAltiumSchDocToCircuitJson(
    parseAltiumSchDoc(
      [
        "|RECORD=31",
        "|RECORD=27|LOCATIONCOUNT=2|X1=10|Y1=50|X2=90|Y2=50",
        "|RECORD=27|LOCATIONCOUNT=2|X1=50|Y1=10|X2=50|Y2=90",
        "|RECORD=4|TEXT=CROSSING|LOCATION.X=50|LOCATION.Y=50",
      ].join("\n"),
    ),
  )

  expect(
    circuitJson.filter((element) => element.type === "source_trace"),
  ).toHaveLength(2)
  expect(
    circuitJson.filter((element) => element.type === "source_net"),
  ).toEqual([])
})

test("generic text matching an electrical label does not connect another wire", () => {
  const circuitJson = convertAltiumSchDocToCircuitJson(
    parseAltiumSchDoc(
      [
        "|RECORD=31",
        "|RECORD=27|LOCATIONCOUNT=2|X1=10|Y1=10|X2=50|Y2=10",
        "|RECORD=25|TEXT=SIGNAL|LOCATION.X=50|LOCATION.Y=10",
        "|RECORD=27|LOCATIONCOUNT=2|X1=10|Y1=100|X2=50|Y2=100",
        "|RECORD=4|TEXT=SIGNAL|LOCATION.X=50|LOCATION.Y=100",
      ].join("\n"),
    ),
  )
  const traces = circuitJson.filter(
    (element) => element.type === "source_trace",
  )

  expect(traces).toHaveLength(2)
  expect(traces.map((trace) => trace.connected_source_net_ids)).toEqual([
    ["source_net_altium_signal"],
    [],
  ])
})

test.each([
  ["net labels", "|RECORD=25|TEXT=SIGNAL"],
  ["ports", "|RECORD=18|NAME=SIGNAL|WIDTH=20|HEIGHT=10"],
  ["power ports", "|RECORD=17|TEXT=SIGNAL|STYLE=2"],
])("matching %s still connect separate wires", (_kind, identifier) => {
  const circuitJson = convertAltiumSchDocToCircuitJson(
    parseAltiumSchDoc(
      [
        "|RECORD=31",
        "|RECORD=27|LOCATIONCOUNT=2|X1=10|Y1=10|X2=50|Y2=10",
        `${identifier}|LOCATION.X=50|LOCATION.Y=10`,
        "|RECORD=27|LOCATIONCOUNT=2|X1=10|Y1=100|X2=50|Y2=100",
        `${identifier}|LOCATION.X=50|LOCATION.Y=100`,
      ].join("\n"),
    ),
  )
  const traces = circuitJson.filter(
    (element) => element.type === "source_trace",
  )

  expect(traces).toHaveLength(1)
  expect(traces[0]?.connected_source_net_ids).toEqual([
    "source_net_altium_signal",
  ])
  expect(
    circuitJson.filter((element) => element.type === "source_net"),
  ).toHaveLength(1)
})
