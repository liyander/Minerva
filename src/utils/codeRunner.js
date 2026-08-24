// In-browser code runner for the Lab Research code lab.
// JavaScript runs inside a sandboxed Web Worker with a hard timeout.
// Python runs through Pyodide (CPython compiled to WebAssembly), loaded on demand.

const RUN_TIMEOUT_MS = 8000
const PYODIDE_VERSION = '0.26.4'
const PYODIDE_BASE_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`

export function isRunnableInBrowser(language) {
  return ['javascript', 'python'].includes(String(language || '').toLowerCase())
}

function deepEqual(a, b) {
  if (a === b) return true
  if (typeof a !== typeof b) return false
  if (typeof a === 'number') return Number.isNaN(a) && Number.isNaN(b)
  if (a === null || b === null || typeof a !== 'object') return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  if (keysA.length !== keysB.length) return false
  return keysA.every((key) => deepEqual(a[key], b[key]))
}

// Compares the produced value with the expected output text. The expected
// output is authored as JSON when possible, so parse both sides and compare
// structurally; otherwise fall back to trimmed string comparison.
export function outputsMatch(expectedOutput, actualSerialized) {
  const expectedText = String(expectedOutput ?? '').trim()
  const actualText = String(actualSerialized ?? '').trim()
  if (expectedText === actualText) return true
  try {
    return deepEqual(JSON.parse(expectedText), JSON.parse(actualText))
  } catch {
    // Also tolerate an expected plain string vs a JSON-quoted string.
    try {
      const parsedActual = JSON.parse(actualText)
      return typeof parsedActual === 'string' && parsedActual.trim() === expectedText
    } catch {
      return false
    }
  }
}

function buildResult(testCase, index, { passed, actualOutput = '', detail = '' }) {
  return {
    index: index + 1,
    description: testCase.description || `Test case ${index + 1}`,
    input: testCase.input,
    expectedOutput: testCase.expectedOutput,
    actualOutput,
    passed,
    detail,
  }
}

const JS_WORKER_SOURCE = `
self.onmessage = function (event) {
  var code = event.data.code
  var tests = event.data.tests
  var results = []
  var solve
  try {
    var factory = new Function(code + '\\n;return (typeof solve === "function") ? solve : undefined;')
    solve = factory()
  } catch (error) {
    self.postMessage({ error: 'Your code failed to load: ' + (error && error.message ? error.message : String(error)) })
    return
  }
  if (typeof solve !== 'function') {
    self.postMessage({ error: 'No solve(input) function was found in your code.' })
    return
  }
  for (var i = 0; i < tests.length; i += 1) {
    try {
      var output = solve(tests[i].input)
      var serialized = output === undefined ? 'undefined' : JSON.stringify(output)
      results.push({ ok: true, output: serialized })
    } catch (error) {
      results.push({ ok: false, message: (error && error.message ? error.message : String(error)) })
    }
  }
  self.postMessage({ results: results })
}
`

function runJavaScriptTests(code, testCases) {
  return new Promise((resolve) => {
    const blob = new Blob([JS_WORKER_SOURCE], { type: 'application/javascript' })
    const workerUrl = URL.createObjectURL(blob)
    const worker = new Worker(workerUrl)
    let settled = false

    const finish = (value) => {
      if (settled) return
      settled = true
      worker.terminate()
      URL.revokeObjectURL(workerUrl)
      resolve(value)
    }

    const timeoutId = setTimeout(() => {
      finish(testCases.map((testCase, index) => buildResult(testCase, index, {
        passed: false,
        detail: `Execution timed out after ${RUN_TIMEOUT_MS / 1000}s — check for infinite loops.`,
      })))
    }, RUN_TIMEOUT_MS)

    worker.onmessage = (event) => {
      clearTimeout(timeoutId)
      if (event.data?.error) {
        finish(testCases.map((testCase, index) => buildResult(testCase, index, {
          passed: false,
          detail: event.data.error,
        })))
        return
      }
      const runs = Array.isArray(event.data?.results) ? event.data.results : []
      finish(testCases.map((testCase, index) => {
        const run = runs[index]
        if (!run) {
          return buildResult(testCase, index, { passed: false, detail: 'The test did not run.' })
        }
        if (!run.ok) {
          return buildResult(testCase, index, { passed: false, detail: `Runtime error: ${run.message}` })
        }
        const passed = outputsMatch(testCase.expectedOutput, run.output)
        return buildResult(testCase, index, {
          passed,
          actualOutput: run.output,
          detail: passed ? '' : 'Output does not match the expected output.',
        })
      }))
    }

    worker.onerror = (event) => {
      clearTimeout(timeoutId)
      finish(testCases.map((testCase, index) => buildResult(testCase, index, {
        passed: false,
        detail: `Your code failed to load: ${event.message || 'unknown error'}`,
      })))
    }

    worker.postMessage({ code, tests: testCases.map((testCase) => ({ input: testCase.input })) })
  })
}

let pyodidePromise = null

function loadPyodideRuntime() {
  if (pyodidePromise) return pyodidePromise
  pyodidePromise = new Promise((resolve, reject) => {
    if (window.loadPyodide) {
      resolve(window.loadPyodide({ indexURL: PYODIDE_BASE_URL }))
      return
    }
    const script = document.createElement('script')
    script.src = `${PYODIDE_BASE_URL}pyodide.js`
    script.onload = () => {
      window.loadPyodide({ indexURL: PYODIDE_BASE_URL }).then(resolve, reject)
    }
    script.onerror = () => {
      reject(new Error('Failed to load the Python runtime. Check your internet connection and try again.'))
    }
    document.head.appendChild(script)
  }).catch((error) => {
    pyodidePromise = null
    throw error
  })
  return pyodidePromise
}

async function runPythonTests(code, testCases, { onStatus } = {}) {
  onStatus?.('Loading Python runtime (first run only)...')
  let pyodide
  try {
    pyodide = await loadPyodideRuntime()
  } catch (error) {
    return testCases.map((testCase, index) => buildResult(testCase, index, {
      passed: false,
      detail: error.message,
    }))
  }
  onStatus?.('Running tests...')

  try {
    pyodide.runPython(`
