import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

export const vaultsRouter = Router();

vaultsRouter.use(requireAuth);

// List user's vaults
vaultsRouter.get("/", async (req, res) => {
  const result = await pool.query(
    "select id, name, title, created_at, updated_at from vaults where user_id = $1 order by created_at asc",
    [req.user.id]
  );
  return res.json({ vaults: result.rows });
});

// Create vault
vaultsRouter.post("/", async (req, res) => {
  const { name, title } = req.body || {};
  const useName = (name || title || "").trim();
  const useTitle = (title || name || "").trim();
  if (!useName) {
    return res.status(400).json({ error: "name/title required" });
  }
  try {
    const result = await pool.query(
      "insert into vaults(user_id, name, title) values ($1, $2, $3) returning id, name, title, created_at, updated_at",
      [req.user.id, useName, useTitle]
    );
    return res.status(201).json({ vault: result.rows[0] });
  } catch (e) {
    if (String(e?.message || "").toLowerCase().includes("unique")) {
      return res.status(409).json({ error: "vault name already exists" });
    }
    return res.status(500).json({ error: "server error" });
  }
});
