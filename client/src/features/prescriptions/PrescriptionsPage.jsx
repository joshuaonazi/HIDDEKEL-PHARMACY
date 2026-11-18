import { useEffect, useMemo, useState } from 'react'
import { ClipboardPlus, Copy, Loader2, Pencil, Search, Trash2, TriangleAlert, X } from 'lucide-react'
import Modal from '../../components/ui/Modal.jsx'
import { errorMessage } from '../../api/client.js'
import { productsApi } from '../../api/catalog.api.js'
import { prescriptionsApi } from '../../api/prescriptions.api.js'
import { formatDateTime } from '../../lib/format.js'

const emptyItem = () => ({ productId: '', quantity: 1, directions: '' })

export default function PrescriptionsPage() {
  const [items, setItems] = useState([])
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState(null)

  async function reload() {
    setLoading(true)
    setError('')
    try {
      const data = await prescriptionsApi.list({ search, status, pageSize: 100 })
      setItems(data.items)
    } catch (err) {
      setError(errorMessage(err, 'Could not load prescriptions'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { reload() }, [search, status])

  async function repeat(id) {
    setError('')
    try {
      await prescriptionsApi.repeat(id)
      await reload()
    } catch (err) {
      setError(errorMessage(err, 'Could not repeat the prescription'))
    }
  }

  async function cancel(prescription) {
    const reason = window.prompt('Reason for cancelling this prescription')
    if (!reason) return
    setError('')
    try {
      await prescriptionsApi.cancel(prescription.id, reason.trim())
      await reload()
    } catch (err) {
      setError(errorMessage(err, 'Could not cancel the prescription'))
    }
  }

  const counts = useMemo(() => ({
    pending: items.filter((p) => p.status === 'pending').length,
    dispensed: items.filter((p) => p.status === 'dispensed').length,
    cancelled: items.filter((p) => p.status === 'cancelled').length,
  }), [items])

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-ink">Prescriptions</h1>
          <p className="mt-1 text-slate-600">Create waiting prescriptions and keep permanent dispensing history.</p>
        </div>
        <button type="button" onClick={() => setForm({ customerName: '', customerPhone: '', lines: [emptyItem()] })}
          className="flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-3 font-bold text-white hover:bg-brand-600">
          <ClipboardPlus size={20} /> New prescription
        </button>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {[
          ['Waiting', counts.pending, 'bg-amber-50 text-amber-700'],
          ['Dispensed', counts.dispensed, 'bg-emerald-50 text-emerald-700'],
          ['Cancelled', counts.cancelled, 'bg-slate-100 text-slate-700'],
        ].map(([label, count, tone]) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="text-sm font-medium text-slate-600">{label}</div>
            <div className={`mt-2 text-3xl font-extrabold ${tone.split(' ').pop()}`}>{count}</div>
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <div className="flex min-w-64 flex-1 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5">
          <Search size={18} className="text-slate-500" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Customer, phone, drug or pharmacist"
            className="w-full bg-transparent outline-none" />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)}
          className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 outline-none">
          <option value="">All statuses</option>
          <option value="pending">Waiting</option>
          <option value="dispensed">Dispensed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {error && <div role="alert" className="mt-4 flex gap-2 rounded-xl bg-red-50 p-4 text-sm text-red-700"><TriangleAlert size={18} />{error}</div>}

      <div className="mt-4 space-y-3">
        {loading ? (
          <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-8 text-slate-600"><Loader2 className="animate-spin" /> Loading prescriptions...</div>
        ) : items.map((prescription) => (
          <div key={prescription.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-bold text-ink">{prescription.customerName}</h2>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                    prescription.status === 'pending' ? 'bg-amber-100 text-amber-700'
                      : prescription.status === 'dispensed' ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-slate-100 text-slate-700'
                  }`}>{prescription.status}</span>
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  {prescription.customerPhone || 'No phone'} · {prescription.pharmacist} · {formatDateTime(prescription.createdAt)}
                </p>
              </div>
              <div className="flex gap-2">
                {prescription.status === 'pending' && (
                  <>
                    <button type="button" title="Edit" onClick={() => setForm({
                      id: prescription.id,
                      customerName: prescription.customerName,
                      customerPhone: prescription.customerPhone || '',
                      lines: prescription.items.map((i) => ({ productId: i.productId, quantity: i.quantity, directions: i.directions })),
                    })} className="rounded-lg border border-slate-300 p-2 hover:bg-slate-50"><Pencil size={18} /></button>
                    <button type="button" title="Cancel" onClick={() => cancel(prescription)} className="rounded-lg border border-red-200 p-2 text-red-600 hover:bg-red-50"><X size={18} /></button>
                  </>
                )}
                <button type="button" title="Repeat prescription" onClick={() => repeat(prescription.id)}
                  className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-50">
                  <Copy size={16} /> Repeat
                </button>
              </div>
            </div>
            <div className="mt-4 grid gap-2 md:grid-cols-2">
              {prescription.items.map((item) => (
                <div key={item.id} className="rounded-xl bg-slate-50 p-3 text-sm">
                  <div className="font-bold text-ink">{item.quantity} × {item.name}{item.strength ? ` ${item.strength}` : ''}</div>
                  <div className="mt-1 text-slate-600">{item.directions}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {form && <PrescriptionForm form={form} onClose={() => setForm(null)} onSaved={() => { setForm(null); reload() }} />}
    </div>
  )
}

function PrescriptionForm({ form, onClose, onSaved }) {
  const [customerName, setCustomerName] = useState(form.customerName)
  const [customerPhone, setCustomerPhone] = useState(form.customerPhone)
  const [lines, setLines] = useState(form.lines)
  const [products, setProducts] = useState([])
  const [productSearch, setProductSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    productsApi.list({ search: productSearch, pageSize: 100 })
      .then((data) => { if (active) setProducts(data.items) })
      .catch(() => {})
    return () => { active = false }
  }, [productSearch])

  function updateLine(index, patch) {
    setLines((current) => current.map((line, i) => i === index ? { ...line, ...patch } : line))
  }

  async function submit(event) {
    event.preventDefault()
    if (!customerName.trim()) return setError('Enter the customer name.')
    if (lines.some((line) => !line.productId || !line.directions.trim())) return setError('Choose a drug and enter directions for every line.')
    setBusy(true)
    setError('')
    try {
      const body = {
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim() || null,
        items: lines.map((line) => ({ ...line, quantity: Number(line.quantity) })),
      }
      if (form.id) await prescriptionsApi.update(form.id, body)
      else await prescriptionsApi.create(body)
      onSaved()
    } catch (err) {
      setError(errorMessage(err, 'Could not save the prescription'))
      setBusy(false)
    }
  }

  return (
    <Modal title={form.id ? 'Edit prescription' : 'New prescription'} onClose={busy ? () => {} : onClose}
      footer={<>
        <button type="button" onClick={onClose} disabled={busy} className="rounded-xl border border-slate-300 px-5 py-2.5 font-semibold">Cancel</button>
        <button type="submit" form="prescription-form" disabled={busy} className="rounded-xl bg-brand-500 px-5 py-2.5 font-bold text-white disabled:opacity-60">
          {busy ? 'Saving...' : 'Send to cashier'}
        </button>
      </>}>
      <form id="prescription-form" onSubmit={submit} className="space-y-4">
        {error && <div role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-semibold">Customer name
            <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} maxLength={150}
              className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-2.5" />
          </label>
          <label className="text-sm font-semibold">Phone
            <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} maxLength={30}
              className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-2.5" />
          </label>
        </div>
        <div>
          <div className="flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2">
            <Search size={17} />
            <input value={productSearch} onChange={(e) => setProductSearch(e.target.value)} placeholder="Search drugs"
              className="w-full bg-transparent outline-none" />
          </div>
          <div className="mt-3 space-y-3">
            {lines.map((line, index) => (
              <div key={index} className="grid gap-2 rounded-xl border border-slate-200 p-3 md:grid-cols-[1fr_90px_1fr_auto]">
                <select value={line.productId} onChange={(e) => updateLine(index, { productId: e.target.value })}
                  className="rounded-lg border border-slate-300 px-3 py-2">
                  <option value="">Choose drug</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}{p.strength ? ` ${p.strength}` : ''} — {p.sellableStock} in stock — ₦{Number(p.sellingPrice || 0).toFixed(2)}</option>
                  ))}
                </select>
                <input type="number" min="1" value={line.quantity} onChange={(e) => updateLine(index, { quantity: e.target.value })}
                  className="rounded-lg border border-slate-300 px-3 py-2" placeholder="Qty" />
                <input value={line.directions} onChange={(e) => updateLine(index, { directions: e.target.value })} maxLength={500}
                  className="rounded-lg border border-slate-300 px-3 py-2" placeholder="Directions" />
                <button type="button" disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((_, i) => i !== index))}
                  className="rounded-lg p-2 text-red-600 disabled:opacity-30"><Trash2 size={18} /></button>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setLines((current) => [...current, emptyItem()])}
            className="mt-3 text-sm font-bold text-brand-700">+ Add drug</button>
        </div>
      </form>
    </Modal>
  )
}
