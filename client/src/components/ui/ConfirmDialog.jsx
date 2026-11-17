import { Loader2 } from 'lucide-react'
import Modal from './Modal.jsx'

export default function ConfirmDialog({ title, message, confirmLabel = 'Delete', tone = 'danger', busy = false, error = '', onConfirm, onCancel }) {
  return (
    <Modal
      title={title}
      onClose={busy ? () => {} : onCancel}
      footer={
        <>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-xl border border-slate-300 px-5 py-2.5 font-semibold text-ink hover:bg-slate-50 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`flex items-center gap-2 rounded-xl px-5 py-2.5 font-semibold text-white disabled:opacity-60 ${tone === 'danger' ? 'bg-red-600 hover:bg-red-700' : 'bg-brand-500 hover:bg-brand-600'}`}
          >
            {busy && <Loader2 size={18} className="animate-spin" />}
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-slate-700">{message}</p>
      {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
    </Modal>
  )
}
