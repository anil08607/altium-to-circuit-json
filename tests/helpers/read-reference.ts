import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { REFERENCE_OUTPUT_DIRECTORY } from "../../scripts/references/reference-manifest"

export async function readReferenceBytes(
  filename: string,
): Promise<Uint8Array> {
  return new Uint8Array(
    await readFile(resolve(REFERENCE_OUTPUT_DIRECTORY, filename)),
  )
}

export async function readReferenceText(filename: string): Promise<string> {
  return await readFile(resolve(REFERENCE_OUTPUT_DIRECTORY, filename), "utf8")
}
