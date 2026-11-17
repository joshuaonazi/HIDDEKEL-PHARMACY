import { useEffect, useRef, useState } from 'react'
import { Boxes, Layers, Loader2, Plus, Save, Trash2, TriangleAlert, X } from 'lucide-react'
import SlideOver from '../../components/ui/SlideOver.jsx'
import { errorMessage } from '../../api/client.js'
import { productsApi } from '../../api/catalog.api.js'

const FORMS = ['Tablet', 'Capsule', 'Syrup', 'Suspension', 'Injection', 'Cream', 'Ointment', 'Drops', 'Sachet', 'Lotion', 'Inhaler', 'Suppository']

const emptyForm = {
  itemType: 'drug',
  name: '',
  genericName: '',
  strength: '',
  dosageForm: '',
  categoryId: '',
  barcodes: [],
  requiresPrescription: false,
  reorderLevel: '0',
}

let keyCounter = 0
const newBatch = () => ({ key: `new-${(keyCounter += 1)}`, id: null, batchNo: '', expiryDate: '', quantity: '', costPrice: '', sellingPrice: '', qtyRemaining: null })

const inputClass =
  'w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-ink outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 disabled:bg-slate-100 disabled:text-slate-500'

function Field({ label, required, children, hint }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-ink">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  )
}

