import { useEffect } from 'react'
import { X } from 'lucide-react'

export default function SlideOver({ title, icon: Icon, onClose, children, footer }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Close" className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-3xl flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between bg-brand-500 px-6 py-4 text-white">
          <div className="flex items-center gap-3 text-xl font-bold">
            {Icon && <Icon size={24} />}
            {title}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 hover:bg-white/15">
            <X size={24} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="border-t border-slate-200 bg-white px-6 py-4">{footer}</div>}
      </div>
    </div>
  )
}
