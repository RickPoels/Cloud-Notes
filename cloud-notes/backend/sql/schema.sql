-- ============================================================
-- Cloud Notes / Obsidian-like schema (PostgreSQL)
-- Model: User -> Vaults -> Folders -> Notes
-- Option A: notes.folder_id is NULLABLE (Inbox/no-folder within a vault)
-- Notes store large bodies in TEXT.
-- Includes tags (many-to-many).
-- ============================================================

-- ---------- Extensions (optional but recommended) ----------
CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS citext;   -- case-insensitive email

-- ---------- updated_at helper (optional, but useful) ----------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         citext UNIQUE NOT NULL,
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- VAULTS (per user)
-- ============================================================
CREATE TABLE IF NOT EXISTS vaults (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS vaults_user_idx ON vaults(user_id);

DROP TRIGGER IF EXISTS trg_vaults_updated_at ON vaults;
CREATE TRIGGER trg_vaults_updated_at
BEFORE UPDATE ON vaults
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- FOLDERS (per vault, optional nesting)
-- ============================================================
CREATE TABLE IF NOT EXISTS folders (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vault_id          uuid NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,

  name              text NOT NULL,
  parent_folder_id  uuid NULL REFERENCES folders(id) ON DELETE CASCADE,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  -- Unique within same parent inside a vault
  UNIQUE (vault_id, parent_folder_id, name),

  -- Needed for composite FK from notes (folder must be in same vault)
  UNIQUE (id, vault_id)
);

CREATE INDEX IF NOT EXISTS folders_vault_idx ON folders(vault_id);
CREATE INDEX IF NOT EXISTS folders_vault_parent_idx ON folders(vault_id, parent_folder_id);

DROP TRIGGER IF EXISTS trg_folders_updated_at ON folders;
CREATE TRIGGER trg_folders_updated_at
BEFORE UPDATE ON folders
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- NOTES (always in a vault, optionally in a folder)
-- ============================================================
CREATE TABLE IF NOT EXISTS notes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  vault_id    uuid NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  folder_id   uuid NULL,

  title       text NOT NULL DEFAULT '',
  content     text NOT NULL DEFAULT '',

  is_pinned   boolean NOT NULL DEFAULT false,
  is_archived boolean NOT NULL DEFAULT false,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Enforce: if folder_id is set, it must belong to the SAME vault as the note
ALTER TABLE notes
  DROP CONSTRAINT IF EXISTS notes_folder_same_vault_fk;

ALTER TABLE notes
  ADD CONSTRAINT notes_folder_same_vault_fk
  FOREIGN KEY (folder_id, vault_id)
  REFERENCES folders (id, vault_id)
  ON DELETE SET NULL;

-- Indexes for typical list views
CREATE INDEX IF NOT EXISTS notes_vault_updated_idx
  ON notes (vault_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS notes_vault_folder_updated_idx
  ON notes (vault_id, folder_id, updated_at DESC);

-- Optional: speed up "active notes" lists (non-archived)
CREATE INDEX IF NOT EXISTS notes_vault_folder_active_updated_idx
  ON notes (vault_id, folder_id, updated_at DESC)
  WHERE is_archived = false;

DROP TRIGGER IF EXISTS trg_notes_updated_at ON notes;
CREATE TRIGGER trg_notes_updated_at
BEFORE UPDATE ON notes
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- TAGS (scoped per vault) + NOTE_TAGS (many-to-many)
-- ============================================================
CREATE TABLE IF NOT EXISTS tags (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vault_id   uuid NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vault_id, name)
);

CREATE INDEX IF NOT EXISTS tags_vault_idx ON tags(vault_id);

DROP TRIGGER IF EXISTS trg_tags_updated_at ON tags;
CREATE TRIGGER trg_tags_updated_at
BEFORE UPDATE ON tags
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS note_tags (
  note_id uuid NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  tag_id  uuid NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
  PRIMARY KEY (note_id, tag_id)
);

CREATE INDEX IF NOT EXISTS note_tags_tag_idx ON note_tags(tag_id);

-- ============================================================
-- (Optional) Safety constraint: a note and its tags must be in same vault
-- Enforcing this purely in SQL requires carrying vault_id on note_tags
-- or using triggers. Skipped for simplicity.
-- ============================================================
