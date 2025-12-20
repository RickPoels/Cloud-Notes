import "dotenv/config";
import path from "path";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { fileURLToPath } from "url";
import { authRouter } from "./routes/auth.js";
import { vaultsRouter } from "./routes/vaults.js";
import { foldersRouter } from "./routes/folders.js";
import { notesRouter } from "./routes/notes.js";
import { tagsRouter } from "./routes/tags.js";

if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET missing");

const app = express();
app.use(express.json());

// Security headers and basic hardening
app.use(helmet({
  contentSecurityPolicy: false // keep simple; customize if serving inline scripts
}));

// Trust proxy for HTTPS detection (Render/Heroku/etc.)
app.set("trust proxy", 1);

// Enforce HTTPS in production
app.use((req, res, next) => {
  if (process.env.NODE_ENV === "production" && req.headers["x-forwarded-proto"] === "http") {
    return res.redirect(301, `https://${req.headers.host}${req.url}`);
  }
  next();
});

// Rate limit auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false
});
app.use("/auth", authLimiter);

app.use(cors({
  origin: process.env.CORS_ORIGIN || true
}));

app.get("/health", (req, res) => res.json({ ok: true }));

app.use("/auth", authRouter);
app.use("/vaults", vaultsRouter);
app.use("/vaults/:vaultId/folders", foldersRouter);
app.use("/vaults/:vaultId/notes", notesRouter);
app.use("/vaults/:vaultId/tags", tagsRouter);

// Serve static frontend from ../frontend
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDir = path.resolve(__dirname, "../../frontend");
app.use(express.static(frontendDir));

app.get("/", (req, res) => res.sendFile(path.join(frontendDir, "login.html")));

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`API running on port ${port}`);
});