import json
__lab_namespace = {}
`)
    pyodide.globals.set('__lab_code', code)
    pyodide.runPython('exec(__lab_code, __lab_namespace)')
    const hasSolve = pyodide.runPython('"solve" in __lab_namespace and callable(__lab_namespace["solve"])')
    if (!hasSolve) {
      return testCases.map((testCase, index) => buildResult(testCase, index, {
        passed: false,
        detail: 'No solve(input) function was found in your code.',
      }))
    }
  } catch (error) {
    const message = String(error?.message || error).split('\n').filter(Boolean).slice(-3).join(' ')
    return testCases.map((testCase, index) => buildResult(testCase, index, {
      passed: false,
      detail: `Your code failed to load: ${message}`,
    }))
  }

  const results = []
  for (const [index, testCase] of testCases.entries()) {
    try {
      pyodide.globals.set('__lab_input', testCase.input)
      const serialized = pyodide.runPython(
        'json.dumps(__lab_namespace["solve"](__lab_input))',
      )
      const passed = outputsMatch(testCase.expectedOutput, serialized)
      results.push(buildResult(testCase, index, {
        passed,
        actualOutput: serialized,
        detail: passed ? '' : 'Output does not match the expected output.',
      }))
    } catch (error) {
      const message = String(error?.message || error).split('\n').filter(Boolean).slice(-3).join(' ')
      results.push(buildResult(testCase, index, { passed: false, detail: `Runtime error: ${message}` }))
    }
  }
  return results
}

// Only true resource-loading elements can taint the preview canvas or reach
// the network on their own (an <a href="https://...">, by contrast, is inert
// until clicked, so it is intentionally not flagged here).
const RESOURCE_LOADING_TAGS = new Set(['img', 'script', 'iframe', 'source', 'video', 'audio', 'embed', 'link', 'object'])
const OPENING_TAG_PATTERN = /<([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g
const EXTERNAL_ATTR_PATTERN = /\b(?:src|href|poster)\s*=\s*["']\s*(?:https?:)?\/\/[^"'>]+["']/i
const EXTERNAL_CSS_PATTERN = /url\(\s*["']?\s*(?:https?:)?\/\/[^)"']+["']?\s*\)|@import\s+(?:url\(\s*)?["']?\s*(?:https?:)?\/\/[^)"';]+/gi

export function findExternalResourceReferences(html) {
  const text = String(html || '')
  const refs = []
  for (const match of text.matchAll(OPENING_TAG_PATTERN)) {
    if (!RESOURCE_LOADING_TAGS.has(match[1].toLowerCase())) continue
    const attrMatch = EXTERNAL_ATTR_PATTERN.exec(match[2])
    if (attrMatch) refs.push(match[0].trim().slice(0, 200))
  }
  for (const match of text.matchAll(EXTERNAL_CSS_PATTERN)) {
    refs.push(match[0].trim())
  }
  return refs.slice(0, 5)
}

// Evaluates UI challenge checks inside a rendered same-origin iframe.
// Each check is a boolean JavaScript expression executed in the iframe's
// global scope, so `document` refers to the player's rendered page.
export function runUiChecksInFrame(iframe, checks) {
  const win = iframe?.contentWindow
  const results = (checks || []).map((check, index) => {
    const base = {
      index: check.index || index + 1,
      description: check.description || `Check ${index + 1}`,
      passed: false,
      detail: '',
    }
    if (!win) {
      return { ...base, detail: 'The preview did not render.' }
    }
    try {
      const evaluate = new win.Function(`return !!(${check.expression})`)
      const passed = Boolean(evaluate.call(win))
      return { ...base, passed, detail: passed ? '' : 'The rendered page does not satisfy this requirement yet.' }
    } catch (error) {
      return { ...base, detail: `Check failed to run: ${error?.message || error}` }
    }
  })
  return {
    passed: results.length > 0 && results.every((item) => item.passed),
    results,
  }
}

const SCREENSHOT_MAX_WIDTH = 1100

function scaleCanvasToJpeg(canvas) {
  let output = canvas
  if (canvas.width > SCREENSHOT_MAX_WIDTH) {
    const scale = SCREENSHOT_MAX_WIDTH / canvas.width
    output = document.createElement('canvas')
    output.width = SCREENSHOT_MAX_WIDTH
    output.height = Math.max(1, Math.round(canvas.height * scale))
    output.getContext('2d').drawImage(canvas, 0, 0, output.width, output.height)
  }
  return output.toDataURL('image/jpeg', 0.75)
}

// A capture that came back with no pixels (or an all-transparent canvas)
// means the renderer silently failed — treat it as a failure so the
// fallback strategy runs instead of storing a blank image.
function isUsableCanvas(canvas) {
  if (!canvas || canvas.width < 8 || canvas.height < 8) return false
  try {
    const probe = canvas.getContext('2d').getImageData(0, 0, Math.min(canvas.width, 50), Math.min(canvas.height, 50)).data
    for (let i = 3; i < probe.length; i += 4) {
      if (probe[i] !== 0) return true
    }
    return false
  } catch {
    return false
  }
}

async function captureWithHtml2Canvas(doc) {
  const { default: html2canvas } = await import('html2canvas')
  const canvas = await html2canvas(doc.documentElement, {
    backgroundColor: '#ffffff',
    logging: false,
    useCORS: true,
    windowWidth: doc.documentElement.scrollWidth || 1024,
    windowHeight: doc.documentElement.scrollHeight || 768,
  })
  if (!isUsableCanvas(canvas)) {
    throw new Error('html2canvas produced an empty capture')
  }
  return scaleCanvasToJpeg(canvas)
}

// Fallback renderer: serializes the live document into an SVG foreignObject
// and rasterizes it. Form fields keep their typed values via attribute sync.
async function captureWithForeignObject(doc) {
  for (const input of doc.querySelectorAll('input')) {
    if (input.type === 'checkbox' || input.type === 'radio') {
      if (input.checked) input.setAttribute('checked', '')
      else input.removeAttribute('checked')
    } else {
      input.setAttribute('value', input.value)
    }
  }
  for (const textarea of doc.querySelectorAll('textarea')) {
    textarea.textContent = textarea.value
  }

  const width = Math.min(Math.max(doc.documentElement.scrollWidth || 1024, 320), 1600)
  const height = Math.min(Math.max(doc.documentElement.scrollHeight || 768, 240), 2400)
  const clone = doc.documentElement.cloneNode(true)
  clone.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml')
  for (const script of clone.querySelectorAll('script')) {
    script.remove()
  }
  const serialized = new XMLSerializer().serializeToString(clone)
  const svgMarkup = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject width="100%" height="100%">${serialized}</foreignObject></svg>`
  const blobUrl = URL.createObjectURL(new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('The rendered page could not be rasterized.'))
      img.src = blobUrl
    })
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, width, height)
    context.drawImage(image, 0, 0)
    try {
      return scaleCanvasToJpeg(canvas)
    } catch {
      // Chromium taints the canvas after drawing a foreignObject SVG; this
      // fallback only helps in browsers that allow the export (e.g. Firefox).
      throw new Error('The browser blocked exporting the rasterized page.')
    }
  } finally {
    URL.revokeObjectURL(blobUrl)
  }
}

