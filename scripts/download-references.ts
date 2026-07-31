import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { unzipSync } from "fflate"
import {
  DIRECT_REFERENCES,
  type DirectReferenceSpec,
  NESTED_ZIP_BUNDLES,
  type NestedZipBundleSpec,
  REFERENCE_OUTPUT_DIRECTORY,
} from "./references/reference-manifest"

async function downloadDirectReference(
  reference: DirectReferenceSpec,
): Promise<void> {
  if (await hasExpectedHash(reference.filename, reference.sha256)) {
    console.log(`Using cached ${reference.filename}`)
    return
  }

  const bytes = await fetchBytes(reference.url)
  verifySha256(reference.filename, bytes, reference.sha256)
  await writeReference(reference.filename, bytes)
  console.log(
    `Saved ${reference.filename} (${bytes.byteLength} bytes) from ${reference.source}`,
  )
}

async function downloadNestedZipBundle(
  reference: NestedZipBundleSpec,
): Promise<void> {
  const cachedResults = await Promise.all(
    reference.outputs.map((output) =>
      hasExpectedHash(output.filename, output.sha256),
    ),
  )
  if (cachedResults.every(Boolean)) {
    console.log(`Using cached ${reference.source}`)
    return
  }

  const archiveBytes = await fetchBytes(reference.url)
  verifySha256(
    `${reference.source} outer archive`,
    archiveBytes,
    reference.archiveSha256,
  )
  const nestedArchive = getExtractedEntry(
    unzipSync(archiveBytes, {
      filter: ({ name }) => name === reference.nestedArchivePath,
    }),
    reference.nestedArchivePath,
  )
  verifySha256(
    `${reference.source} nested archive`,
    nestedArchive,
    reference.nestedArchiveSha256,
  )

  const expectedPaths = new Set(
    reference.outputs.map((output) => output.nestedFilePath),
  )
  const entries = unzipSync(nestedArchive, {
    filter: ({ name }) => expectedPaths.has(name),
  })
  for (const output of reference.outputs) {
    const bytes = getExtractedEntry(entries, output.nestedFilePath)
    verifySha256(output.filename, bytes, output.sha256)
    await writeReference(output.filename, bytes)
    console.log(`Saved ${output.filename} (${bytes.byteLength} bytes)`)
  }
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`${url} (${response.status} ${response.statusText})`)
  }
  return new Uint8Array(await response.arrayBuffer())
}

async function hasExpectedHash(
  filename: string,
  expectedHash: string,
): Promise<boolean> {
  try {
    const bytes = new Uint8Array(
      await readFile(resolve(REFERENCE_OUTPUT_DIRECTORY, filename)),
    )
    return getSha256(bytes) === expectedHash
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return false
    }
    throw error
  }
}

async function writeReference(
  filename: string,
  bytes: Uint8Array,
): Promise<void> {
  const outputPath = resolve(REFERENCE_OUTPUT_DIRECTORY, filename)
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, bytes)
}

function getExtractedEntry(
  entries: Record<string, Uint8Array>,
  expectedPath: string,
): Uint8Array {
  const entry = entries[expectedPath]
  if (!entry) throw new Error(`ZIP archive does not contain ${expectedPath}`)
  return entry
}

function getSha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex")
}

function verifySha256(
  label: string,
  bytes: Uint8Array,
  expectedHash: string,
): void {
  const actualHash = getSha256(bytes)
  if (actualHash !== expectedHash) {
    throw new Error(
      `${label} SHA-256 mismatch: expected ${expectedHash}, got ${actualHash}`,
    )
  }
}

await mkdir(REFERENCE_OUTPUT_DIRECTORY, { recursive: true })
await Promise.all([
  ...DIRECT_REFERENCES.map(downloadDirectReference),
  ...NESTED_ZIP_BUNDLES.map(downloadNestedZipBundle),
])
