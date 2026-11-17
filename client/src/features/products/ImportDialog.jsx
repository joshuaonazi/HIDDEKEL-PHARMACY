import { useState } from 'react'
import { CheckCircle2, Download, FileSpreadsheet, Loader2, TriangleAlert } from 'lucide-react'
import Modal from '../../components/ui/Modal.jsx'
import { errorMessage } from '../../api/client.js'
import { productsApi } from '../../api/catalog.api.js'
import { downloadTemplate, parseImportFile } from '../../lib/importParse.js'

export default function ImportDialog({ onClose, onDone }) {
  const [parsed, setParsed] = useState(null)
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)

  async function handleFile(event) {
    const file = event.target.files?.[0]
    setError('')
    setParsed(null)
    if (!file) return
    setFileName(file.name)
    try {
      setParsed(await parseImportFile(file))
    } catch (err) {
      setError(err.message || 'Could not read that file.')
    }
  }

  async function runImport() {
    setBusy(true)
    setError('')
    try {
      setResult(await productsApi.importRows(parsed.rows))
    } catch (err) {
      setError(errorMessage(err, 'The import failed.'))
    } finally {
      setBusy(false)
    }
  }

  const finish = () => (result?.created ? onDone() : onClose())

  return (
    <Modal
      title="Import products from Excel"
      wide
      onClose={busy ? () => {} : finish}
      footer={
        result ? (
          <button type="button" onClick={finish} className="rounded-xl bg-brand-500 px-6 py-2.5 font-bold text-white hover:bg-brand-600">
            Done
          </button>
        ) : (
          <>
            <button type="button" onClick={onClose} disabled={busy} className="rounded-xl border border-slate-300 px-5 py-2.5 font-semibold hover:bg-slate-50 disabled:opacity-60">
              Cancel
            </button>
            <button
              type="button"
              onClick={runImport}
              disabled={!parsed || busy}
              className="flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-2.5 font-bold text-white hover:bg-brand-600 disabled:opacity-50"
            >
              {busy && <Loader2 size={18} className="animate-spin" />}
              {parsed ? `Import ${parsed.rows.length} rows` : 'Import'}
            </button>
          </>
        )
      }
    >
      {result ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-xl bg-brand-50 p-4 text-brand-800">
            <CheckCircle2 size={28} />
            <div>
              <div className="text-lg font-bold">{result.created} products added</div>
              <div className="text-sm">
                {result.skipped.length} skipped (already exist) &middot; {result.errors.length} rows with problems
              </div>
            </div>
          </div>
          {[...result.errors.map((e) => ({ ...e, kind: 'error' })), ...result.skipped.map((s) => ({ ...s, kind: 'skip' }))].length > 0 && (
            <ul className="max-h-60 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-3 text-sm">
              {result.errors.map((e) => (
                <li key={`e${e.row}`} className="text-red-700">
                  Row {e.row}: {e.message}
                </li>
              ))}
              {result.skipped.map((s) => (
                <li key={`s${s.row}`} className="text-amber-700">
                  Row {s.row}: {s.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          <p className="text-sm text-slate-600">
            Upload an Excel (.xlsx) or CSV file with one product per row. Products that already exist are skipped, so importing the same file twice
            won&apos;t double your stock.
          </p>
          <button type="button" onClick={downloadTemplate} className="flex items-center gap-2 text-sm font-semibold text-brand-600 hover:underline">
            <Download size={18} /> Download the template
          </button>

          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-brand-300 bg-brand-50/50 px-6 py-8 text-center hover:bg-brand-50">
            <FileSpreadsheet size={36} className="text-brand-600" />
            <span className="font-semibold text-ink">{fileName || 'Choose a file'}</span>
            <span className="text-xs text-slate-500">.xlsx or .csv, up to 2,000 rows</span>
            <input type="file" accept=".xlsx,.csv" onChange={handleFile} className="sr-only" data-testid="import-file" />
          </label>

          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <TriangleAlert size={18} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {parsed && (
            <div>
              <div className="mb-2 text-sm font-semibold text-ink">
                Found {parsed.rows.length} rows. Preview of the first {Math.min(5, parsed.rows.length)}:
              </div>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-600">
                    <tr>
                      <th className="px-3 py-2">Row</th>
                      <th className="px-3 py-2">Name</th>
                      <th className="px-3 py-2">Category</th>
                      <th className="px-3 py-2">Qty</th>
                      <th className="px-3 py-2">Cost</th>
                      <th className="px-3 py-2">Selling</th>
                      <th className="px-3 py-2">Expiry</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {parsed.rows.slice(0, 5).map((r) => (
                      <tr key={r.row}>
                        <td className="px-3 py-2 text-slate-500">{r.row}</td>
                        <td className="px-3 py-2 font-medium">{r.name}</td>
                        <td className="px-3 py-2">{r.category}</td>
                        <td className="px-3 py-2">{r.quantity}</td>
                        <td className="px-3 py-2">{r.costPrice}</td>
                        <td className="px-3 py-2">{r.sellingPrice}</td>
                        <td className="px-3 py-2">{r.expiryDate}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {parsed.unknownHeaders.length > 0 && (
                <p className="mt-2 text-xs text-amber-700">Ignored columns: {parsed.unknownHeaders.join(', ')}</p>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
