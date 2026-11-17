import { useCallback, useEffect, useState } from 'react'
import { Ban, Banknote, ChevronLeft, ChevronRight, Loader2, Receipt, Search, TrendingUp, TriangleAlert, Wallet } from 'lucide-react'
import { errorMessage } from '../../api/client.js'
import { salesApi } from '../../api/sales.api.js'
import { useAuth } from '../../hooks/useAuth.js'
import { useDebounce } from '../../hooks/useDebounce.js'
import { formatInt, formatMoney } from '../../lib/format.js'
import SaleDetailDialog from './SaleDetailDialog.jsx'

const PAGE_SIZE = 15
const PAYMENT = { cash: 'Cash', pos: 'POS', transfer: 'Bank Transfer', other: 'Other', mixed: 'Split' }

const selectClass =
  'rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-ink outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100'

// 'YYYY-MM-DD' for a moment, as the calendar date in the given time zone
const ymd = (date, tz) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
const daysAgo = (n) => new Date(Date.now() - n * 86400000)

function Card({ icon: Icon, tone, label, value, note }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full ${tone}`}>
        <Icon size={26} />
      </span>
      <div className="min-w-0">
        <div className="text-sm font-medium text-ink/80">{label}</div>
        <div className="truncate text-2xl font-extrabold text-ink">{value}</div>
        {note && <div className="text-xs text-slate-500">{note}</div>}
      </div>
    </div>
  )
}

export default function SalesHistoryPage() {
  const { user } = useAuth()
  const sees = user.role === 'admin' || user.role === 'manager'

  const [preset, setPreset] = useState('today')
  const [range, setRange] = useState({ from: '', to: '' }) // empty = today (the server decides using the pharmacy time zone)
  const [cashierId, setCashierId] = useState('')
  const [status, setStatus] = useState('')
  const [payment, setPayment] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [loadedKey, setLoadedKey] = useState(null)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [openId, setOpenId] = useState(null)

  const debouncedSearch = useDebounce(search, 300)
  const requestKey = JSON.stringify([range, cashierId, status, payment, debouncedSearch, page, reloadKey])
  const loading = loadedKey !== requestKey
  const tz = data?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone
  const [openedAt] = useState(() => Date.now())
  const todayStr = ymd(new Date(openedAt), tz)

  useEffect(() => {
    let active = true
    salesApi
      .list({ ...range, cashierId, status, payment, search: debouncedSearch, page, pageSize: PAGE_SIZE })
      .then((res) => {
        if (!active) return
        setData(res)
        setError('')
      })
      .catch((err) => active && setError(errorMessage(err, 'Could not load the sales.')))
      .finally(() => active && setLoadedKey(requestKey))
    return () => {
      active = false
    }
  }, [range, cashierId, status, payment, debouncedSearch, page, requestKey])

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  function pick(name) {
    setPreset(name)
    setPage(1)
    const today = ymd(new Date(), tz)
    if (name === 'today') setRange({ from: '', to: '' })
    if (name === 'yesterday') setRange({ from: ymd(daysAgo(1), tz), to: ymd(daysAgo(1), tz) })
    if (name === 'week') setRange({ from: ymd(daysAgo(6), tz), to: today })
    if (name === 'month') setRange({ from: `${today.slice(0, 8)}01`, to: today })
  }
  const setDate = (field) => (e) => {
    setPreset('custom')
    setPage(1)
    setRange((r) => {
      const base = { from: r.from || ymd(new Date(), tz), to: r.to || ymd(new Date(), tz) }
      return { ...base, [field]: e.target.value || base[field] }
    })
  }
  const filter = (setter) => (e) => {
    setter(e.target.value)
    setPage(1)
  }

  const s = data?.summary
  const pageCount = Math.max(1, Math.ceil((data?.total || 0) / PAGE_SIZE))
  const first = data?.total ? (page - 1) * PAGE_SIZE + 1 : 0
  const last = Math.min(page * PAGE_SIZE, data?.total || 0)
  const fmtTime = (iso) =>
    new Date(iso).toLocaleString('en-GB', { timeZone: tz, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })

  return (
    <div>
      <h1 className="text-3xl font-extrabold tracking-tight text-ink">Sales History</h1>
      <p className="mt-1 text-slate-600">{sees ? 'Every sale in your pharmacy' : 'The sales you have made'}. Open one to reprint a copy{sees ? ' or void it' : ''}.</p>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {[
          ['today', 'Today'],
          ['yesterday', 'Yesterday'],
          ['week', 'Last 7 days'],
          ['month', 'This month'],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => pick(id)}
            aria-pressed={preset === id}
            className={`rounded-full px-4 py-2 text-sm font-semibold ${preset === id ? 'bg-brand-500 text-white' : 'bg-white text-ink ring-1 ring-slate-200 hover:bg-brand-50'}`}
          >
            {label}
          </button>
        ))}
        <input type="date" aria-label="From date" value={range.from || todayStr} onChange={setDate('from')} className={selectClass} />
        <span className="text-slate-500">to</span>
        <input type="date" aria-label="To date" value={range.to || range.from || todayStr} onChange={setDate('to')} className={selectClass} />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card icon={Receipt} tone="bg-brand-100 text-brand-600" label="Total Sales" value={s ? formatMoney(s.completedTotal) : '-'} note={s ? `${formatInt(s.completedCount)} sales` : ''} />
        <Card
          icon={Wallet}
          tone="bg-sky-100 text-sky-600"
          label="Cash Sales"
          value={s ? formatMoney(s.byPayment.cash) : '-'}
          note={s ? `POS ${formatMoney(s.byPayment.pos)} · Transfer ${formatMoney(s.byPayment.transfer)}${s.byPayment.other ? ` · Other ${formatMoney(s.byPayment.other)}` : ''}` : ''}
        />
        <Card icon={Ban} tone="bg-red-100 text-red-500" label="Voided" value={s ? formatInt(s.voidedCount) : '-'} note={s ? formatMoney(s.voidedTotal) : ''} />
        {sees ? (
          <Card icon={TrendingUp} tone="bg-emerald-100 text-emerald-600" label="Profit" value={s ? formatMoney(s.profit) : '-'} note="Before VAT, voided sales excluded" />
        ) : (
          <Card icon={Banknote} tone="bg-amber-100 text-amber-600" label="Average sale" value={s && s.completedCount ? formatMoney(s.completedTotal / s.completedCount) : '-'} />
        )}
      </div>

      <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap gap-3">
          <div className="flex min-w-[12rem] flex-1 items-center gap-3 rounded-xl border border-slate-300 px-4 py-2.5 focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-100">
            <Search size={20} className="text-slate-500" />
            <input
              value={search}
              onChange={filter(setSearch)}
              placeholder="Search by receipt number..."
              aria-label="Search by receipt number"
              className="w-full bg-transparent outline-none placeholder:text-slate-400"
            />
          </div>
          {sees && (
            <select aria-label="Filter by cashier" className={selectClass} value={cashierId} onChange={filter(setCashierId)}>
              <option value="">All staff</option>
              {data?.cashiers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          <select aria-label="Filter by payment" className={selectClass} value={payment} onChange={filter(setPayment)}>
            <option value="">All payments</option>
            {Object.entries(PAYMENT).filter(([k]) => k !== 'mixed').map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <select aria-label="Filter by status" className={selectClass} value={status} onChange={filter(setStatus)}>
            <option value="">All status</option>
            <option value="completed">Completed</option>
            <option value="voided">Voided</option>
          </select>
        </div>

        {error && (
          <div role="alert" className="mt-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <TriangleAlert size={18} /> {error}
          </div>
        )}

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[700px] text-left">
            <thead>
              <tr className="bg-slate-50 text-sm font-semibold text-slate-700">
                <th className="rounded-l-xl px-4 py-3">Date &amp; Time</th>
                <th className="px-3 py-3">Receipt No.</th>
                <th className="px-3 py-3">Cashier</th>
                <th className="px-3 py-3 text-right">Items</th>
                <th className="px-3 py-3 text-right">Total</th>
                <th className="px-3 py-3">Payment</th>
                <th className="rounded-r-xl px-3 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && !data?.items.length ? (
                <tr>
                  <td colSpan={7} className="py-14 text-center">
                    <Loader2 className="mx-auto animate-spin text-brand-500" size={30} />
                  </td>
                </tr>
              ) : !data?.items.length ? (
                <tr>
                  <td colSpan={7} className="py-14 text-center">
                    <Receipt size={36} className="mx-auto text-slate-300" />
                    <div className="mt-3 font-semibold text-ink">No sales found</div>
                    <div className="text-sm text-slate-500">Try another date range or clear the filters.</div>
                  </td>
                </tr>
              ) : (
                data.items.map((sale) => (
                  <tr key={sale.id} onClick={() => setOpenId(sale.id)} className="cursor-pointer hover:bg-slate-50">
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-700">{fmtTime(sale.createdAt)}</td>
                    <td className="px-3 py-3">
                      <button type="button" onClick={() => setOpenId(sale.id)} className="font-mono text-sm font-semibold text-brand-700 hover:underline">
                        {sale.receiptNo}
                      </button>
                    </td>
                    <td className="px-3 py-3 text-sm">{sale.cashier}</td>
                    <td className="px-3 py-3 text-right text-sm">{formatInt(sale.units)}</td>
                    <td className={`px-3 py-3 text-right font-semibold ${sale.status === 'voided' ? 'text-slate-400 line-through' : ''}`}>{formatMoney(sale.total)}</td>
                    <td className="px-3 py-3">
                      <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-700">{PAYMENT[sale.paymentMethod] || sale.paymentMethod}</span>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${sale.status === 'voided' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                        {sale.status === 'voided' ? 'Voided' : 'Completed'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 text-sm text-slate-600">
          <span>
            Showing {first}&ndash;{last} of {formatInt(data?.total || 0)} sales
          </span>
          <div className="flex items-center gap-1">
            <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded-lg border border-slate-200 p-2 hover:bg-slate-50 disabled:opacity-40">
              <ChevronLeft size={18} />
            </button>
            <span className="px-3 font-semibold text-ink">
              Page {page} of {pageCount}
            </span>
            <button type="button" aria-label="Next page" disabled={page >= pageCount} onClick={() => setPage(page + 1)} className="rounded-lg border border-slate-200 p-2 hover:bg-slate-50 disabled:opacity-40">
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </section>

      {openId && <SaleDetailDialog saleId={openId} onClose={() => setOpenId(null)} onChanged={reload} />}
    </div>
  )
}