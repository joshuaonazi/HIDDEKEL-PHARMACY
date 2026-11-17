import { useEffect, useState } from 'react'
import { Loader2, Printer, TriangleAlert, Undo2 } from 'lucide-react'
import Modal from '../../components/ui/Modal.jsx'
import { errorMessage } from '../../api/client.js'
import { salesApi } from '../../api/sales.api.js'
import { useAuth } from '../../hooks/useAuth.js'
import { formatMoney } from '../../lib/format.js'
import { PrintRoot, ReceiptView } from './Receipt.jsx'

const REASONS = ['Wrong item sold', 'Customer changed their mind', 'Price mistake', 'Sold twice by mistake']
const PAYMENT = { cash: 'Cash', pos: 'POS', transfer: 'Bank Transfer', other: 'Other', mixed: 'Split' }

function when(sale) {
  return new Date(sale.createdAt).toLocaleString('en-GB', {
    timeZone: sale.pharmacy.timezone,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

// One past sale: reprint a duplicate copy, or (managers and admins) void it
export default function SaleDetailDialog({ saleId, onClose, onChanged }) {
  const { user } = useAuth()
  const canVoid = user.role === 'admin' || user.role === 'manager'
  const [sale, setSale] = useState(null)
  const [error, setError] = useState('')
  const [voiding, setVoiding] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    salesApi
      .get(saleId)
      .then((s) => active && setSale(s))
      .catch((err) => active && setError(errorMessage(err, 'Could not open this sale.')))
    return () => {
      active = false
    }
  }, [saleId])

  async function confirmVoid() {
    setBusy(true)
    setError('')
    try {
      setSale(await salesApi.void(saleId, reason.trim()))
      setVoiding(false)
      onChanged()
    } catch (err) {
      setError(errorMessage(err, 'The sale could not be voided.'))
    } finally {
      setBusy(false)
    }
  }

  const voided = sale?.status === 'voided'

  return (
    <>
      <Modal
        title={sale ? `Sale ${sale.receiptNo}` : 'Sale'}
        wide
        onClose={busy ? () => {} : onClose}
        footer={
          sale && (
            <>
              {voiding ? (
                <>
                  <button type="button" onClick={() => setVoiding(false)} disabled={busy} className="rounded-xl border border-slate-300 px-5 py-2.5 font-semibold hover:bg-slate-50 disabled:opacity-60">
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={confirmVoid}
                    disabled={busy || reason.trim().length < 3}
                    className="flex items-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 font-bold text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {busy ? <Loader2 size={18} className="animate-spin" /> : <Undo2 size={18} />} Void this sale
                  </button>
                </>
              ) : (
                <>
                  {canVoid && !voided && (
                    <button type="button" onClick={() => setVoiding(true)} className="flex items-center gap-2 rounded-xl border border-red-300 px-5 py-2.5 font-semibold text-red-600 hover:bg-red-50">
                      <Undo2 size={18} /> Void sale
                    </button>
                  )}
                  <button type="button" onClick={() => window.print()} className="flex items-center gap-2 rounded-xl border border-brand-500 px-5 py-2.5 font-bold text-brand-600 hover:bg-brand-50">
                    <Printer size={18} /> Print copy
                  </button>
                  <button type="button" onClick={onClose} className="rounded-xl bg-brand-500 px-6 py-2.5 font-bold text-white hover:bg-brand-600">
                    Close
                  </button>
                </>
              )}
            </>
          )
        }
      >
        {!sale && !error && <Loader2 className="mx-auto my-12 animate-spin text-brand-500" size={32} />}
        {error && (
          <div role="alert" className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <TriangleAlert size={18} className="mt-0.5 shrink-0" /> {error}
          </div>
        )}
        {sale && (
          <div className="grid gap-6 md:grid-cols-[1fr_auto]">
            <div className="space-y-4">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                {[
                  ['Date', when(sale)],
                  ['Cashier', sale.cashier],
                  ['Payment', PAYMENT[sale.paymentMethod] || sale.paymentMethod],
                  ['Total', formatMoney(sale.total)],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-slate-500">{k}</dt>
                    <dd className="font-semibold text-ink">{v}</dd>
                  </div>
                ))}
              </dl>
              {voided && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" data-testid="void-info">
                  <div className="font-bold">This sale was voided</div>
                  <div className="mt-1">Reason: {sale.voidReason}</div>
                  <div>By {sale.voidedBy}</div>
                  <div className="mt-1 text-red-700">The stock was returned and the sale no longer counts in the totals.</div>
                </div>
              )}
              {voiding && (
                <div className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4">
                  <div className="font-bold text-amber-900">Void this sale?</div>
                  <p className="text-sm text-amber-900">
                    The items go back into stock and the sale stops counting in your totals. Give the {formatMoney(sale.total)} back to the customer yourself.
                    This cannot be undone.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {REASONS.map((r) => (
                      <button key={r} type="button" onClick={() => setReason(r)} className="rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-100">
                        {r}
                      </button>
                    ))}
                  </div>
                  <label className="block">
                    <span className="mb-1 block text-sm font-semibold text-amber-900">Reason (required)</span>
                    <textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      maxLength={200}
                      rows={2}
                      className="w-full rounded-xl border border-amber-300 bg-white px-3 py-2 outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-100"
                    />
                  </label>
                </div>
              )}
            </div>
            <div className="max-h-[55vh] justify-self-center overflow-y-auto rounded-lg border border-slate-200 bg-slate-100 p-3 shadow-inner">
              <div className="shadow-md">
                <ReceiptView sale={sale} copy />
              </div>
            </div>
          </div>
        )}
      </Modal>
      {sale && <PrintRoot sale={sale} copy />}
    </>
  )
}