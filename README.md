# altium-to-circuit-json

Convert Altium schematic and PCB documents into [Circuit JSON](https://github.com/tscircuit/circuit-json).

The converter is built on [altiumts](https://github.com/tscircuit/altiumts). Its visual tests render the original document with `altiumts` on the left and the converted Circuit JSON with `circuit-to-svg` on the right, then combine the panels with `stack-svgs` and verify them with `bun-match-svg`.

## Install

```sh
bun add altium-to-circuit-json
```

## Usage

Automatic format detection accepts text, `Uint8Array`, or `ArrayBuffer` input:

```ts
import { readFile } from "node:fs/promises"
import { convertAltiumToCircuitJson } from "altium-to-circuit-json"

const bytes = await readFile("motor-controller.PcbDoc")
const circuitJson = convertAltiumToCircuitJson(bytes)
```

Parsed `altiumts` documents can be converted directly:

```ts
import { parseAltiumSchDoc } from "altiumts"
import { convertAltiumSchDocToCircuitJson } from "altium-to-circuit-json"

const document = parseAltiumSchDoc(schematicBytes)
const circuitJson = convertAltiumSchDocToCircuitJson(document)
```

The public conversion functions are:

- `convertAltiumToCircuitJson(source, options)` for automatic parsing and conversion.
- `convertAltiumDocumentToCircuitJson(document, options)` for an already parsed document.
- `convertAltiumPcbDocToCircuitJson(document, options)` for PCB documents.
- `convertAltiumSchDocToCircuitJson(document, options)` for schematic documents.

## Current coverage

PCB conversion currently emits:

- polygon board outlines and board cutouts;
- PCB component placement bounds;
- top, bottom, and inner-layer copper tracks;
- standalone top and bottom solder-mask tracks as `pcb_soldermask_opening` elements;
- vias;
- circular, rectangular, rounded, octagonal, rotated, pill, slotted, plated, and non-plated pads/holes;
- top and bottom silkscreen lines, arcs, fills, and text; and
- Altium mil coordinates converted to millimeters.

Schematic conversion currently emits:

- a Circuit JSON `schematic_sheet`, with imported geometry page-fitted and
  centered inside its standard A4 drawing area;
- typed source components, source ports, source nets, and source traces;
- standard Circuit JSON resistor, capacitor, inductor, diode, LED, test-point,
  power, and ground symbols;
- box-with-pins schematic components with named and numbered schematic ports
  for chips, connectors, and other multi-pin parts;
- wires as schematic traces, including mid-segment labels, pin terminals,
  T-junctions, and explicit junctions;
- polylines, polygons, rectangles, circles, ellipses, and arcs;
- no-ERC markers, hierarchical ports, and power ports;
- labels, net labels, designators, parameters, and text frames; and
- active multipart/display-mode filtering, with multiple placed symbol parts
  sharing one physical source component.

By default, schematic coordinates are scaled from the Altium page dimensions
and centered on the emitted `schematic_sheet`. Set `schematicUnitScale` to use
an explicit coordinate scale, or `centerOnSchematicSheet: false` to preserve an
Altium-style origin. The old plain rectangular page outline remains available
as an opt-in compatibility overlay with `includeSheetBorder: true`.

The package is intentionally an incremental converter. Complete component
classification, copper pours/regions, mechanical/dimension primitives, models,
and project-level hierarchy remain follow-up areas.

Tracks on Altium `TOPSOLDER` and `BOTTOMSOLDER` remove solder mask. They are
imported by default as native mask openings, without adding copper or net
connectivity. Coordinates and widths are converted from mils to millimeters;
round end caps are approximated with at most 0.001 mm deviation. A zero-length
track becomes a circular opening. To omit these elements, pass
`{ pcb: { includeSolderMask: false } }` to `convertAltiumToCircuitJson`, or
`{ includeSolderMask: false }` to the PCB converter. This option is independent
of `includeTraces` and `includeSilkscreen`.

This branch uses commit-pinned previews of the native solder-mask schema and
SVG renderer. The standalone schema is defined in [circuit-json#809](https://github.com/tscircuit/circuit-json/pull/809).
These dependencies must be released before publishing this converter to npm.
Downstream viewers need support for `pcb_soldermask_opening` to display these
elements. SVG comparisons use the pinned renderer with `showSolderMask: true`
to verify both board sides.

## Visual tests

Download the checksum-pinned upstream reference files and run the tests:

```sh
bun run test
```

Update the SVG snapshots after an intentional visual change:

```sh
bun run test:update-svg
```

Every imported reference used by the test suite has a side-by-side SVG snapshot. The committed fixtures are generated from pinned upstream URLs and are not stored in this repository.

The real-world PCB corpus covers NodeMCU ESP-12, EBAZ4205, HERON Payload SSM,
SimpleFOC Mini, and SimpleFOC Shield V3. The schematic corpus covers NodeMCU,
HERON PAY-SSM and Systems PCB, SimpleFOC Mini, and SimpleFOC Shield V3.

The TI power-reference PCB corpus covers PMP23595, the PMP23653 main and planar
transformer boards, and the PMP22650 package's PMP22650, PMP22712, and PMP22773
boards. Each is downloaded directly from its checksum-pinned TI CAD/CAE archive
and has an Altium-to-Circuit-JSON side-by-side SVG repro.

The TI SPRCAL9 / TMDS62LEVM Rev. B regression corpus includes all 57
schematic sheets and a top-copper PCB comparison. Its large downloaded source
files are checksum-verified and cached in CI. To also write the complete
converted Circuit JSON artifacts locally, run:

```sh
bun run convert:ti-reference
```

This creates `artifacts/ti-tmds62levm-rev-b/pcb.circuit.json`, one Circuit JSON
file per schematic sheet, and a conversion manifest. The artifact directory is
gitignored; the compact SVG regression snapshots remain committed.

## Development

```sh
bun install
bun run typecheck
bun run format:check
bun run build
```
