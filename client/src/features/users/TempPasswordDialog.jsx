import { useState } from 'react'
import { Check, Copy, ShieldAlert } from 'lucide-react'
import Modal from '../../components/ui/Modal.jsx'

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Older browsers or insecure pages: fall back to a hidden text box
    const box = document.createElement('textarea')
    box.value = text
    document.body.appendChild(box)
    box.select()
    const ok = document.execCommand('copy')
    box.remove()
    return ok
  }
}

// Shows the one-time temporary password after an account is created or reset
export default function TempPasswordDialog({ info, onClose }) {
  const [copied, setCopied] = useState(false)
  return (
    <Modal
      title={info.kind === 'created' ? 'Account created' : 'Password reset'}
      onClose={onClose}
      footer={
        <button type="button" onClick={onClose} className="rounded-xl bg-brand-500 px-6 py-2.5 font-bold text-white hover:bg-brand-600">
          I have noted it
        </button>
      }
    >
      <div className="space-y-4">
        <div>
          <div className="font-bold text-ink">{info.name}</div>
          <div className="text-sm text-slate-600">{info.email}</div>
        </div>
        <div>
          <div className="mb-1.5 text-sm font-semibold text-ink">Temporary password</div>
          <div className="flex items-center gap-2">
            <code data-testid="temp-password" className="flex-1 rounded-xl bg-slate-100 px-4 py-3 text-center font-mono text-2xl font-bold tracking-wider text-ink">
              {info.password}
            </code>
            <button
              type="button"
              onClick={async () => setCopied(await copyText(info.password))}
              className="flex items-center gap-2 rounded-xl border border-brand-500 px-4 py-3 font-semibold text-brand-600 hover:bg-brand-50"
            >
              {copied ? <Check size={18} /> : <Copy size={18} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
        <div className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          <ShieldAlert size={18} className="mt-0.5 shrink-0" />
          <span>
            This is shown <strong>only once</strong>. Give it to {info.name.split(' ')[0]} privately (in person or a direct message). They will be asked to
            choose their own password when they first sign in, and they are signed out of any other device.
          </span>
        </div>
      </div>
    </Modal>
  )
}
