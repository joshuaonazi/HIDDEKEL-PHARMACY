import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import {
  Banknote,
  Barcode,
  Camera,
  CreditCard,
  Keyboard,
  Landmark,
  Loader2,
  MoreHorizontal,
  Minus,
  Package,
  Plus,
  Printer,
  Calculator,
  ScanLine,
  Trash2,
  TriangleAlert,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { productsApi } from '../../api/catalog.api.js'
import { errorMessage } from '../../api/client.js'
import { salesApi } from '../../api/sales.api.js'
import { useDebounce } from '../../hooks/useDebounce.js'
import { beep, setSoundEnabled, soundEnabled } from '../../lib/beep.js'
import { formatDate, formatInt, formatMoney } from '../../lib/format.js'
import CameraScanner from './CameraScanner.jsx'
import ReceiptDialog from './ReceiptDialog.jsx'

const PAYMENTS = [
  { id: 'cash', label: 'Cash', icon: Banknote },
  { id: 'pos', label: 'POS', icon: CreditCard },
  { id: 'transfer', label: 'Bank Transfer', icon: Landmark },
  { id: 'other', label: 'Other', icon: MoreHorizontal },
]

const nameOf = (p) => (p.strength && !p.name.toLowerCase().includes(p.strength.toLowerCase()) ? `${p.name} ${p.strength}` : p.name)

function ModeButton({ active, icon: Icon, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-center gap-2 rounded-2xl px-5 py-3.5 text-lg font-bold ${active ? 'bg-brand-500 text-white shadow-sm' : 'bg-brand-100 text-brand-700 hover:bg-brand-200'}`}
    >
      <Icon size={24} /> <span className="hidden sm:inline">{label}</span>
    </button>
  )
}

export default function SalesPage() {
  const location = useLocation()
  const inputRef = useRef(null)
  const attemptRef = useRef({ sig: '', ref: '' })

  const [mode, setMode] = useState('scanner') // scanner | manual
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null) // null = hidden, [] = nothing found
  const [searching, setSearching] = useState(false)
  const [cart, setCart] = useState([])
  const [lastScanned, setLastScanned] = useState(null)
  const [notice, setNotice] = useState(null) // { type, text }
  const [sound, setSound] = useState(soundEnabled)

  const [discountType, setDiscountType] = useState('amount')
  const [discountValue, setDiscountValue] = useState('')
  const [payment, setPayment] = useState('cash')
  const [received, setReceived] = useState('')
  const [rxConfirmed, setRxConfirmed] = useState(false)

  const [quote, setQuote] = useState({ sig: null, data: null, error: '' })
  const [submitting, setSubmitting] = useState(false)
  const [saleError, setSaleError] = useState('')
  const [receipt, setReceipt] = useState(null)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [prescriptionId, setPrescriptionId] = useState(location.state?.prescriptionId || null)
  const [prescriptionLoaded, setPrescriptionLoaded] = useState(false)

  const debouncedQuery = useDebounce(query, 300)
  const modalOpen = Boolean(receipt) || cameraOpen

  useEffect(() => {
    const prescription = location.state?.prescriptionItems
    if (!prescription || prescriptionLoaded) return
    let active = true
    async function loadPrescription() {
      for (const item of prescription) {
        try {
          const product = await productsApi.get(item.productId)
          if (!active) return
          setCart((current) => {
            const existing = current.find((c) => c.productId === item.productId)
            if (existing) {
              return current.map((c) => c.productId === item.productId
                ? { ...c, qty: item.quantity }
                : c)
            }
            return [...current, {
              productId: product.id,
              label: nameOf(product),
              requiresPrescription: product.requiresPrescription,
              sellable: product.stock,
              hintPrice: product.batches?.[0]?.sellingPrice ?? null,
              qty: item.quantity,
            }]
          })
        } catch {
          flash('error', 'Could not load every drug from the waiting prescription')
          setPrescriptionId(null)
          return
        }
      }
      if (active) setPrescriptionLoaded(true)
    }
    loadPrescription()
    return () => { active = false }
  }, [location.state, prescriptionLoaded, flash])

  const flash = useCallback((type, text) => {
    setNotice({ type, text })
    beep(type === 'error' ? 'error' : 'ok')
  }, [])

  const focusInput = useCallback(() => inputRef.current?.focus(), [])

  /* ---------- cart ---------- */

  const addToCart = useCallback(
    (item) => {
      setCart((current) => {
        const existing = current.find((c) => c.productId === item.productId)
        if (!existing) return [...current, { ...item, qty: 1 }]
        if (existing.qty + 1 > existing.sellable) {
          flash('error', `Only ${existing.sellable} of ${existing.label} can be sold`)
          return current
        }
        return current.map((c) => (c.productId === item.productId ? { ...c, qty: c.qty + 1 } : c))
      })
      setSaleError('')
    },
    [flash],
  )

  const setQty = (productId, value) =>
    setCart((current) =>
      current.map((c) => {
        if (c.productId !== productId) return c
        const n = Math.max(1, Math.min(c.sellable, Math.floor(Number(value) || 1)))
        return { ...c, qty: n }
      }),
    )

  const removeItem = (productId) => setCart((current) => current.filter((c) => c.productId !== productId))

  function clearCart() {
    setCart([])
    setDiscountValue('')
    setReceived('')
    setRxConfirmed(false)
    setSaleError('')
    setLastScanned(null)
    focusInput()
  }

  /* ---------- finding products ---------- */

  const addFromLookup = useCallback(
    (data) => {
      const { product, sellBatch, sellableStock, hasExpiredStock } = data
      const label = nameOf(product)
      setLastScanned({
        label,
        category: product.category?.name,
        stock: sellableStock,
        price: sellBatch?.sellingPrice ?? null,
        expiry: sellBatch?.expiryDate ?? null,
        rx: product.requiresPrescription,
        expiredWarning: hasExpiredStock,
      })
      if (!sellBatch) {
        flash('error', `${label} is out of stock${hasExpiredStock ? ' (only expired stock is left)' : ''}`)
        return
      }
      addToCart({
        productId: product.id,
        label,
        requiresPrescription: product.requiresPrescription,
        sellable: sellableStock,
        hintPrice: sellBatch.sellingPrice,
      })
      flash('success', `${label} added`)
    },
    [addToCart, flash],
  )

  const addFromListItem = useCallback(
    (p) => {
      const label = nameOf(p)
      setLastScanned({
        label,
        category: p.category?.name,
        stock: p.sellableStock,
        price: p.sellingPrice,
        expiry: p.nearestExpiry,
        rx: p.requiresPrescription,
        expiredWarning: p.stock > p.sellableStock,
      })
      if (p.sellableStock <= 0) {
        flash('error', `${label} is out of stock`)
        return
      }
      addToCart({ productId: p.id, label, requiresPrescription: p.requiresPrescription, sellable: p.sellableStock, hintPrice: p.sellingPrice })
      flash('success', `${label} added`)
    },
    [addToCart, flash],
  )

  // Enter pressed (a scanner sends Enter after the code): try it as a barcode first, then as a name
  const lookupCode = useCallback(
    async (raw) => {
      const code = raw.trim()
      if (!code) return
      try {
        addFromLookup(await productsApi.byBarcode(code))
      } catch (err) {
        if (err.response?.status !== 404) {
          flash('error', errorMessage(err, 'Could not look up that code'))
          return
        }
        try {
          const found = await productsApi.list({ search: code, pageSize: 8 })
          if (found.items.length === 1) addFromListItem(found.items[0])
          else if (found.items.length > 1) {
            setQuery(code)
            setResults(found.items)
          } else flash('error', `No product found for "${code}"`)
        } catch (e) {
          flash('error', errorMessage(e, 'Could not search products'))
        }
      }
    },
    [addFromLookup, addFromListItem, flash],
  )

  async function onEnter() {
    const code = query
    setQuery('')
    setResults(null)
    await lookupCode(code)
    focusInput()
  }

  // Suggestions while typing a name
  useEffect(() => {
    const text = debouncedQuery.trim()
    if (text.length < 2) return undefined
    let active = true
    productsApi
      .list({ search: text, pageSize: 8 })
      .then((res) => {
        if (!active) return
        setResults(res.items)
        setSearching(false)
      })
      .catch(() => active && setSearching(false))
    return () => {
      active = false
    }
  }, [debouncedQuery])

  // A scanner types into whatever has focus. If nothing does, send the keys to the scan box.
  useEffect(() => {
    if (modalOpen) return undefined
    const onKey = (e) => {
      if (e.ctrlKey || e.altKey || e.metaKey || e.key.length !== 1) return
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON') return
      e.preventDefault()
      inputRef.current?.focus()
      setQuery((q) => q + e.key)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [modalOpen])

  useEffect(() => {
    focusInput()
  }, [focusInput])

  useEffect(() => {
    if (!notice) return undefined
    const timer = setTimeout(() => setNotice(null), 3500)
    return () => clearTimeout(timer)
  }, [notice])

  /* ---------- prices from the server ---------- */

  const discountPayload = useMemo(() => {
    const value = Number(discountValue)
    return value > 0 ? { type: discountType, value } : null
  }, [discountType, discountValue])

  const sig = useMemo(
    () => JSON.stringify({ items: cart.map((c) => [c.productId, c.qty]), d: discountPayload }),
    [cart, discountPayload],
  )

  useEffect(() => {
    if (cart.length === 0) return undefined
    let active = true
    const timer = setTimeout(() => {
      salesApi
        .quote({ items: cart.map((c) => ({ productId: c.productId, quantity: c.qty })), discount: discountPayload })
        .then((data) => active && setQuote({ sig, data, error: '' }))
        .catch((err) => active && setQuote({ sig, data: null, error: errorMessage(err, 'Could not price the cart') }))
    }, 250)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [sig, cart, discountPayload])

  const fresh = quote.sig === sig && cart.length > 0
  const q = fresh ? quote.data : null
  const pricing = cart.length > 0 && !fresh
  const lineFor = (id) => q?.lines.find((l) => l.productId === id)

  const estimate = cart.reduce((sum, c) => sum + c.hintPrice * c.qty, 0)
  const total = q ? q.total : 0
  const receivedNum = received === '' ? null : Number(received)
  const short = payment === 'cash' && receivedNum !== null && receivedNum < total
  const change = payment === 'cash' && receivedNum !== null && receivedNum >= total ? receivedNum - total : 0
  const needsRx = Boolean(q?.needsRx)
  const problems = q?.problems || []

  const canComplete =
    fresh && q && problems.length === 0 && !q.discountError && !short && (!needsRx || rxConfirmed) && !submitting && cart.length > 0

  async function completeSale() {
    if (!canComplete) return
    setSubmitting(true)
    setSaleError('')
    // The same cart retried gets the same reference, so a double click can never record two sales
    if (attemptRef.current.sig !== sig + payment + received) {
      attemptRef.current = { sig: sig + payment + received, ref: crypto.randomUUID() }
    }
    try {
      const sale = await salesApi.create({
        items: cart.map((c) => ({ productId: c.productId, quantity: c.qty })),
        discount: discountPayload,
        paymentMethod: payment,
        amountTendered: payment === 'cash' && receivedNum !== null ? receivedNum : null,
        rxConfirmed,
        clientRef: attemptRef.current.ref,
        prescriptionId,
      })
      beep('ok')
      setReceipt(sale)
      setCart([])
      setDiscountValue('')
      setReceived('')
      setRxConfirmed(false)
      setLastScanned(null)
    } catch (err) {
      setSaleError(errorMessage(err, 'The sale could not be saved. Nothing was charged.'))
      beep('error')
      // Stock may have changed: refresh the prices
      setQuote({ sig: null, data: null, error: '' })
    } finally {
      setSubmitting(false)
    }
  }

  const pickScanner = () => {
    setMode('scanner')
    focusInput()
  }
  const pickManual = () => {
    setMode('manual')
    focusInput()
  }
  const openCamera = () => setCameraOpen(true)

  const closeReceipt = () => {
    setReceipt(null)
    setTimeout(focusInput, 50)
  }

  return (
    <div>
      {/* Scan bar */}
      <div className="flex flex-wrap items-start gap-3">
        <div className="relative min-w-[16rem] flex-1">
          <div className="flex items-center gap-3 rounded-2xl border border-slate-300 bg-white px-4 py-3.5 shadow-sm focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-100">
            <Barcode size={28} className="text-ink" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                if (e.target.value.trim().length < 2) setResults(null)
                else setSearching(true)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  onEnter()
                }
                if (e.key === 'Escape') {
                  setResults(null)
                  setQuery('')
                }
              }}
              placeholder={mode === 'scanner' ? 'Scan barcode or search drug...' : 'Type drug name or barcode...'}
              aria-label="Scan or search drug"
              autoComplete="off"
              className="w-full bg-transparent text-lg text-ink outline-none placeholder:text-slate-400"
            />
            {searching && <Loader2 size={20} className="animate-spin text-slate-400" />}
          </div>

          {results && (
            <ul role="listbox" className="absolute z-30 mt-2 max-h-80 w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
              {results.length === 0 ? (
                <li className="px-4 py-3 text-slate-500">No products found</li>
              ) : (
                results.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      role="option"
                      disabled={p.sellableStock <= 0}
                      onClick={() => {
                        addFromListItem(p)
                        setQuery('')
                        setResults(null)
                        focusInput()
                      }}
                      className="flex w-full items-center justify-between gap-3 rounded-xl px-4 py-2.5 text-left hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span>
                        <span className="font-semibold text-ink">{nameOf(p)}</span>
                        {p.genericName && <span className="ml-2 text-sm text-slate-500">{p.genericName}</span>}
                      </span>
                      <span className="whitespace-nowrap text-sm">
                        <span className="font-semibold">{p.sellingPrice === null ? '-' : formatMoney(p.sellingPrice)}</span>
                        <span className={`ml-3 ${p.sellableStock <= 0 ? 'text-red-600' : 'text-slate-500'}`}>
                          {p.sellableStock <= 0 ? 'Out of stock' : `${formatInt(p.sellableStock)} in stock`}
                        </span>
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>

        <ModeButton active={mode === 'scanner'} icon={ScanLine} label="Scanner" onClick={pickScanner} />
        <ModeButton active={false} icon={Camera} label="Camera" onClick={openCamera} />
        <ModeButton active={mode === 'manual'} icon={Keyboard} label="Manual" onClick={pickManual} />
        <button
          type="button"
          aria-label={sound ? 'Mute scan sounds' : 'Unmute scan sounds'}
          onClick={() => {
            setSound(!sound)
            setSoundEnabled(!sound)
          }}
          className="rounded-2xl p-3.5 text-slate-500 hover:bg-white"
        >
          {sound ? <Volume2 size={22} /> : <VolumeX size={22} />}
        </button>
      </div>

      {notice && (
        <div
          role="status"
          className={`mt-3 rounded-xl px-4 py-2.5 text-sm font-semibold ${notice.type === 'error' ? 'border border-red-200 bg-red-50 text-red-700' : 'border border-brand-200 bg-brand-50 text-brand-800'}`}
        >
          {notice.text}
        </div>
      )}

      <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_24rem]">
        {/* Cart */}
        <section className="min-w-0 self-start rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left sm:min-w-[560px]">
              <thead>
                <tr className="bg-slate-50 text-sm font-semibold text-slate-700">
                  <th className="hidden rounded-tl-2xl px-4 py-3 sm:table-cell">#</th>
                  <th className="px-2 py-3 sm:px-3">Drug Name</th>
                  <th className="px-2 py-3 sm:px-3 text-center">Qty</th>
                  <th className="hidden px-2 py-3 sm:px-3 text-right sm:table-cell">Unit Price</th>
                  <th className="px-2 py-3 sm:px-3 text-right">Total</th>
                  <th className="rounded-tr-2xl px-2 py-3 sm:px-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cart.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-20 text-center">
                      <Package size={40} className="mx-auto text-slate-300" />
                      <div className="mt-3 text-lg font-semibold text-ink">The cart is empty</div>
                      <div className="mt-1 text-sm text-slate-500">Scan a barcode, use the camera, or type a drug name above.</div>
                    </td>
                  </tr>
                ) : (
                  cart.map((c, i) => {
                    const line = lineFor(c.productId)
                    const problem = problems.find((p) => p.productId === c.productId)
                    return (
                      <tr key={c.productId} className={problem ? 'bg-red-50' : ''}>
                        <td className="hidden px-4 py-3 text-slate-500 sm:table-cell">{i + 1}</td>
                        <td className="px-2 py-3 sm:px-3">
                          <div className="font-semibold text-ink">
                            {c.label}
                            {c.requiresPrescription && (
                              <span className="ml-2 rounded bg-rose-100 px-1.5 py-0.5 align-middle text-[11px] font-bold text-rose-700">Rx</span>
                            )}
                          </div>
                          {problem && <div className="mt-0.5 text-sm text-red-700">{problem.message}</div>}
                        </td>
                        <td className="px-2 py-3 sm:px-3">
                          <div className="mx-auto flex w-32 items-center sm:w-36 justify-between rounded-xl border border-slate-200 bg-slate-50">
                            <button type="button" aria-label={`Decrease ${c.label}`} onClick={() => setQty(c.productId, c.qty - 1)} className="rounded-l-xl p-2.5 hover:bg-slate-100">
                              <Minus size={18} />
                            </button>
                            <input
                              aria-label={`Quantity of ${c.label}`}
                              type="number"
                              min="1"
                              max={c.sellable}
                              value={c.qty}
                              onChange={(e) => setQty(c.productId, e.target.value)}
                              className="w-10 bg-transparent text-center text-lg font-semibold outline-none sm:w-12"
                            />
                            <button type="button" aria-label={`Increase ${c.label}`} onClick={() => setQty(c.productId, c.qty + 1)} className="rounded-r-xl p-2.5 hover:bg-slate-100">
                              <Plus size={18} />
                            </button>
                          </div>
                        </td>
                        <td className="hidden px-2 py-3 sm:px-3 text-right sm:table-cell">{formatMoney(line ? line.unitPrice : c.hintPrice)}</td>
                        <td className="px-2 py-3 sm:px-3 text-right font-semibold">{formatMoney(line ? line.lineTotal : c.hintPrice * c.qty)}</td>
                        <td className="px-2 py-3 sm:px-3 text-right">
                          <button type="button" aria-label={`Remove ${c.label}`} onClick={() => removeItem(c.productId)} className="rounded-lg p-2 text-red-500 hover:bg-red-50">
                            <Trash2 size={18} />
                          </button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
          {cart.length > 0 && (
            <div className="border-t border-slate-100 p-4">
              <button type="button" onClick={clearCart} className="flex items-center gap-2 rounded-xl bg-slate-100 px-5 py-3 font-semibold text-ink hover:bg-slate-200">
                <Trash2 size={18} /> Clear Cart
              </button>
            </div>
          )}
        </section>

        {/* Right column: stays in view so the Complete Sale button never scrolls away */}
        <div className="space-y-5 xl:sticky xl:top-[4.75rem] xl:max-h-[calc(100vh-5.5rem)] xl:self-start xl:overflow-y-auto xl:pr-1">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            {lastScanned ? (
              <div className="flex gap-4">
                <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-500">
                  <Package size={44} />
                </div>
                <div className="min-w-0">
                  <div className="text-xl font-extrabold leading-tight text-ink">{lastScanned.label}</div>
                  {lastScanned.category && (
                    <span className="mt-1 inline-block rounded-lg bg-brand-100 px-2.5 py-0.5 text-sm font-medium text-brand-800">{lastScanned.category}</span>
                  )}
                  <div className="mt-2 text-sm text-slate-600">
                    Stock left:{' '}
                    <span className={`ml-1 rounded-lg px-2 py-0.5 font-semibold ${lastScanned.stock > 0 ? 'bg-brand-100 text-brand-800' : 'bg-red-100 text-red-700'}`}>
                      {formatInt(lastScanned.stock)} units
                    </span>
                  </div>
                  <div className="mt-1 text-2xl font-extrabold text-ink">{lastScanned.price === null ? '-' : formatMoney(lastScanned.price)}</div>
                  {lastScanned.expiry && <div className="text-xs text-slate-500">Expires {formatDate(lastScanned.expiry)}</div>}
                </div>
              </div>
            ) : (
              <div className="py-6 text-center text-slate-500">
                <ScanLine size={32} className="mx-auto text-slate-300" />
                <div className="mt-2 text-sm">Scan a drug to see its details here.</div>
              </div>
            )}
            {lastScanned?.rx && (
              <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-800">Prescription only. Check the prescription before selling.</div>
            )}
            {lastScanned?.expiredWarning && (
              <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
                <TriangleAlert size={16} className="mt-0.5 shrink-0" /> Some stock of this drug has expired and will not be sold. Remove it from the shelf.
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-3.5 text-lg font-bold text-ink">
              <Calculator size={22} /> Sale Summary
            </div>
            <div className="space-y-3 px-5 py-4">
              <div className="flex justify-between text-lg">
                <span>Subtotal</span>
                <span className="font-semibold">{q ? formatMoney(q.subtotal) : pricing ? formatMoney(estimate) : formatMoney(0)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-lg">Discount</span>
                <div className="flex items-center gap-2">
                  <input
                    aria-label="Discount amount"
                    type="number"
                    min="0"
                    value={discountValue}
                    onChange={(e) => setDiscountValue(e.target.value)}
                    placeholder="0.00"
                    className="w-28 rounded-xl border border-slate-300 px-3 py-2 text-right outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
                  />
                  <button
                    type="button"
                    onClick={() => setDiscountType((t) => (t === 'amount' ? 'percent' : 'amount'))}
                    aria-label={`Discount type: ${discountType === 'amount' ? 'naira' : 'percent'}. Click to switch.`}
                    className="h-10 w-10 rounded-xl bg-brand-100 text-lg font-bold text-brand-700 hover:bg-brand-200"
                  >
                    {discountType === 'amount' ? '₦' : '%'}
                  </button>
                </div>
              </div>
              {q?.discountError && <div className="text-sm text-red-700">{q.discountError}</div>}
              {q && q.discount > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>Discount applied</span>
                  <span>-{formatMoney(q.discount)}</span>
                </div>
              )}
              {q && q.tax > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>VAT ({q.taxRate}%)</span>
                  <span>{formatMoney(q.tax)}</span>
                </div>
              )}
              <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                <span className="text-2xl font-extrabold text-ink">Total</span>
                <span className="text-3xl font-extrabold text-brand-600" data-testid="total">
                  {pricing ? <Loader2 size={26} className="animate-spin" /> : formatMoney(total)}
                </span>
              </div>

              <div>
                <div className="mb-2 text-sm font-semibold text-ink">Payment Type</div>
                <div className="grid grid-cols-4 gap-2">
                  {PAYMENTS.map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setPayment(id)}
                      aria-pressed={payment === id}
                      className={`flex flex-col items-center gap-1 rounded-xl border px-1 py-2.5 text-xs font-semibold ${payment === id ? 'border-brand-500 bg-brand-500 text-white' : 'border-slate-200 bg-slate-50 text-ink hover:bg-slate-100'}`}
                    >
                      <Icon size={20} />
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {payment === 'cash' && (
                <div className="rounded-xl bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <label htmlFor="received" className="text-sm font-semibold text-ink">
                      Amount received
                    </label>
                    <input
                      id="received"
                      type="number"
                      min="0"
                      value={received}
                      onChange={(e) => setReceived(e.target.value)}
                      placeholder={q ? String(total) : ''}
                      className="w-36 rounded-xl border border-slate-300 bg-white px-3 py-2 text-right outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
                    />
                  </div>
                  {short && <div className="mt-2 text-right text-sm font-semibold text-red-700">Short by {formatMoney(total - receivedNum)}</div>}
                  {change > 0 && <div className="mt-2 text-right text-sm font-semibold text-brand-700">Change: {formatMoney(change)}</div>}
                </div>
              )}

              {needsRx && (
                <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-rose-50 p-3 text-sm font-medium text-rose-900">
                  <input type="checkbox" checked={rxConfirmed} onChange={(e) => setRxConfirmed(e.target.checked)} className="mt-0.5 h-5 w-5 accent-rose-600" />
                  I have checked the prescription for the Rx item(s) in this sale.
                </label>
              )}

              {(saleError || quote.error) && (
                <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
                  <TriangleAlert size={16} className="mt-0.5 shrink-0" /> {saleError || quote.error}
                </div>
              )}
              {problems.length > 0 && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">Fix the items marked in red before completing the sale.</div>
              )}

              <button
                type="button"
                onClick={completeSale}
                disabled={!canComplete}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-500 px-5 py-4 text-lg font-bold text-white shadow-sm hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? <Loader2 size={22} className="animate-spin" /> : <Printer size={22} />}
                Complete Sale and Print Receipt
              </button>
            </div>
          </section>
        </div>
      </div>

      {cameraOpen && (
        <CameraScanner
          lastMessage={notice}
          onDetected={lookupCode}
          onClose={() => {
            setCameraOpen(false)
            setTimeout(focusInput, 50)
          }}
        />
      )}
      {receipt && <ReceiptDialog sale={receipt} onClose={closeReceipt} />}
    </div>
  )
}
