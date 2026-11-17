import { createPortal } from 'react-dom'
import { formatMoney } from '../../lib/format.js'

const num = (n) => new Intl.NumberFormat('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0)

const PAYMENT_LABELS = { cash: 'Cash', pos: 'POS', transfer: 'Bank Transfer', other: 'Other', mixed: 'Split' }

function when(sale) {
  const d = new Date(sale.createdAt)
  const opts = { timeZone: sale.pharmacy.timezone, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }
  return d.toLocaleString('en-GB', opts).replace(',', '')
}

const itemName = (i) =>
  i.strength && !i.name.toLowerCase().includes(i.strength.toLowerCase()) ? `${i.name} ${i.strength}` : i.name

// The receipt exactly as it prints on 58mm paper
export function ReceiptView({ sale, copy = false }) {
  const p = sale.pharmacy
  return (
    <div className="receipt">
      {sale.status === 'voided' && <div className="r-center r-bold" style={{ fontSize: 13 }}>*** VOIDED ***</div>}
      {copy && <div className="r-center r-bold">** DUPLICATE COPY **</div>}
      <div className="r-center r-bold" style={{ fontSize: 14 }}>{p.name}</div>
      {p.address && <div className="r-center">{p.address}</div>}
      {p.phone && <div className="r-center">Tel: {p.phone}</div>}
      <div className="r-sep" />
      <div>Date: {when(sale)}</div>
      <div>No: {sale.receiptNo}</div>
      <div>Cashier: {sale.cashier}</div>
      <div className="r-sep" />
      {sale.items.map((i, idx) => (
        <div key={idx} style={{ marginBottom: 3 }}>
          <div className="r-name">{itemName(i)}</div>
          <div className="r-row">
            <span>
              {i.quantity} x {num(i.unitPrice)}
            </span>
            <span>{num(i.lineTotal)}</span>
          </div>
        </div>
      ))}
      <div className="r-sep" />
      <div className="r-row">
        <span>Subtotal</span>
        <span>{num(sale.subtotal)}</span>
      </div>
      {sale.discount > 0 && (
        <div className="r-row">
          <span>Discount</span>
          <span>-{num(sale.discount)}</span>
        </div>
      )}
      {sale.tax > 0 && (
        <div className="r-row">
          <span>VAT ({sale.taxRate}%)</span>
          <span>{num(sale.tax)}</span>
        </div>
      )}
      <div className="r-row r-total">
        <span>TOTAL</span>
        <span>{formatMoney(sale.total)}</span>
      </div>
      <div className="r-sep" />
      <div className="r-row">
        <span>Paid by</span>
        <span>{PAYMENT_LABELS[sale.paymentMethod] || sale.paymentMethod}</span>
      </div>
      {sale.amountTendered !== null && (
        <>
          <div className="r-row">
            <span>Amount received</span>
            <span>{num(sale.amountTendered)}</span>
          </div>
          <div className="r-row">
            <span>Change</span>
            <span>{num(sale.change)}</span>
          </div>
        </>
      )}
      <div className="r-sep" />
      <div className="r-center r-bold">{p.receiptFooter || 'Thank you for your patronage'}</div>
      <div className="r-center" style={{ marginTop: 6 }}>.</div>
    </div>
  )
}

// A copy of the receipt outside the app, shown only while printing
export function PrintRoot({ sale, copy = false }) {
  return createPortal(
    <div id="print-root">
      <ReceiptView sale={sale} copy={copy} />
    </div>,
    document.body,
  )
}