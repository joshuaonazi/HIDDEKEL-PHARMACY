import { useState } from 'react'
import { CheckCircle2, Download, FileSpreadsheet, Loader2, PackagePlus, TriangleAlert } from 'lucide-react'
import Modal from '../../components/ui/Modal.jsx'
import { errorMessage } from '../../api/client.js'
import { productsApi } from '../../api/catalog.api.js'
import { formatDate, formatInt, formatMoney } from '../../lib/format.js'
import { downloadStockTemplate, parseImportFile } from '../../lib/importParse.js'

// Adds batches (opening stock or a restock) to products that already exist. Existing stock is never overwritten.
export default function StockImportDialog({ onClose, onDone }) {
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState(null)
  const [preview, setPreview] = useState(null)
  const [checking, setChecking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [repeatOk, setRepeatOk] = useState(false)
  const [done, setDone] = useState(null)

  async function handleFile(event) {
    const file = event.target.files?.[0]
    setError('')
    setPreview(null)
    setRows(null)
    setRepeatOk(false)
    if (!file) return
    setFileName(file.name)
    setChecking(true)
    try {
      const { rows: parsed } = await parseImportFile(file, 'stock')
      setRows(parsed)
      setPreview(await productsApi.stockImport(parsed, { dryRun: true }))
    } catch (err) {
      setError(err.response ? errorMessage(err, 'Could not check the file.') : err.message || 'Could not read that file.')
    } finally {
      setChecking(false)
    }
  }

  async function commit() {
    setBusy(true)
    setError('')
    try {
      setDone(await productsApi.stockImport(rows, { dryRun: false, allowRepeat: repeatOk }))
    } catch (err) {
      setError(errorMessage(err, 'The stock could not be added. Nothing was changed.'))
    } finally {
      setBusy(false)
    }
  }

  const problems = preview?.rows.filter((r) => r.status === 'error') || []
  const good = preview?.rows.filter((r) => r.status === 'ok') || []
  const repeated = Boolean(preview?.previouslyImportedAt)
  const canAdd = preview && problems.length === 0 && good.length > 0 && (!repeated || repeatOk) && !busy
  const finish = () => (done ? onDone() : onClose())

  return (
    <Modal
      title="Import stock from Excel"
      wide
      onClose={busy ? () => {} : finish}
      footer={
        done ? (
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
              onClick={commit}
              disabled={!canAdd}
              className="flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-2.5 font-bold text-white hover:bg-brand-600 disabled:opacity-50"
            >
              {busy ? <Loader2 size={18} className="animate-spin" /> : <PackagePlus size={18} />}
              {preview && problems.length === 0 ? `Add ${formatInt(preview.summary.units)} units` : 'Add stock'}
            </button>
          </>
        )
      }
    >
      {done ? (
        <div className="flex items-center gap-3 rounded-xl bg-brand-50 p-4 text-brand-800">
          <CheckCircle2 size={30} />
          <div>
            <div className="text-lg font-bold">Stock added</div>
            <div className="text-sm">
              {formatInt(done.summary.batches)} batches, {formatInt(done.summary.units)} units. Your products are now ready to sell.
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <p className="text-sm text-slate-600">
            Each row adds a <strong>new batch</strong> to a product that already exists, matched by barcode or by name (add strength or form if two
            products share a name). Existing stock is never changed, so this works for opening stock and for restocking. Nothing is added unless
            every row is correct.
          </p>
          <button type="button" onClick={downloadStockTemplate} className="flex items-center gap-2 text-sm font-semibold text-brand-600 hover:underline">
            <Download size={18} /> Download the template
          </button>

          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-brand-300 bg-brand-50/50 px-6 py-8 text-center hover:bg-brand-50">
            <FileSpreadsheet size={36} className="text-brand-600" />
            <span className="font-semibold text-ink">{fileName || 'Choose a file'}</span>
            <span className="text-xs text-slate-500">.xlsx or .csv with Name or Barcode, Quantity, Cost Price, Selling Price (and Expiry Date)</span>
            <input type="file" accept=".xlsx,.csv" onChange={handleFile} className="sr-only" data-testid="stock-file" />
          </label>

          {checking && (
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <Loader2 size={18} className="animate-spin" /> Checking the file...
            </div>
          )}
          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <TriangleAlert size={18} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {preview && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-xl bg-slate-50 p-3">
                  <div className="text-2xl font-extrabold text-ink">{formatInt(preview.summary.rows)}</div>
                  <div className="text-xs text-slate-600">rows in file</div>
                </div>
                <div className="rounded-xl bg-brand-50 p-3">
                  <div className="text-2xl font-extrabold text-brand-700">{formatInt(preview.summary.units)}</div>
                  <div className="text-xs text-brand-800">units to add</div>
                </div>
                <div className={`rounded-xl p-3 ${problems.length ? 'bg-red-50' : 'bg-slate-50'}`}>
                  <div className={`text-2xl font-extrabold ${problems.length ? 'text-red-700' : 'text-ink'}`}>{formatInt(problems.length)}</div>
                  <div className="text-xs text-slate-600">rows with problems</div>
                </div>
              </div>

              {repeated && (
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                  <input type="checkbox" checked={repeatOk} onChange={(e) => setRepeatOk(e.target.checked)} className="mt-0.5 h-5 w-5 accent-amber-600" />
                  <span>
                    <strong>This exact file was already imported on {formatDate(String(preview.previouslyImportedAt).slice(0, 10))}.</strong> Adding it again
                    will double that stock. Tick here only if you really mean to add it twice.
                  </span>
                </label>
              )}

              {problems.length > 0 && (
                <div>
                  <div className="mb-1 text-sm font-semibold text-red-700">Fix these rows in your file, then choose it again. No stock is added until all rows are correct.</div>
                  <ul className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-red-200 bg-red-50/50 p-3 text-sm text-red-800">
                    {problems.map((p) => (
                      <li key={p.row}>
                        Row {p.row}: {p.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {good.length > 0 && (
                <div>
                  <div className="mb-1 text-sm font-semibold text-ink">
                    {problems.length ? 'Rows that are fine' : 'What will be added'} (first {Math.min(6, good.length)}):
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full min-w-[520px] text-sm">
                      <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-600">
                        <tr>
                          <th className="px-3 py-2">Row</th>
                          <th className="px-3 py-2">Product</th>
                          <th className="px-3 py-2">Qty</th>
                          <th className="px-3 py-2">Cost</th>
                          <th className="px-3 py-2">Selling</th>
                          <th className="px-3 py-2">Expiry</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {good.slice(0, 6).map((r) => (
                          <tr key={r.row}>
                            <td className="px-3 py-2 text-slate-500">{r.row}</td>
                            <td className="px-3 py-2 font-medium">{r.productName}</td>
                            <td className="px-3 py-2">{formatInt(r.quantity)}</td>
                            <td className="px-3 py-2">{formatMoney(r.costPrice)}</td>
                            <td className="px-3 py-2">{formatMoney(r.sellingPrice)}</td>
                            <td className="px-3 py-2">{r.expiryDate ? formatDate(r.expiryDate) : '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
