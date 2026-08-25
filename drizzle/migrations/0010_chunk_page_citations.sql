-- Hand-authored (page-number citations, same `--custom` precedent as 0007):
-- the two ALTERs mirror `src/main/db/schema.ts`'s new nullable `page`
-- columns, and the UPDATE is a data migration drizzle-kit cannot generate.
--
-- The plain ALTER on `attachment_chunks` is safe with migration 0007's FTS5
-- setup: the external-content virtual table maps only `text` (with
-- content_rowid=`id`), and the AI/AD/AU triggers reference columns BY NAME
-- (`new.id`/`new.text`/`old.id`/`old.text`), never positionally, so an
-- appended column changes nothing they read.
ALTER TABLE `attachment_chunks` ADD `page` integer;
--> statement-breakpoint
ALTER TABLE `ask_message_citations` ADD `page` integer;
--> statement-breakpoint
-- Re-index every PDF with page provenance: flipping `index_status` back to
-- 'pending' is all it takes — the EXISTING sync path (`indexado:sync` →
-- `syncAll()`, which enqueues every `index_status != 'indexed'` row) picks
-- them up; no new startup behavior is added. Case-insensitive on purpose
-- ('.PDF' uploads are the same format).
UPDATE `attachments` SET `index_status` = 'pending' WHERE lower(`file_name`) LIKE '%.pdf';
