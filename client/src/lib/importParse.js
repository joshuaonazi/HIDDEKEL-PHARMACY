import { readSheet } from 'read-excel-file/browser'

export const MAX_IMPORT_ROWS = 2000

// Column headings we understand (case, spaces and punctuation are ignored)
const ALIASES = {
  name: ['name', 'brandname', 'productname', 'drugname', 'product', 'item', 'itemname'],
  genericName: ['genericname', 'generic'],
  strength: ['strength', 'dosage', 'dose'],
  dosageForm: ['form', 'dosageform'],
  category: ['category', 'categoryname'],
  barcode: ['barcode', 'barcodes', 'ean', 'upc'],
  itemType: ['itemtype', 'kind'],
  prescriptionOnly: ['prescriptiononly', 'prescription', 'rx', 'requiresprescription'],
  reorderLevel: ['reorderlevel', 'lowstock', 'lowstocklevel', 'minstock', 'reorder'],
  batchNo: ['batchno', 'batchnumber', 'batch', 'lot', 'lotno'],
  expiryDate: ['expirydate', 'expiry', 'expdate', 'expirationdate', 'exp'],
  quantity: ['quantity', 'qty', 'stock', 'openingstock', 'quantityinstock'],
  costPrice: ['costprice', 'cost', 'purchaseprice', 'buyingprice'],
  sellingPrice: ['sellingprice', 'price', 'saleprice', 'retailprice', 'unitprice'],
}

const FIELD_BY_HEADER = new Map()
for (const [field, names] of Object.entries(ALIASES)) names.forEach((n) => FIELD_BY_HEADER.set(n, field))

const normalize = (h) => String(h ?? '').toLowerCase().replace(/[^a-z]/g, '')
const pad = (n) => String(n).padStart(2, '0')

function dateToIso(d) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

// Accepts DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD or a real Excel date. Anything else is passed on so the server can report it.
function cleanDate(text) {
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (iso) return `${iso[1]}-${pad(iso[2])}-${pad(iso[3])}`
  const dmy = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/)
  if (dmy) return `${dmy[3]}-${pad(dmy[2])}-${pad(dmy[1])}`
  return text
}

const cleanNumber = (text) => text.replace(/[₦$,\s]/g, '')

function cellToString(value) {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return dateToIso(value)
  if (typeof value === 'boolean') return value ? 'yes' : 'no'
  return String(value).trim()
}

// Minimal CSV reader (handles quotes, commas inside quotes and a leading byte-order mark)
function parseCsv(text) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  const input = text.replace(/^\uFEFF/, '')
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i]
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') {
        cell += '"'
        i += 1
      } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && input[i + 1] === '\n') i += 1
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  if (cell !== '' || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

// Reads an .xlsx or .csv file and returns rows ready to send to the server
// mode 'products' = list of products (Name column needed); mode 'stock' = batches to add to products that exist
export async function parseImportFile(file, mode = 'products') {
  const lower = file.name.toLowerCase()
  let table
  if (lower.endsWith('.xlsx')) table = await readSheet(file)
  else if (lower.endsWith('.csv')) table = parseCsv(await file.text())
  else throw new Error('Please choose an Excel (.xlsx) or CSV (.csv) file.')

  const headerIndex = table.findIndex((r) => r.some((c) => cellToString(c) !== ''))
  if (headerIndex === -1) throw new Error('The file is empty.')

  const columns = table[headerIndex].map((h) => FIELD_BY_HEADER.get(normalize(h)) || null)
  if (mode === 'stock') {
    if (!columns.includes('name') && !columns.includes('barcode')) {
      throw new Error('Could not find a "Name" or "Barcode" column to match your products. Download the template to see the headings.')
    }
    const missing = [['quantity', 'Quantity'], ['costPrice', 'Cost Price'], ['sellingPrice', 'Selling Price']]
      .filter(([field]) => !columns.includes(field))
      .map(([, label]) => label)
    if (missing.length) throw new Error(`Missing column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}. Download the template to see the headings.`)
  } else if (!columns.includes('name')) {
    throw new Error('Could not find a "Name" column. Download the template to see the expected headings.')
  }
  const unknown = table[headerIndex].filter((h, i) => !columns[i] && cellToString(h) !== '').map(cellToString)

  const rows = []
  for (let i = headerIndex + 1; i < table.length; i += 1) {
    const cells = table[i]
    if (!cells.some((c) => cellToString(c) !== '')) continue
    const item = { row: i + 1 }
    columns.forEach((field, col) => {
      if (!field) return
      let text = cellToString(cells[col])
      if (field === 'expiryDate') text = cleanDate(text)
      if (['quantity', 'costPrice', 'sellingPrice', 'reorderLevel'].includes(field)) text = cleanNumber(text)
      item[field] = text
    })
    rows.push(item)
  }
  if (rows.length === 0) throw new Error('No product rows found under the headings.')
  if (rows.length > MAX_IMPORT_ROWS) {
    throw new Error(`The file has ${rows.length} rows. Please import ${MAX_IMPORT_ROWS} or fewer at a time.`)
  }
  return { rows, unknownHeaders: unknown }
}

const TEMPLATE = [
  'Name,Generic Name,Strength,Form,Category,Barcode,Item Type,Prescription Only,Reorder Level,Batch No,Expiry Date,Quantity,Cost Price,Selling Price',
  'Paracetamol 500mg,Paracetamol,500mg,Tablet,Analgesics,1234567890123,drug,no,100,PCT24001,31/12/2027,500,180,350',
  'Hand Sanitizer 100ml,,,,Toiletries,,general,,20,,,40,400,750',
].join('\r\n')

function downloadCsv(content, fileName) {
  const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

export const downloadTemplate = () => downloadCsv(TEMPLATE, 'product-import-template.csv')

const STOCK_TEMPLATE = [
  'Name,Strength,Form,Barcode,Batch No,Expiry Date,Quantity,Cost Price,Selling Price',
  'Paracetamol 500mg,500mg,Tablet,1234567890123,PCT24001,31/12/2027,500,180,350',
  'Hand Sanitizer 100ml,,,,,30/06/2028,40,400,750',
].join('\r\n')

export const downloadStockTemplate = () => downloadCsv(STOCK_TEMPLATE, 'stock-import-template.csv')
