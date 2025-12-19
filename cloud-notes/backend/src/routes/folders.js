import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

export const foldersRouter = Router({ mergeParams: true });

foldersRouter.use(requireAuth);

async function assertVaultAccess(userId, vaultId) {
  const r = await pool.query("select 1 from vaults where id = $1 and user_id = $2", [vaultId, userId]);
  return r.rowCount > 0;
}

// List folders for a vault
foldersRouter.get("/", async (req, res) => {
  const { vaultId } = req.params;
  if (!(await assertVaultAccess(req.user.id, vaultId))) {
    return res.status(404).json({ error: "vault not found" });
  }
  const result = await pool.query(
    "select id, name, title, parent_folder_id, created_at, updated_at from folders where vault_id = $1 order by name asc",
    [vaultId]
  );
  return res.json({ folders: result.rows });
});

// Create folder
foldersRouter.post("/", async (req, res) => {
  const { vaultId } = req.params;
  const { name, title, parent_folder_id: parentId } = req.body || {};
  const useName = (name || title || "").trim();
  const useTitle = (title || name || "").trim();
  if (!(await assertVaultAccess(req.user.id, vaultId))) {
    return res.status(404).json({ error: "vault not found" });
  }
  if (!useName) {
    return res.status(400).json({ error: "name required" });
  }

  // if parentId provided, ensure it belongs to same vault
  if (parentId) {
    const parentCheck = await pool.query(
      "select 1 from folders where id = $1 and vault_id = $2",
      [parentId, vaultId]
    );
    if (parentCheck.rowCount === 0) {
      return res.status(400).json({ error: "invalid parent folder" });
    }
  }

  try {
    const result = await pool.query(
      "insert into folders(vault_id, name, title, parent_folder_id) values ($1, $2, $3, $4) returning id, name, title, parent_folder_id, created_at, updated_at",
      [vaultId, useName, useTitle, parentId || null]
    );
    return res.status(201).json({ folder: result.rows[0] });
  } catch (e) {
    if (String(e?.message || "").toLowerCase().includes("unique")) {
      return res.status(409).json({ error: "folder name already exists at this level" });
    }
    return res.status(500).json({ error: "server error" });
  }
});
