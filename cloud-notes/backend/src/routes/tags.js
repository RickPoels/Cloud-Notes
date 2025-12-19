import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

export const tagsRouter = Router({ mergeParams: true });

tagsRouter.use(requireAuth);

async function assertVaultAccess(userId, vaultId) {
  const r = await pool.query("select 1 from vaults where id = $1 and user_id = $2", [vaultId, userId]);
  return r.rowCount > 0;
}

tagsRouter.get("/", async (req, res) => {
  const { vaultId } = req.params;
  if (!(await assertVaultAccess(req.user.id, vaultId))) {
    return res.status(404).json({ error: "vault not found" });
  }
  const result = await pool.query(
    "select id, name, created_at, updated_at from tags where vault_id = $1 order by name asc",
    [vaultId]
  );
  return res.json({ tags: result.rows });
});

tagsRouter.post("/", async (req, res) => {
  const { vaultId } = req.params;
  const { name } = req.body || {};
  if (!(await assertVaultAccess(req.user.id, vaultId))) {
    return res.status(404).json({ error: "vault not found" });
  }
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: "name required" });
  }
  try {
    const result = await pool.query(
      "insert into tags(vault_id, name) values ($1, $2) on conflict (vault_id, name) do update set name = EXCLUDED.name returning id, name, created_at, updated_at",
      [vaultId, String(name).trim()]
    );
    return res.status(201).json({ tag: result.rows[0] });
  } catch (e) {
    return res.status(500).json({ error: "server error" });
  }
});
