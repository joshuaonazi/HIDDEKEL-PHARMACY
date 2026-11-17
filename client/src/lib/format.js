const money = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' })
const integer = new Intl.NumberFormat('en-NG')

export const formatMoney = (n) => money.format(Number(n) || 0)
export const formatInt = (n) => integer.format(Number(n) || 0)

// '2027-12-31' -> '31 Dec 2027'
export function formatDate(iso) {
  if (!iso) return '-'
  const d = new Date(`${iso}T00:00:00`)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

// '2026-11-12T10:24:00Z' -> '12 Nov 2026, 10:24 am'
export function formatDateTime(iso) {
  if (!iso) return 'Never'
  return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })
}
