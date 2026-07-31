import { createHash } from "node:crypto"
import { mkdir } from "node:fs/promises"
import { join } from "node:path"

const references = [
  {
    filename: "simplefocmini-2024-04-26.PcbDoc",
    sha256: "8328cebe97ba8623fb2b707490e3473c6f7dc13fb0502b596b0e40c7e1613d24",
    url: "https://raw.githubusercontent.com/simplefoc/SimpleFOCMini/8e10d4ba398624bd0ef970e82c03d7a6bcc2220d/Altium/simplefocmini_2024-04-26.pcbdoc",
  },
  {
    filename: "sample-board-design.PcbDoc",
    sha256: "745a27e3b876767c9bc4caf7706c19b6f97b3313efdb00bc2771f22db8410174",
    url: "https://raw.githubusercontent.com/monkslc/hyperpolyglot/a55a3b58eaed09b4314ef93d78e50a80cfec36f4/samples/Altium%20Designer/Sample%20Board%20Design.PcbDoc",
  },
  {
    filename: "simplefocmini-2024-04-26.SchDoc",
    sha256: "bc2039ef59eabe030fea68eedb87e3924c8e6711fb774e2d80b880cf468100ef",
    url: "https://raw.githubusercontent.com/simplefoc/SimpleFOCMini/8e10d4ba398624bd0ef970e82c03d7a6bcc2220d/Altium/simplefocmini_2024-04-26.schdoc",
  },
] as const
const outputDirectory = join(import.meta.dir, "../tests/fixtures/downloaded")

await mkdir(outputDirectory, { recursive: true })

for (const reference of references) {
  const response = await fetch(reference.url)
  if (!response.ok) {
    throw new Error(
      `Unable to download ${reference.filename}: ${response.status} ${response.statusText}`,
    )
  }
  const bytes = new Uint8Array(await response.arrayBuffer())
  const actualHash = createHash("sha256").update(bytes).digest("hex")
  if (actualHash !== reference.sha256) {
    throw new Error(
      `${reference.filename} SHA-256 mismatch: expected ${reference.sha256}, got ${actualHash}`,
    )
  }
  const outputPath = join(outputDirectory, reference.filename)
  await Bun.write(outputPath, bytes)
  console.log(`Downloaded ${reference.filename}`)
}
