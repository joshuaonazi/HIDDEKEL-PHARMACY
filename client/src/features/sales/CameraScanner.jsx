import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'
import { Camera, Loader2, TriangleAlert } from 'lucide-react'
import Modal from '../../components/ui/Modal.jsx'

const FORMATS = [
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.QR_CODE,
]
const READER_ID = 'camera-reader'

// Uses the phone or laptop camera as a barcode scanner. Stays open so several items can be scanned in a row.
export default function CameraScanner({ onDetected, onClose, lastMessage }) {
  const [error, setError] = useState('')
  const [starting, setStarting] = useState(true)
  const lastRef = useRef({ code: '', at: 0 })
  const detectedRef = useRef(onDetected)

  useEffect(() => {
    detectedRef.current = onDetected
  }, [onDetected])

  useEffect(() => {
    const scanner = new Html5Qrcode(READER_ID, { formatsToSupport: FORMATS, verbose: false })
    const startPromise = scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 280, height: 140 } },
        (code) => {
          const now = Date.now()
          // The camera sees the same barcode many times a second; count it once per 1.5 seconds
          if (code === lastRef.current.code && now - lastRef.current.at < 1500) return
          lastRef.current = { code, at: now }
          detectedRef.current(code)
        },
        () => {},
      )
      .then(() => setStarting(false))
      .catch((err) => {
        setStarting(false)
        const text = String(err?.message || err)
        setError(
          /permission|denied|notallowed/i.test(text)
            ? 'Camera access was blocked. Allow the camera for this site in your browser settings and try again.'
            : 'Could not start the camera. Cameras only work on https:// pages (or localhost) and need a device with a camera.',
        )
      })

    return () => {
      startPromise.then(() => scanner.stop()).catch(() => {}).finally(() => {
        try {
          scanner.clear()
        } catch {
          // already cleared
        }
      })
    }
  }, [])

  return (
    <Modal
      title="Scan with camera"
      onClose={onClose}
      footer={
        <button type="button" onClick={onClose} className="rounded-xl bg-brand-500 px-6 py-2.5 font-bold text-white hover:bg-brand-600">
          Done
        </button>
      }
    >
      <div className="space-y-3">
        <div className="relative overflow-hidden rounded-xl bg-slate-900">
          <div id={READER_ID} className="min-h-[260px] w-full" />
          {starting && (
            <div className="absolute inset-0 flex items-center justify-center text-white">
              <Loader2 className="animate-spin" size={30} />
            </div>
          )}
        </div>
        {error ? (
          <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <TriangleAlert size={18} className="mt-0.5 shrink-0" /> {error}
          </div>
        ) : (
          <p className="flex items-center gap-2 text-sm text-slate-600">
            <Camera size={18} className="text-brand-600" /> Hold a barcode inside the frame. Each scan is added to the cart.
          </p>
        )}
        {lastMessage && (
          <div
            role="status"
            className={`rounded-xl px-4 py-2.5 text-sm font-medium ${lastMessage.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-brand-50 text-brand-800'}`}
          >
            {lastMessage.text}
          </div>
        )}
      </div>
    </Modal>
  )
}
