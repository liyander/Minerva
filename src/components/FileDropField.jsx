import { useEffect, useRef, useState } from 'react'
import { fetchFileConfig, uploadFile } from '../services/platform'

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Uploads straight to the object store and reports back the stored file id, so
 * large media never has to travel inside a JSON body of its own.
 */
function FileDropField({ purpose = 'general', label = 'Attach a file', accept, onUploaded, value }) {
  const inputRef = useRef(null)
  const [config, setConfig] = useState(null)
  const [file, setFile] = useState(value || null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    fetchFileConfig()
      .then(setConfig)
      .catch(() => setConfig({ maxMegabytes: 512, driver: 'local' }))
  }, [])

  const handle = async (picked) => {
    if (!picked) return

    if (config?.maxBytes && picked.size > config.maxBytes) {
      setError(`That file is larger than the ${config.maxMegabytes} MB limit.`)
      return
    }

    setBusy(true)
    setError('')

    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result || ''))
        reader.onerror = () => reject(new Error('Could not read that file'))
        reader.readAsDataURL(picked)
      })

      const stored = await uploadFile({ dataUrl, fileName: picked.name, purpose })
      const record = {
        id: stored.id,
        fileName: picked.name,
        contentType: picked.type,
        byteSize: picked.size,
      }
      setFile(record)
      onUploaded?.(record)
    } catch (uploadError) {
      setError(uploadError?.message || 'Upload failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <span className="font-headline text-xs font-bold text-on-surface-variant">{label}</span>

      <div
        className={`mt-1.5 rounded-2xl border-2 border-dashed px-4 py-6 text-center transition-colors ${
          dragging ? 'border-primary bg-primary-container/40' : 'border-outline-variant bg-surface-container'
        }`}
        onDragLeave={() => setDragging(false)}
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          void handle(event.dataTransfer.files?.[0])
        }}
      >
        <input
          accept={accept}
          className="hidden"
          onChange={(event) => handle(event.target.files?.[0])}
          ref={inputRef}
          type="file"
        />

        {busy ? (
          <div className="flex items-center justify-center gap-3">
            <span className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin"></span>
            <span className="font-body text-sm text-on-surface-variant">Uploading…</span>
          </div>
        ) : file ? (
          <div className="flex flex-wrap items-center justify-center gap-3">
            <span className="material-symbols-outlined text-primary">check_circle</span>
            <span className="font-body text-sm text-on-surface truncate max-w-[16rem]">
              {file.fileName}
            </span>
            {file.byteSize ? (
              <span className="font-body text-xs text-on-surface-variant">
                {formatBytes(file.byteSize)}
              </span>
            ) : null}
            <button
              className="font-headline text-xs font-bold text-primary hover:opacity-80"
              onClick={() => {
                setFile(null)
                onUploaded?.(null)
              }}
              type="button"
            >
              Replace
            </button>
          </div>
        ) : (
          <>
            <span className="material-symbols-outlined text-3xl text-on-surface-variant/60">
              cloud_upload
            </span>
            <p className="font-body text-sm text-on-surface-variant mt-2">
              Drag a file here, or{' '}
              <button
                className="font-headline font-bold text-primary hover:opacity-80"
                onClick={() => inputRef.current?.click()}
                type="button"
              >
                browse
              </button>
            </p>
            {config ? (
              <p className="font-body text-xs text-on-surface-variant/70 mt-1">
                Up to {config.maxMegabytes} MB · stored via {config.driver}
              </p>
            ) : null}
          </>
        )}
      </div>

      {error ? <p className="font-body text-xs text-error mt-2">{error}</p> : null}
    </div>
  )
}

export default FileDropField
