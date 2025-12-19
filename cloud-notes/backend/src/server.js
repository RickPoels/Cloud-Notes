import "dotenv/config";
import path from "path";
import express from "express";
import cors from "cors";
import { fileURLToPath } from "url";
import { authRouter } from "./routes/auth.js";
import { notesRouter } from "./routes/notes.js";

if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET missing");

const app = express();
app.use(express.json());

app.use(cors({
  origin: process.env.CORS_ORIGIN || true
}));

app.get("/health", (req, res) => res.json({ ok: true }));

app.use("/auth", authRouter);
app.use("/notes", notesRouter);

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
