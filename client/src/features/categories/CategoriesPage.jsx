import { useCallback, useEffect, useState } from 'react'
import { Check, Loader2, Pencil, Plus, Tag, Trash2, TriangleAlert, X } from 'lucide-react'
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx'
import { categoriesApi } from '../../api/catalog.api.js'
import { errorMessage } from '../../api/client.js'

const inputClass =
  'rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-ink outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100'

export default function CategoriesPage() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState(null) // { id, name }
  const [toDelete, setToDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  useEffect(() => {
    let active = true
    categoriesApi
      .list()
      .then((res) => active && setItems(res.categories))
      .catch((err) => active && setError(errorMessage(err, 'Could not load categories.')))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [reloadKey])

  async function add(event) {
    event.preventDefault()
    if (!newName.trim() || adding) return
    setAdding(true)
    setError('')
    try {
      await categoriesApi.create(newName.trim())
      setNewName('')
      reload()
    } catch (err) {
      setError(errorMessage(err, 'Could not add the category.'))
    } finally {
      setAdding(false)
    }
  }

  async function saveRename() {
    if (!editing.name.trim()) return
    setError('')
    try {
      await categoriesApi.rename(editing.id, editing.name.trim())
      setEditing(null)
      reload()
    } catch (err) {
      setError(errorMessage(err, 'Could not rename the category.'))
    }
  }

  async function confirmDelete() {
    setDeleting(true)
    setDeleteError('')
    try {
      await categoriesApi.remove(toDelete.id)
      setToDelete(null)
      reload()
    } catch (err) {
      setDeleteError(errorMessage(err, 'Could not delete the category.'))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div>
      <h1 className="text-3xl font-extrabold tracking-tight text-ink">Categories</h1>
      <p className="mt-1 text-slate-600">Group your products so they are easy to find and report on.</p>

      <form onSubmit={add} className="mt-6 flex flex-wrap gap-3">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          maxLength={60}
          placeholder="New category name, e.g. Antibiotics"
          aria-label="New category name"
          className={`${inputClass} min-w-[16rem] flex-1 sm:max-w-md`}
        />
        <button
          type="submit"
          disabled={!newName.trim() || adding}
          className="flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-2.5 font-bold text-white hover:bg-brand-600 disabled:opacity-50"
        >
          {adding ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />} Add Category
        </button>
      </form>

      {error && (
        <div role="alert" className="mt-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <TriangleAlert size={18} /> {error}
        </div>
      )}

      <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="py-16 text-center">
            <Loader2 className="mx-auto animate-spin text-brand-500" size={30} />
          </div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center text-slate-500">
            <Tag size={34} className="mx-auto text-slate-300" />
            <div className="mt-3 font-semibold text-ink">No categories yet</div>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                {editing?.id === c.id ? (
                  <input
                    autoFocus
                    value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveRename()
                      if (e.key === 'Escape') setEditing(null)
                    }}
                    maxLength={60}
                    aria-label="Category name"
                    className={`${inputClass} flex-1 sm:max-w-sm`}
                  />
                ) : (
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-ink">{c.name}</span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-sm text-slate-600">
                      {c.productCount} {c.productCount === 1 ? 'product' : 'products'}
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-1">
                  {editing?.id === c.id ? (
                    <>
                      <button type="button" aria-label="Save name" onClick={saveRename} className="rounded-lg p-2 text-brand-600 hover:bg-brand-50">
                        <Check size={20} />
                      </button>
                      <button type="button" aria-label="Cancel rename" onClick={() => setEditing(null)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
                        <X size={20} />
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" aria-label={`Rename ${c.name}`} onClick={() => setEditing({ id: c.id, name: c.name })} className="rounded-lg p-2 text-brand-600 hover:bg-brand-50">
                        <Pencil size={18} />
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete ${c.name}`}
                        onClick={() => {
                          setDeleteError('')
                          setToDelete(c)
                        }}
                        className="rounded-lg p-2 text-red-500 hover:bg-red-50"
                      >
                        <Trash2 size={18} />
                      </button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {toDelete && (
        <ConfirmDialog
          title="Delete category?"
          message={`"${toDelete.name}" will be removed. Categories that still contain products cannot be deleted.`}
          busy={deleting}
          error={deleteError}
          onConfirm={confirmDelete}
          onCancel={() => setToDelete(null)}
        />
      )}
    </div>
  )
}
