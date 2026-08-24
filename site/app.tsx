import { convertAltiumToCircuitJson } from "@project-lib"
import type { AnyCircuitElement } from "circuit-json"
import { useEffect, useRef, useState } from "react"
import type { ChangeEvent, DragEvent } from "react"

const runframeUrl =
  "https://unpkg.com/@tscircuit/runframe/dist/standalone-preview.min.js"
const acceptedFileTypes = ".PcbDoc,.SchDoc"
type InputKind = "pcb" | "schematic"

export function App() {
  const input = useRef<HTMLInputElement>(null)
  const [json, setJson] = useState<AnyCircuitElement[] | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [frame, setFrame] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [converting, setConverting] = useState(false)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    if (!json) {
      setFrame(null)
      return
    }
    const kind = getInputKind(fileName)
    if (!kind) {
      setFrame(null)
      return
    }
    const html = createRunframeHtml(json, kind, baseName(fileName))
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }))
    setFrame(url)
    setLoading(true)
    return () => URL.revokeObjectURL(url)
  }, [json, fileName])

  const convert = async (file: File) => {
    setFileName(file.name)
    setError(null)
    setDragging(false)
    setConverting(true)
    const kind = getInputKind(file.name)
    if (!kind) {
      setJson(null)
      setError("Drop an Altium .PcbDoc or .SchDoc file.")
      setConverting(false)
      return
    }
    try {
      setJson(
        convertAltiumToCircuitJson(await file.arrayBuffer(), {
          sourceType: kind,
        }),
      )
    } catch (e) {
      setJson(null)
      setError(e instanceof Error ? e.message : "Conversion failed.")
    } finally {
      setConverting(false)
    }
  }

  const onDrop = (e: DragEvent<HTMLElement>) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) void convert(file)
  }

  const onSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) void convert(file)
    e.target.value = ""
  }

  return (
    <main className="app-shell">
      <section className="control-panel">
        <span className="eyebrow">Altium to Circuit JSON</span>
        <h1>Convert Altium files in your browser</h1>
        <p className="lede">
          Drop an Altium PCB or schematic document to convert it with this
          repository and inspect the result in the embedded tscircuit viewer.
        </p>
        <p className="privacy-note">Your files stay in this browser.</p>
        <div
          className={`dropzone${dragging ? " dragging" : ""}`}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <input
            ref={input}
            className="file-input"
            type="file"
            accept={acceptedFileTypes}
            aria-label="Choose an Altium PCB or schematic file"
            onChange={onSelect}
          />
          <div>
            <span className="badge">Drag and drop</span>
            <strong>Altium PCB or schematic document</strong>
            <p>
              or browse for a local <code>.PcbDoc</code> or <code>.SchDoc</code>
            </p>
          </div>
          <button
            className="primary"
            type="button"
            disabled={converting}
            onClick={() => input.current?.click()}
          >
            {converting ? "Converting…" : "Choose file"}
          </button>
        </div>
        <div className="meta">
          <div>
            <small>Source</small>
            <strong title={fileName ?? undefined}>
              {fileName ?? "No file loaded"}
            </strong>
          </div>
          <div>
            <small>Elements</small>
            <strong>{json?.length ?? 0}</strong>
          </div>
        </div>
        {error && (
          <div className="notice error" role="alert">
            <strong>Conversion error</strong>
            <p>{error}</p>
          </div>
        )}
        {json && (
          <div className="notice">
            <button
              className="secondary"
              type="button"
              disabled={converting}
              onClick={() =>
                download(json, `${baseName(fileName)}.circuit.json`)
              }
            >
              Download Circuit JSON
            </button>
          </div>
        )}
      </section>
      <section className="viewer-panel">
        {frame ? (
          <div className="frame-shell">
            {loading && (
              <div className="loading" role="status">
                Rendering preview…
              </div>
            )}
            <iframe
              title="Circuit JSON preview"
              className="frame"
              src={frame}
              sandbox="allow-downloads allow-same-origin allow-scripts"
              onLoad={() => setLoading(false)}
            />
          </div>
        ) : (
          <div className="empty">
            <span className="badge">Preview idle</span>
            <h2>Your converted Circuit JSON will appear here.</h2>
            <p>
              Load an Altium PCB or schematic file to open the preview tabs.
            </p>
          </div>
        )}
      </section>
    </main>
  )
}

function createRunframeHtml(
  circuitJson: AnyCircuitElement[],
  defaultActiveTab: InputKind,
  projectName: string,
) {
  const encode = (value: unknown) =>
    JSON.stringify(value)
      .replace(/</g, "\\u003c")
      .replace(/>/g, "\\u003e")
      .replace(/&/g, "\\u0026")
  const props = {
    availableTabs: ["schematic", "pcb", "cad", "circuit_json"],
    autoRotate3dViewerDisabled: true,
    defaultActiveTab,
    isWebEmbedded: true,
    projectName,
    showCodeTab: false,
    showFileMenu: false,
    showJsonTab: true,
    showRightHeaderContent: false,
    showToggleFullScreen: true,
  }
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,#root{height:100%;margin:0}body{background:#f8fafb}</style></head><body><div id="root"></div><script>window.CIRCUIT_JSON=${encode(circuitJson)};window.CIRCUIT_JSON_PREVIEW_PROPS=${encode(props)}</script><script src="${runframeUrl}"></script></body></html>`
}

function getInputKind(fileName: string | null): InputKind | null {
  if (!fileName) return null
  if (fileName.toLowerCase().endsWith(".pcbdoc")) return "pcb"
  if (fileName.toLowerCase().endsWith(".schdoc")) return "schematic"
  return null
}

function baseName(name: string | null) {
  return name?.replace(/\.(pcbdoc|schdoc)$/i, "") ?? "board"
}

function download(data: unknown, name: string) {
  const blob = new Blob([`${JSON.stringify(data, null, 2)}\n`], {
    type: "application/json",
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
}
