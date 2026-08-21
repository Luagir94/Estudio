-- Custom SQL migration file, put your code below! --
-- Hand-authored (attachment-fts-index design "Storage"): drizzle-kit cannot
-- generate FTS5 virtual tables or triggers from the typed schema, so this
-- migration is `--custom`-scaffolded and filled in by hand. External-content
-- FTS5 keeps `attachment_chunks.text` as the single source of truth; the
-- AI/AD/AU triggers below are the ONLY thing that keeps the index in sync —
-- no application code ever writes to `attachment_chunks_fts` directly.
-- `unicode61 remove_diacritics 2` folds Spanish accents (á/é/í/ó/ú/ñ) so a
-- diacritic-free question still matches accented source text (design
-- "FTS shape" — no stemming, an accepted proposal tradeoff).
CREATE VIRTUAL TABLE `attachment_chunks_fts` USING fts5(
	`text`, content=`attachment_chunks`, content_rowid=`id`,
	tokenize='unicode61 remove_diacritics 2'
);
--> statement-breakpoint
CREATE TRIGGER `attachment_chunks_ai` AFTER INSERT ON `attachment_chunks` BEGIN
  INSERT INTO attachment_chunks_fts(rowid, text) VALUES (new.id, new.text);
END;
--> statement-breakpoint
CREATE TRIGGER `attachment_chunks_ad` AFTER DELETE ON `attachment_chunks` BEGIN
  INSERT INTO attachment_chunks_fts(attachment_chunks_fts, rowid, text) VALUES ('delete', old.id, old.text);
END;
--> statement-breakpoint
CREATE TRIGGER `attachment_chunks_au` AFTER UPDATE ON `attachment_chunks` BEGIN
  INSERT INTO attachment_chunks_fts(attachment_chunks_fts, rowid, text) VALUES ('delete', old.id, old.text);
  INSERT INTO attachment_chunks_fts(rowid, text) VALUES (new.id, new.text);
END;
