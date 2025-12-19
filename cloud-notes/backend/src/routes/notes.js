import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

export const notesRouter = Router();

notesRouter.get("/", requireAuth, async (req, res) => {
  const result = await pool.query(
    "select id, content, created_at from notes where user_id = $1 order by created_at desc",
    [req.user.id]
  );
  return res.json({ notes: result.rows });
});

notesRouter.post("/", requireAuth, async (req, res) => {
  const { content } = req.body || {};
  if (!content || !String(content).trim()) {
    return res.status(400).json({ error: "content required" });
  }

  const result = await pool.query(
    "insert into notes(user_id, content) values ($1, $2) returning id, content, created_at",
    [req.user.id, String(content)]
  );

  return res.status(201).json({ note: result.rows[0] });
});
