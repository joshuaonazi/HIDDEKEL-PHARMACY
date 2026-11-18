import { useEffect, useState } from 'react'
import { Loader2, Pill } from 'lucide-react'
import { Link } from 'react-router-dom'
import { prescriptionsApi } from '../../api/prescriptions.api.js'
import { errorMessage } from '../../api/client.js'

export default function WaitingPrescriptionsPage() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    prescriptionsApi.list({ status: 'pending', pageSize: 100 })
      .then((data) => { if (active) setItems(data.items) })
      .catch((err) => { if (active) setError(errorMessage(err, 'Could not load waiting prescriptions')) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  return (
    <div>
      <h1 className="text-3xl font-extrabold tracking-tight text-ink">Waiting Prescriptions</h1>
      <p className="mt-1 text-slate-600">Dispense each prescription from the Point of Sale.</p>
      {error && <div role="alert" className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</div>}
      {loading ? <div className="mt-6 flex items-center gap-2"><Loader2 className="animate-spin" /> Loading...</div> : (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {items.map((prescription) => (
            <div key={prescription.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 text-lg font-bold text-ink"><Pill size={20} /> {prescription.customerName}</div>
              <div className="mt-4 space-y-2">
                {prescription.items.map((item) => (
                  <div key={item.productId} className="rounded-xl bg-slate-50 p-3">
                    <div className="font-bold text-ink">{item.quantity} × {item.name}{item.strength ? ` ${item.strength}` : ''}</div>
                    <div className="mt-1 text-sm text-slate-600">{item.directions}</div>
                  </div>
                ))}
              </div>
              <Link
                to="/sales"
                state={{ prescriptionId: prescription.id, prescriptionItems: prescription.items }}
                className="mt-4 inline-flex rounded-xl bg-brand-500 px-4 py-2.5 font-bold text-white hover:bg-brand-600"
              >
                Dispense in Point of Sale
              </Link>
            </div>
          ))}
          {!items.length && <div className="rounded-2xl border border-slate-200 bg-white p-8 text-slate-600">No waiting prescriptions.</div>}
        </div>
      )}
    </div>
  )
}
