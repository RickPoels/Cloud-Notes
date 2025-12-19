import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

export const notesRouter = Router({ mergeParams: true });

notesRouter.use(requireAuth);

async function assertVaultAccess(userId, vaultId) {
  const r = await pool.query("select 1 from vaults where id = $1 and user_id = $2", [vaultId, userId]);
  return r.rowCount > 0;
}

async function validateFolder(vaultId, folderId) {
  if (!folderId) return true;
  const r = await pool.query("select 1 from folders where id = $1 and vault_id = $2", [folderId, vaultId]);
  return r.rowCount > 0;
}

async function upsertTags(client, vaultId, tags) {
  if (!Array.isArray(tags)) return [];
  const names = tags
    .map(t => String(t || "").trim())
    .filter(t => t.length > 0);
  const tagIds = [];
  for (const name of names) {
    const upsert = await client.query(
      "insert into tags(vault_id, name) values ($1, $2) on conflict (vault_id, name) do update set name = EXCLUDED.name returning id",
      [vaultId, name]
    );
    tagIds.push(upsert.rows[0].id);
  }
  return tagIds;
}

// List notes (lightweight)
notesRouter.get("/", async (req, res) => {
  const { vaultId } = req.params;
  const { folder_id: folderId, archived } = req.query;
  if (!(await assertVaultAccess(req.user.id, vaultId))) {
    return res.status(404).json({ error: "vault not found" });
  }

  const values = [vaultId];
  let where = "vault_id = $1";

  if (folderId) {
    values.push(folderId);
    where += ` AND folder_id = $${values.length}`;
  } else {
    where += " AND folder_id IS NULL";
  }

  if (archived === "false") {
    where += " AND is_archived = false";
  }

  const result = await pool.query(
    `select id, title, folder_id, is_pinned, is_archived, updated_at, created_at
     from notes
     where ${where}
     order by is_pinned desc, updated_at desc`,
    values
  );
  return res.json({ notes: result.rows });
});

// Get a single note (full content + tags)
notesRouter.get("/:noteId", async (req, res) => {
  const { vaultId, noteId } = req.params;
  if (!(await assertVaultAccess(req.user.id, vaultId))) {
    return res.status(404).json({ error: "vault not found" });
  }
  const noteRes = await pool.query(
    "select id, title, content, folder_id, is_pinned, is_archived, updated_at, created_at from notes where id = $1 and vault_id = $2",
    [noteId, vaultId]
  );
  const note = noteRes.rows[0];
  if (!note) return res.status(404).json({ error: "note not found" });

  const tagsRes = await pool.query(
    `select t.name from note_tags nt
     join tags t on t.id = nt.tag_id
     where nt.note_id = $1`,
    [noteId]
  );
  note.tags = tagsRes.rows.map(r => r.name);

  return res.json({ note });
});

// Create note
notesRouter.post("/", async (req, res) => {
  const { vaultId } = req.params;
  const { title, content, folder_id: folderId, tags = [], is_pinned = false } = req.body || {};

  if (!(await assertVaultAccess(req.user.id, vaultId))) {
    return res.status(404).json({ error: "vault not found" });
  }
  if (!(await validateFolder(vaultId, folderId))) {
    return res.status(400).json({ error: "invalid folder" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const insert = await client.query(
      `insert into notes(vault_id, folder_id, title, content, is_pinned)
       values ($1, $2, $3, $4, $5)
       returning id, title, folder_id, is_pinned, is_archived, updated_at, created_at`,
      [vaultId, folderId || null, String(title || "").trim(), String(content || ""), Boolean(is_pinned)]
    );
    const note = insert.rows[0];

    const tagIds = await upsertTags(client, vaultId, tags);
    if (tagIds.length) {
      for (const tagId of tagIds) {
        await client.query(
          "insert into note_tags(note_id, tag_id) values ($1, $2) on conflict do nothing",
          [note.id, tagId]
        );
      }
    }

    await client.query("COMMIT");
    note.tags = tags;
    return res.status(201).json({ note });
  } catch (e) {
    await client.query("ROLLBACK");
    return res.status(500).json({ error: "server error" });
  } finally {
    client.release();
  }
});

// Update note
notesRouter.put("/:noteId", async (req, res) => {
  const { vaultId, noteId } = req.params;
  const { title, content, folder_id: folderId, is_pinned, is_archived, tags } = req.body || {};

  if (!(await assertVaultAccess(req.user.id, vaultId))) {
    return res.status(404).json({ error: "vault not found" });
  }
  if (!(await validateFolder(vaultId, folderId))) {
    return res.status(400).json({ error: "invalid folder" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const update = await client.query(
      `update notes
       set title = coalesce($3, title),
           content = coalesce($4, content),
           folder_id = $5,
           is_pinned = coalesce($6, is_pinned),
           is_archived = coalesce($7, is_archived),
           updated_at = now()
       where id = $2 and vault_id = $1
       returning id, title, content, folder_id, is_pinned, is_archived, updated_at, created_at`,
      [vaultId, noteId, title, content, folderId || null, is_pinned, is_archived]
    );

    const note = update.rows[0];
    if (!note) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "note not found" });
    }

    if (Array.isArray(tags)) {
      const tagIds = await upsertTags(client, vaultId, tags);
      await client.query("delete from note_tags where note_id = $1", [noteId]);
      for (const tagId of tagIds) {
        await client.query(
          "insert into note_tags(note_id, tag_id) values ($1, $2) on conflict do nothing",
          [noteId, tagId]
        );
      }
      note.tags = tags;
    } else {
      const tagsRes = await client.query(
        `select t.name from note_tags nt join tags t on t.id = nt.tag_id where nt.note_id = $1`,
        [noteId]
      );
      note.tags = tagsRes.rows.map(r => r.name);
    }

    await client.query("COMMIT");
    return res.json({ note });
  } catch (e) {
    await client.query("ROLLBACK");
    return res.status(500).json({ error: "server error" });
  } finally {
    client.release();
  }
});

// Delete note
notesRouter.delete("/:noteId", async (req, res) => {
  const { vaultId, noteId } = req.params;
  if (!(await assertVaultAccess(req.user.id, vaultId))) {
    return res.status(404).json({ error: "vault not found" });
  }
  const del = await pool.query("delete from notes where id = $1 and vault_id = $2", [noteId, vaultId]);
  if (del.rowCount === 0) return res.status(404).json({ error: "note not found" });
  return res.json({ ok: true });
});
