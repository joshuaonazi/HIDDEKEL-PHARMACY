// Records who did what. `db` can be the pool or a transaction client.
export async function audit(db, req, action, entity, entityId, details = null) {
  await db.query(
    `INSERT INTO audit_logs (pharmacy_id, user_id, action, entity, entity_id, details)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [req.user.pharmacyId, req.user.id, action, entity, entityId, details ? JSON.stringify(details) : null]
  );
}
