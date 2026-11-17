import { useEffect, useState } from 'react'
import { CheckCircle2, Loader2, Save, TriangleAlert } from 'lucide-react'
import { settingsApi } from '../../api/sales.api.js'
import { errorMessage } from '../../api/client.js'
import { useAuth } from '../../hooks/useAuth.js'
import { ReceiptView } from '../sales/Receipt.jsx'

// A fixed sample time so the preview does not change while typing
const PREVIEW_TIME = '2026-01-01T09:30:00.000Z'

const inputClass =
  'w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-ink outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100'

export default function SettingsPage() {
  const { refresh } = useAuth()
  const [form, setForm] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let active = true
    settingsApi
      .get()
      .then((s) => {
        if (!active) return
        setForm({ name: s.name, address: s.address || '', phone: s.phone || '', receiptFooter: s.receiptFooter || '', taxRate: String(s.taxRate), timezone: s.timezone })
      })
      .catch((err) => active && setLoadError(errorMessage(err, 'Could not load the settings.')))
    return () => {
      active = false
    }
  }, [])

  if (loadError) return <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700">{loadError}</div>
  if (!form) return <Loader2 className="mx-auto mt-20 animate-spin text-brand-500" size={32} />

  const set = (field) => (e) => {
    setSaved(false)
    setForm((f) => ({ ...f, [field]: e.target.value }))
  }

  async function save(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      await settingsApi.update({
        name: form.name.trim(),
        address: form.address.trim(),
        phone: form.phone.trim(),
        receiptFooter: form.receiptFooter.trim(),
        taxRate: Number(form.taxRate) || 0,
      })
      await refresh()
      setSaved(true)
    } catch (err) {
      setError(errorMessage(err, 'Could not save the settings.'))
    } finally {
      setSaving(false)
    }
  }

  const sample = {
    receiptNo: 'HPS-20260101-0001',
    createdAt: PREVIEW_TIME,
    cashier: 'Sample Cashier',
    paymentMethod: 'cash',
    subtotal: 1100,
    discount: 0,
    tax: (1100 * (Number(form.taxRate) || 0)) / 100,
    taxRate: Number(form.taxRate) || 0,
    total: 1100 + (1100 * (Number(form.taxRate) || 0)) / 100,
    amountTendered: 2000,
    change: 2000 - (1100 + (1100 * (Number(form.taxRate) || 0)) / 100),
    items: [
      { name: 'Paracetamol 500mg', strength: null, quantity: 2, unitPrice: 350, lineTotal: 700 },
      { name: 'Vitamin C 1000mg', strength: null, quantity: 1, unitPrice: 400, lineTotal: 400 },
    ],
    pharmacy: { name: form.name || 'Your Pharmacy', address: form.address, phone: form.phone, receiptFooter: form.receiptFooter, timezone: form.timezone },
  }

  return (
    <div>
      <h1 className="text-3xl font-extrabold tracking-tight text-ink">Settings</h1>
      <p className="mt-1 text-slate-600">What appears on your receipts and how VAT is added.</p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_20rem]">
        <form onSubmit={save} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-ink">Pharmacy name <span className="text-red-500">*</span></span>
            <input className={inputClass} value={form.name} onChange={set('name')} maxLength={120} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-ink">Address</span>
            <input className={inputClass} value={form.address} onChange={set('address')} maxLength={200} placeholder="Shown under the name on receipts" />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold text-ink">Phone</span>
              <input className={inputClass} value={form.phone} onChange={set('phone')} maxLength={30} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold text-ink">VAT rate (%)</span>
              <input className={inputClass} type="number" min="0" max="100" step="0.1" value={form.taxRate} onChange={set('taxRate')} />
              <span className="mt-1 block text-xs text-slate-500">Leave at 0 if you do not charge VAT. Ask your accountant which items are VAT-exempt.</span>
            </label>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-ink">Receipt footer message</span>
            <input className={inputClass} value={form.receiptFooter} onChange={set('receiptFooter')} maxLength={120} placeholder="e.g. Get well soon" />
          </label>

          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <TriangleAlert size={18} className="mt-0.5 shrink-0" /> {error}
            </div>
          )}
          {saved && (
            <div role="status" className="flex items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm font-medium text-brand-800">
              <CheckCircle2 size={18} /> Settings saved
            </div>
          )}
          <button type="submit" disabled={saving} className="flex items-center gap-2 rounded-xl bg-brand-500 px-6 py-3 font-bold text-white hover:bg-brand-600 disabled:opacity-60">
            {saving ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />} Save settings
          </button>
        </form>

        <div>
          <div className="mb-2 text-sm font-semibold text-slate-600">Receipt preview (58mm)</div>
          <div className="overflow-x-auto rounded-xl bg-slate-100 p-3">
            <div className="mx-auto w-fit shadow-md">
              <ReceiptView sale={sample} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
