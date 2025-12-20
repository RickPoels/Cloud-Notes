import { Router } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

export const authRouter = Router();

function passwordStrong(pw) {
  return (
    String(pw).length >= 8 &&
    /[a-z]/.test(pw) &&
    /[A-Z]/.test(pw) &&
    /[0-9]/.test(pw)
  );
}

authRouter.post("/register", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "email and password required" });
  if (!passwordStrong(password)) {
    return res.status(400).json({ error: "password must be 8+ chars with upper, lower, digit" });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const passwordHash = await bcrypt.hash(password, 12);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const userResult = await client.query(
      "insert into users(email, password_hash) values ($1, $2) returning id, email",
      [normalizedEmail, passwordHash]
    );
    const user = userResult.rows[0];

    // create a default vault for the user
    await client.query(
      "insert into vaults(user_id, name, title) values ($1, $2, $3)",
      [user.id, "Default", "Default"]
    );

    await client.query("COMMIT");
    return res.status(201).json({ id: user.id, email: user.email });
  } catch (e) {
    await client.query("ROLLBACK");
    if (String(e?.message || "").toLowerCase().includes("unique")) {
      return res.status(409).json({ error: "email already exists" });
    }
    return res.status(500).json({ error: "server error" });
  } finally {
    client.release();
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
    { subject: String(user.id), expiresIn: "5h" }
  );

  return res.json({ token });
});

// Validate token and return user info
authRouter.get("/me", requireAuth, async (req, res) => {
  return res.json({ user: { id: req.user.id, email: req.user.email } });
});
