-- Custom data migration (`drizzle-kit generate --custom`, the same precedent
-- 0007 and 0010 set): drizzle-kit diffs schemas, and there is no schema change
-- here to diff.
--
-- 0017 added `subjects.program_id`, so every row written before it has NULL
-- there — including rows that plainly belong to a carrera, because their
-- período already names one.
--
-- Reaching the carrera THROUGH the período is exactly what that column exists
-- to stop doing. But for rows that predate it, the período is the only truth
-- available, and it is a faithful one: `periods.program_id` is NOT NULL, so a
-- subject that has a período has an unambiguous carrera. Backfilling here is
-- what keeps the student from re-entering a fact the database already knows.
--
-- Subjects with NO período keep NULL, on purpose. There is nothing to infer for
-- them, and a guess would be worse than the "sin ordenar" state the plan map
-- already gives them.
--
-- `nivel` is deliberately NOT backfilled. It is the student's own ordering of
-- the plan, and no column in this database holds it — deriving it from the
-- período would recreate the exact confusion between the plan and the timeline
-- that 0017 exists to end.
UPDATE `subjects`
SET `program_id` = (SELECT `program_id` FROM `periods` WHERE `periods`.`id` = `subjects`.`period_id`)
WHERE `program_id` IS NULL AND `period_id` IS NOT NULL;
