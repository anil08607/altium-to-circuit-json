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
- vias;
- circular, rectangular, rounded, octagonal, rotated, pill, slotted, plated, and non-plated pads/holes;
- top and bottom silkscreen lines, arcs, fills, and text; and
- Altium mil coordinates converted to millimeters.

Schematic conversion currently emits:

- sheet identity and border geometry;
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

The package is intentionally an incremental converter. Complete component
classification, copper pours/regions, mechanical/dimension primitives, models,
and project-level hierarchy remain follow-up areas.

## Visual tests

Download the checksum-pinned open-source reference files and run the tests:

```sh
bun run test
```

Update the SVG snapshots after an intentional visual change:

```sh
bun run test:update-svg
```

Every imported reference used by the test suite has a side-by-side SVG snapshot. The committed fixtures are generated from pinned upstream URLs and are not stored in this repository.

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
