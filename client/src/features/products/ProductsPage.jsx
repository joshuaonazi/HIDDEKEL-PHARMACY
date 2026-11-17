import { useCallback, useEffect, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Filter,
  Loader2,
  Package,
  PackagePlus,
  Pencil,
  Pill,
  Plus,
  Search,
  Trash2,
  TriangleAlert,
  Upload,
} from 'lucide-react'
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx'
import { categoriesApi, productsApi } from '../../api/catalog.api.js'
import { errorMessage } from '../../api/client.js'
import { useAuth } from '../../hooks/useAuth.js'
import { useDebounce } from '../../hooks/useDebounce.js'
import { formatInt, formatMoney } from '../../lib/format.js'
import ImportDialog from './ImportDialog.jsx'
import ProductPanel from './ProductPanel.jsx'
import StockImportDialog from './StockImportDialog.jsx'

const PAGE_SIZE = 10

const BADGES = [
  'bg-emerald-100 text-emerald-700',
  'bg-sky-100 text-sky-700',
  'bg-violet-100 text-violet-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
  'bg-teal-100 text-teal-700',
  'bg-orange-100 text-orange-700',
  'bg-indigo-100 text-indigo-700',
]
const badgeFor = (name = '') => BADGES[[...name].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % BADGES.length]

const STATUS = {
  in: { label: 'In Stock', className: 'bg-emerald-100 text-emerald-700' },
  low: { label: 'Low Stock', className: 'bg-amber-100 text-amber-700' },
  out: { label: 'Out of Stock', className: 'bg-red-100 text-red-700' },
}

const displayName = (p) =>
  p.strength && !p.name.toLowerCase().includes(p.strength.toLowerCase()) ? `${p.name} ${p.strength}` : p.name

const selectClass =
  'rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-ink outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100'

