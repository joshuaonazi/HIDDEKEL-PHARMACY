import { useEffect, useState } from 'react'
import { CheckCircle2, Plus, Printer } from 'lucide-react'
import Modal from '../../components/ui/Modal.jsx'
import { formatMoney } from '../../lib/format.js'
import { PrintRoot, ReceiptView } from './Receipt.jsx'

const AUTO_KEY = 'hp_autoprint'
const autoPrintOn = () => localStorage.getItem(AUTO_KEY) !== 'off'

export default function ReceiptDialog({ sale, onClose, isNewSale = true }) {
  const [auto, setAuto] = useState(autoPrintOn)

  // Open the print window as soon as a new sale is saved (not when reopening an old receipt)
  useEffect(() => {
    if (!isNewSale || !autoPrintOn()) return undefined
    const timer = setTimeout(() => window.print(), 350)
    return () => clearTimeout(timer)
  }, [isNewSale])

  return (
    <>
      <Modal
        title={isNewSale ? 'Sale completed' : 'Receipt'}
        onClose={onClose}
        footer={
          <>
            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-2 rounded-xl border border-brand-500 px-5 py-2.5 font-bold text-brand-600 hover:bg-brand-50"
            >
              <Printer size={18} /> Print receipt
            </button>
            <button
              type="button"
              onClick={onClose}
              autoFocus
              className="flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-2.5 font-bold text-white hover:bg-brand-600"
            >
              <Plus size={18} /> {isNewSale ? 'New sale' : 'Close'}
            </button>
          </>
        }
      >
        <div className="flex flex-col items-center gap-4">
          {isNewSale && (
            <div className="flex items-center gap-2 text-brand-700">
              <CheckCircle2 size={22} />
              <span className="font-semibold">
                {sale.receiptNo} saved &middot; {formatMoney(sale.total)}
              </span>
            </div>
          )}
          {sale.change > 0 && (
            <div className="rounded-xl bg-amber-50 px-5 py-3 text-center">
              <div className="text-sm text-amber-800">Give change</div>
              <div className="text-3xl font-extrabold text-amber-900">{formatMoney(sale.change)}</div>
            </div>
          )}
          <div className="max-h-[45vh] overflow-y-auto rounded-lg border border-slate-200 bg-slate-100 p-3 shadow-inner">
            <div className="shadow-md">
              <ReceiptView sale={sale} />
            </div>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={auto}
              onChange={(e) => {
                setAuto(e.target.checked)
                localStorage.setItem(AUTO_KEY, e.target.checked ? 'on' : 'off')
              }}
              className="h-4 w-4 accent-brand-500"
            />
            Print automatically after each sale
          </label>
        </div>
      </Modal>
      <PrintRoot sale={sale} />
    </>
  )
}
