import { Router } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { pool } from "../db.js";

export const authRouter = Router();

authRouter.post("/register", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "email and password required" });
  if (String(password).length < 8) return res.status(400).json({ error: "password must be at least 8 chars" });

  const passwordHash = await bcrypt.hash(password, 12);

  try {
    const result = await pool.query(
      "insert into users(email, password_hash) values ($1, $2) returning id, email",
      [email.toLowerCase().trim(), passwordHash]
    );

    return res.status(201).json({ id: result.rows[0].id, email: result.rows[0].email });
  } catch (e) {
    if (String(e?.message || "").includes("unique")) {
      return res.status(409).json({ error: "email already exists" });
    }
    return res.status(500).json({ error: "server error" });
  }
});

authRouter.post("/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "email and password required" });

  const userRes = await pool.query(
    "select id, email, password_hash from users where email = $1",
    [email.toLowerCase().trim()]
  );

  const user = userRes.rows[0];
  if (!user) return res.status(401).json({ error: "invalid credentials" });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: "invalid credentials" });

  const token = jwt.sign(
    { email: user.email },
    process.env.JWT_SECRET,
    { subject: String(user.id), expiresIn: "7d" }
  );

  return res.json({ token });
});