export default function ProductsPage() {
  const { user } = useAuth()
  const canEdit = user.role === 'admin' || user.role === 'manager'

  const [categories, setCategories] = useState([])
  const [totalProducts, setTotalProducts] = useState(0)
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState({ items: [], total: 0 })
  const [loadedKey, setLoadedKey] = useState(null)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  const [panel, setPanel] = useState(null) // { productId } (null id = new product)
  const [importOpen, setImportOpen] = useState(false)
  const [stockImportOpen, setStockImportOpen] = useState(false)
  const [toDelete, setToDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const debouncedSearch = useDebounce(search, 300)
  // Loading = the data on screen belongs to an older set of filters
  const requestKey = `${debouncedSearch}|${categoryId}|${status}|${page}|${reloadKey}`
  const loading = loadedKey !== requestKey
  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  useEffect(() => {
    let active = true
    categoriesApi
      .list()
      .then((res) => {
        if (!active) return
        setCategories(res.categories)
        setTotalProducts(res.totalProducts)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [reloadKey])

  useEffect(() => {
    let active = true
    productsApi
      .list({ search: debouncedSearch, categoryId, status, page, pageSize: PAGE_SIZE })
      .then((res) => {
        if (!active) return
        setData(res)
        setError('')
      })
      .catch((err) => active && setError(errorMessage(err, 'Could not load products.')))
      .finally(() => active && setLoadedKey(requestKey))
    return () => {
      active = false
    }
  }, [debouncedSearch, categoryId, status, page, reloadKey, requestKey])

  const pageCount = Math.max(1, Math.ceil(data.total / PAGE_SIZE))
  const firstShown = data.total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const lastShown = Math.min(page * PAGE_SIZE, data.total)
  const pageNumbers = Array.from({ length: Math.min(5, pageCount) }, (_, i) => {
    const start = Math.min(Math.max(1, page - 2), Math.max(1, pageCount - 4))
    return start + i
  })

  const pickCategory = (id) => {
    setCategoryId(id)
    setPage(1)
  }

  async function confirmDelete() {
    setDeleting(true)
    setDeleteError('')
    try {
      await productsApi.remove(toDelete.id)
      setToDelete(null)
      if (data.items.length === 1 && page > 1) setPage(page - 1)
      reload()
    } catch (err) {
      setDeleteError(errorMessage(err, 'Could not delete the product.'))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-ink">Product Catalogue</h1>
          <p className="mt-1 text-slate-600">Manage your pharmacy products</p>
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setPanel({ productId: null })}
              className="flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-3 font-bold text-white shadow-sm hover:bg-brand-600"
            >
              <Plus size={20} /> Add Product
            </button>
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="flex items-center gap-2 rounded-xl border border-brand-500 bg-white px-5 py-3 font-bold text-brand-600 hover:bg-brand-50"
            >
              <Upload size={20} /> Import from Excel
            </button>
            <button
              type="button"
              onClick={() => setStockImportOpen(true)}
              className="flex items-center gap-2 rounded-xl border border-brand-500 bg-white px-5 py-3 font-bold text-brand-600 hover:bg-brand-50"
            >
              <PackagePlus size={20} /> Import Stock
            </button>
          </div>
        )}
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[15rem_1fr]">
        {/* Category list */}
        <aside className="hidden self-start rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:block">
          <div className="mb-3 flex items-center justify-between px-2">
            <h2 className="text-lg font-bold text-ink">Categories</h2>
            <Filter size={18} className="text-slate-500" />
          </div>
          <ul className="space-y-1">
            <li>
              <button
                type="button"
                onClick={() => pickCategory('')}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left font-medium ${categoryId === '' ? 'bg-brand-100 text-brand-800' : 'text-ink hover:bg-slate-50'}`}
              >
                <span className="flex items-center gap-2">
                  <Package size={18} /> All Products
                </span>
                <span className="rounded-full bg-white/80 px-2 text-sm">{formatInt(totalProducts)}</span>
              </button>
            </li>
            {categories.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => pickCategory(c.id)}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left ${categoryId === c.id ? 'bg-brand-100 font-semibold text-brand-800' : 'text-ink hover:bg-slate-50'}`}
                >
                  <span className="truncate pr-2">{c.name}</span>
                  <span className="rounded-full bg-slate-100 px-2 text-sm text-slate-600">{formatInt(c.productCount)}</span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {/* Table */}
        <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap gap-3">
            <select aria-label="Filter by category" className={`${selectClass} lg:hidden`} value={categoryId} onChange={(e) => pickCategory(e.target.value)}>
              <option value="">All Categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter by stock status"
              className={selectClass}
              value={status}
              onChange={(e) => {
                setStatus(e.target.value)
                setPage(1)
              }}
            >
              <option value="">All Status</option>
              <option value="in">In Stock</option>
              <option value="low">Low Stock</option>
              <option value="out">Out of Stock</option>
            </select>
            <div className="flex min-w-[14rem] flex-1 items-center gap-3 rounded-xl border border-slate-300 px-4 py-2.5 focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-100">
              <Search size={20} className="text-slate-500" />
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
                placeholder="Search by name or barcode..."
                aria-label="Search products"
                className="w-full bg-transparent outline-none placeholder:text-slate-400"
              />
            </div>
          </div>

          {error && (
            <div role="alert" className="mt-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <TriangleAlert size={18} /> {error}
            </div>
          )}

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-[15px]">
              <thead>
                <tr className="bg-slate-50 text-sm font-semibold text-slate-700">
                  <th className="rounded-l-xl px-3 py-3">Name</th>
                  <th className="px-3 py-3">Generic Name</th>
                  <th className="px-3 py-3">Category</th>
                  <th className="px-3 py-3">Barcode</th>
                  <th className="px-3 py-3">Selling Price</th>
                  <th className="px-3 py-3">Stock</th>
                  <th className="px-3 py-3">Status</th>
                  {canEdit && <th className="sticky right-0 rounded-r-xl bg-slate-50 px-3 py-3">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading && data.items.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-16 text-center">
                      <Loader2 className="mx-auto animate-spin text-brand-500" size={30} />
                    </td>
                  </tr>
                ) : data.items.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-16 text-center">
                      <Pill size={36} className="mx-auto text-slate-300" />
                      <div className="mt-3 font-semibold text-ink">
                        {debouncedSearch || categoryId || status ? 'No products match your filters' : 'No products yet'}
                      </div>
                      {canEdit && !debouncedSearch && !categoryId && !status && (
                        <div className="mt-1 text-sm text-slate-500">Add one with the button above, or import a list from Excel.</div>
                      )}
                    </td>
                  </tr>
                ) : (
                  data.items.map((p) => {
                    const st = STATUS[p.status]
                    return (
                      <tr key={p.id} className="group hover:bg-slate-50/70">
                        <td className="px-3 py-3 font-semibold text-ink">
                          {displayName(p)}
                          {p.requiresPrescription && (
                            <span className="ml-2 rounded bg-rose-100 px-1.5 py-0.5 align-middle text-[11px] font-bold text-rose-700" title="Prescription only">
                              Rx
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-slate-700">{p.genericName || '-'}</td>
                        <td className="px-3 py-3">
                          {p.category ? (
                            <span className={`rounded-full px-3 py-1 text-sm font-medium ${badgeFor(p.category.name)}`}>{p.category.name}</span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="px-3 py-3 font-mono text-sm text-slate-700">{p.barcode || '-'}</td>
                        <td className="px-3 py-3 font-medium">{p.sellingPrice === null ? '-' : formatMoney(p.sellingPrice)}</td>
                        <td className="px-3 py-3">{formatInt(p.stock)}</td>
                        <td className="px-3 py-3">
                          <span className={`whitespace-nowrap rounded-full px-3 py-1 text-sm font-medium ${st.className}`}>{st.label}</span>
                        </td>
                        {canEdit && (
                          <td className="sticky right-0 bg-white px-3 py-3 group-hover:bg-slate-50">
                            <div className="flex items-center gap-1">
                              <button type="button" aria-label={`Edit ${p.name}`} onClick={() => setPanel({ productId: p.id })} className="rounded-lg p-2 text-brand-600 hover:bg-brand-50">
                                <Pencil size={18} />
                              </button>
                              <button
                                type="button"
                                aria-label={`Delete ${p.name}`}
                                onClick={() => {
                                  setDeleteError('')
                                  setToDelete(p)
                                }}
                                className="rounded-lg p-2 text-red-500 hover:bg-red-50"
                              >
                                <Trash2 size={18} />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 text-sm text-slate-600">
            <span>
              Showing {firstShown}&ndash;{lastShown} of {formatInt(data.total)} products
            </span>
            <div className="flex items-center gap-1">
              <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded-lg border border-slate-200 p-2 hover:bg-slate-50 disabled:opacity-40">
                <ChevronLeft size={18} />
              </button>
              {pageNumbers.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setPage(n)}
                  aria-current={n === page ? 'page' : undefined}
                  className={`h-9 min-w-9 rounded-lg px-2 font-semibold ${n === page ? 'bg-brand-500 text-white' : 'text-ink hover:bg-slate-100'}`}
                >
                  {n}
                </button>
              ))}
              <button type="button" aria-label="Next page" disabled={page >= pageCount} onClick={() => setPage(page + 1)} className="rounded-lg border border-slate-200 p-2 hover:bg-slate-50 disabled:opacity-40">
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        </section>
      </div>

      {panel && (
        <ProductPanel
          productId={panel.productId}
          categories={categories}
          onClose={() => setPanel(null)}
          onSaved={() => {
            setPanel(null)
            reload()
          }}
        />
      )}
      {importOpen && (
        <ImportDialog
          onClose={() => setImportOpen(false)}
          onDone={() => {
            setImportOpen(false)
            setPage(1)
            reload()
          }}
        />
      )}
      {stockImportOpen && (
        <StockImportDialog
          onClose={() => setStockImportOpen(false)}
          onDone={() => {
            setStockImportOpen(false)
            reload()
          }}
        />
      )}
      {toDelete && (
        <ConfirmDialog
          title="Delete product?"
          message={`"${displayName(toDelete)}" will be removed from the catalogue and can no longer be sold. Past sales keep their records.`}
          busy={deleting}
          error={deleteError}
          onConfirm={confirmDelete}
          onCancel={() => setToDelete(null)}
        />
      )}
    </div>
  )
}