export default function ProductPanel({ productId, categories, onClose, onSaved }) {
  const isEdit = Boolean(productId)
  const [form, setForm] = useState(emptyForm)
  const [batches, setBatches] = useState([])
  const [barcodeDraft, setBarcodeDraft] = useState('')
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const errorRef = useRef(null)

  // Bring the message into view when the form is scrolled down
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [error])

  useEffect(() => {
    if (!isEdit) return undefined
    let active = true
    productsApi
      .get(productId)
      .then((p) => {
        if (!active) return
        setForm({
          itemType: p.itemType,
          name: p.name,
          genericName: p.genericName || '',
          strength: p.strength || '',
          dosageForm: p.dosageForm || '',
          categoryId: p.category?.id || '',
          barcodes: p.barcodes,
          requiresPrescription: p.requiresPrescription,
          reorderLevel: String(p.reorderLevel),
        })
        setBatches(
          p.batches.map((b) => ({
            key: b.id,
            id: b.id,
            batchNo: b.batchNo || '',
            expiryDate: b.expiryDate || '',
            quantity: String(b.qtyRemaining),
            qtyRemaining: b.qtyRemaining,
            costPrice: String(b.costPrice ?? ''),
            sellingPrice: String(b.sellingPrice ?? ''),
          })),
        )
      })
      .catch((err) => active && setError(errorMessage(err, 'Could not load this product.')))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [isEdit, productId])

  const isDrug = form.itemType === 'drug'
  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }))

  function addBarcode(raw) {
    const code = raw.trim()
    if (!code) return
    setForm((f) => (f.barcodes.includes(code) ? f : { ...f, barcodes: [...f.barcodes, code] }))
    setBarcodeDraft('')
  }

  const updateBatch = (key, field, value) =>
    setBatches((rows) => rows.map((r) => (r.key === key ? { ...r, [field]: value } : r)))

  async function handleSubmit(event) {
    event.preventDefault()
    if (saving) return
    setError('')

    if (!form.name.trim()) return setError('Enter the product name.')
    if (!form.categoryId) return setError('Choose a category. Create one under Categories if the list is empty.')

    const barcodes = barcodeDraft.trim() && !form.barcodes.includes(barcodeDraft.trim())
      ? [...form.barcodes, barcodeDraft.trim()]
      : form.barcodes

    for (const [i, b] of batches.entries()) {
      if (b.costPrice === '' || b.sellingPrice === '') return setError(`Batch ${i + 1}: enter both the cost price and the selling price.`)
      if (Number(b.costPrice) < 0 || Number(b.sellingPrice) < 0) return setError(`Batch ${i + 1}: prices cannot be negative.`)
      if (!b.id && (b.quantity === '' || !Number.isInteger(Number(b.quantity)) || Number(b.quantity) < 0)) {
        return setError(`Batch ${i + 1}: enter a whole-number quantity.`)
      }
    }

    const payload = {
      itemType: form.itemType,
      name: form.name.trim(),
      genericName: isDrug ? form.genericName.trim() : '',
      strength: isDrug ? form.strength.trim() : '',
      dosageForm: isDrug ? form.dosageForm.trim() : '',
      categoryId: form.categoryId,
      requiresPrescription: isDrug && form.requiresPrescription,
      reorderLevel: Number(form.reorderLevel) || 0,
      barcodes,
      batches: batches.map((b) => ({
        ...(b.id ? { id: b.id } : {}),
        batchNo: b.batchNo.trim(),
        expiryDate: b.expiryDate,
        quantity: b.id ? 0 : Number(b.quantity),
        costPrice: Number(b.costPrice),
        sellingPrice: Number(b.sellingPrice),
      })),
    }

    setSaving(true)
    try {
      if (isEdit) await productsApi.update(productId, payload)
      else await productsApi.create(payload)
      onSaved()
    } catch (err) {
      setError(errorMessage(err, 'Could not save the product.'))
      setSaving(false)
    }
  }

  return (
    <SlideOver
      title={isEdit ? 'Edit Product' : 'Add Product'}
      icon={Boxes}
      onClose={onClose}
      footer={
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center gap-2 rounded-xl border border-brand-500 px-5 py-3 font-bold text-brand-600 hover:bg-brand-50"
          >
            <X size={20} /> Cancel
          </button>
          <button
            type="submit"
            form="product-form"
            disabled={saving || loading}
            className="flex items-center justify-center gap-2 rounded-xl bg-brand-500 px-5 py-3 font-bold text-white hover:bg-brand-600 disabled:opacity-60"
          >
            {saving ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
            Save Product
          </button>
        </div>
      }
    >
      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="animate-spin text-brand-500" size={32} />
        </div>
      ) : (
        <form id="product-form" onSubmit={handleSubmit} noValidate className="space-y-5">
          {error && (
            <div ref={errorRef} role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <TriangleAlert size={18} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="inline-flex rounded-xl bg-slate-100 p-1" role="group" aria-label="Item type">
            {[
              ['drug', 'Drug'],
              ['general', 'General item'],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setForm((f) => ({ ...f, itemType: value }))}
                className={`rounded-lg px-4 py-1.5 text-sm font-semibold ${form.itemType === value ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-600'}`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={isDrug ? 'Brand Name' : 'Item Name'} required>
              <input className={inputClass} value={form.name} onChange={set('name')} placeholder={isDrug ? 'e.g. Panadol' : 'e.g. Hand Sanitizer 100ml'} />
            </Field>
            {isDrug && (
              <Field label="Generic Name">
                <input className={inputClass} value={form.genericName} onChange={set('genericName')} placeholder="e.g. Paracetamol" />
              </Field>
            )}
            {isDrug && (
              <Field label="Strength">
                <input className={inputClass} value={form.strength} onChange={set('strength')} placeholder="e.g. 500mg" />
              </Field>
            )}
            {isDrug && (
              <Field label="Form">
                <input className={inputClass} list="dosage-forms" value={form.dosageForm} onChange={set('dosageForm')} placeholder="e.g. Tablet" />
                <datalist id="dosage-forms">
                  {FORMS.map((f) => (
                    <option key={f} value={f} />
                  ))}
                </datalist>
              </Field>
            )}
            <Field label="Category" required>
              <select className={inputClass} value={form.categoryId} onChange={set('categoryId')}>
                <option value="">Select a category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Low-stock alert at" hint="Shows “Low Stock” when quantity falls to this number.">
              <input className={inputClass} type="number" min="0" value={form.reorderLevel} onChange={set('reorderLevel')} />
            </Field>
          </div>

          <Field label="Barcodes" hint="Click here and scan the pack with your scanner, or type the code and press Enter.">
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-100">
              {form.barcodes.map((code) => (
                <span key={code} className="flex items-center gap-1 rounded-lg bg-brand-100 px-2.5 py-1 text-sm font-medium text-brand-800">
                  {code}
                  <button
                    type="button"
                    aria-label={`Remove barcode ${code}`}
                    onClick={() => setForm((f) => ({ ...f, barcodes: f.barcodes.filter((c) => c !== code) }))}
                  >
                    <X size={14} />
                  </button>
                </span>
              ))}
              <input
                value={barcodeDraft}
                onChange={(e) => setBarcodeDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault()
                    addBarcode(barcodeDraft)
                  }
                }}
                onBlur={() => addBarcode(barcodeDraft)}
                placeholder={form.barcodes.length ? 'Add another' : 'Scan or type barcode'}
                className="min-w-[10rem] flex-1 bg-transparent py-1 outline-none"
              />
            </div>
          </Field>

          {isDrug && (
            <label className="flex cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                role="switch"
                checked={form.requiresPrescription}
                onChange={(e) => setForm((f) => ({ ...f, requiresPrescription: e.target.checked }))}
                className="h-5 w-5 accent-brand-500"
              />
              <span className="font-semibold text-ink">Prescription only</span>
              <span className="text-sm text-slate-500">{form.requiresPrescription ? 'Yes' : 'No'}</span>
            </label>
          )}

          <div className="border-t border-slate-200 pt-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-lg font-bold text-ink">
                <Layers size={22} className="text-brand-600" /> Batches
              </h3>
              <button
                type="button"
                onClick={() => setBatches((rows) => [...rows, newBatch()])}
                className="flex items-center gap-1.5 rounded-xl border border-brand-500 px-4 py-2 text-sm font-bold text-brand-600 hover:bg-brand-50"
              >
                <Plus size={18} /> Add Batch
              </button>
            </div>

            {batches.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
                No stock yet. Add a batch to record quantity, expiry date and prices. You can also add stock later with Receive Stock.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                    <tr>
                      <th className="px-3 py-2.5">Batch No.</th>
                      <th className="px-3 py-2.5">Expiry Date</th>
                      <th className="px-3 py-2.5">{isEdit ? 'Qty left' : 'Quantity'}</th>
                      <th className="px-3 py-2.5">Cost Price</th>
                      <th className="px-3 py-2.5">Selling Price</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {batches.map((b) => (
                      <tr key={b.key}>
                        <td className="px-2 py-2">
                          <input aria-label="Batch number" className={`${inputClass} !px-2.5 !py-1.5`} value={b.batchNo} onChange={(e) => updateBatch(b.key, 'batchNo', e.target.value)} />
                        </td>
                        <td className="px-2 py-2">
                          <input aria-label="Expiry date" type="date" className={`${inputClass} !px-2.5 !py-1.5`} value={b.expiryDate} onChange={(e) => updateBatch(b.key, 'expiryDate', e.target.value)} />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            aria-label="Quantity"
                            type="number"
                            min="0"
                            disabled={Boolean(b.id)}
                            title={b.id ? 'Stock changes through Receive Stock or stock adjustments' : undefined}
                            className={`${inputClass} !px-2.5 !py-1.5`}
                            value={b.quantity}
                            onChange={(e) => updateBatch(b.key, 'quantity', e.target.value)}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input aria-label="Cost price" type="number" min="0" step="0.01" className={`${inputClass} !px-2.5 !py-1.5`} value={b.costPrice} onChange={(e) => updateBatch(b.key, 'costPrice', e.target.value)} />
                        </td>
                        <td className="px-2 py-2">
                          <input aria-label="Selling price" type="number" min="0" step="0.01" className={`${inputClass} !px-2.5 !py-1.5`} value={b.sellingPrice} onChange={(e) => updateBatch(b.key, 'sellingPrice', e.target.value)} />
                        </td>
                        <td className="px-1 py-2 text-center">
                          {!b.id && (
                            <button type="button" aria-label="Remove batch" onClick={() => setBatches((rows) => rows.filter((r) => r.key !== b.key))} className="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600">
                              <Trash2 size={16} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </form>
      )}
    </SlideOver>
  )
}
