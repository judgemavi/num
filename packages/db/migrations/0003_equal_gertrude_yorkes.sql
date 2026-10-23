DROP INDEX `import_batches_hash_active`;--> statement-breakpoint
CREATE INDEX `import_batches_hash` ON `import_batches` (`hash`);