// Captures the rendered iframe document as a JPEG data URL for the admin
// audit trail. Tries html2canvas first (best fidelity), then falls back to
// SVG foreignObject rasterization, which handles srcdoc iframes reliably.
export async function captureFrameScreenshot(iframe) {
  const doc = iframe?.contentDocument
  if (!doc?.documentElement) {
    throw new Error('The preview is not rendered, so no screenshot can be captured.')
  }
  try {
    return await captureWithHtml2Canvas(doc)
  } catch (error) {
    console.warn('html2canvas capture failed, falling back to SVG rasterization:', error?.message || error)
    return captureWithForeignObject(doc)
  }
}

// Runs the submitted code against every test case in the browser.
// Returns { results, passed } where each result mirrors the backend shape.
export async function runCodeAgainstTests({ language, code, testCases, onStatus }) {
  const cases = Array.isArray(testCases) ? testCases : []
  if (!cases.length) {
    return { passed: false, results: [] }
  }
  const normalizedLanguage = String(language || '').toLowerCase()
  let results
  if (normalizedLanguage === 'python') {
    results = await runPythonTests(code, cases, { onStatus })
  } else {
    results = await runJavaScriptTests(code, cases)
  }
  return {
    passed: results.length > 0 && results.every((item) => item.passed),
    results,
  }
}
