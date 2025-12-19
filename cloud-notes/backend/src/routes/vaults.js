import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

export const vaultsRouter = Router();

vaultsRouter.use(requireAuth);

// List user's vaults
vaultsRouter.get("/", async (req, res) => {
  const result = await pool.query(
    "select id, name, created_at, updated_at from vaults where user_id = $1 order by created_at asc",
    [req.user.id]
  );
  return res.json({ vaults: result.rows });
});

// Create vault
vaultsRouter.post("/", async (req, res) => {
  const { name } = req.body || {};
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: "name required" });
  }
  try {
    const result = await pool.query(
      "insert into vaults(user_id, name) values ($1, $2) returning id, name, created_at, updated_at",
      [req.user.id, String(name).trim()]
    );
    return res.status(201).json({ vault: result.rows[0] });
  } catch (e) {
    if (String(e?.message || "").toLowerCase().includes("unique")) {
      return res.status(409).json({ error: "vault name already exists" });
    }
    return res.status(500).json({ error: "server error" });
  }
});
