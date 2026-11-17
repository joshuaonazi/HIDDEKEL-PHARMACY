// Only admins and managers may see what a drug cost. Cashiers never receive cost prices.
export const canSeeCost = (user) => user.role === 'admin' || user.role === 'manager';

export function stockStatus(stock, reorderLevel) {
  if (stock <= 0) return 'out';
  if (reorderLevel > 0 && stock <= reorderLevel) return 'low';
  return 'in';
}

export function batchOut(row, user) {
  const out = {
    id: row.id,
    batchNo: row.batch_no,
    expiryDate: row.expiry_date,
    qtyReceived: row.qty_received,
    qtyRemaining: row.qty_remaining,
    sellingPrice: row.selling_price,
  };
  if (canSeeCost(user)) out.costPrice = row.cost_price;
  return out;
}

export function productListOut(row) {
  return {
    id: row.id,
    name: row.name,
    genericName: row.generic_name,
    strength: row.strength,
    dosageForm: row.dosage_form,
    itemType: row.item_type,
    requiresPrescription: row.requires_prescription,
    reorderLevel: row.reorder_level,
    category: row.category_id ? { id: row.category_id, name: row.category_name } : null,
    barcodes: row.barcodes || [],
    barcode: (row.barcodes || [])[0] || null,
    stock: row.stock,
    sellableStock: row.sellable,
    sellingPrice: row.selling_price,
    nearestExpiry: row.nearest_expiry,
    status: stockStatus(row.stock, row.reorder_level),
  };
}
