// Spec "Size Cap Enforcement": checked via `fs.stat` BEFORE copying — a file
// over this cap is rejected with no partial or full copy left on disk.
export const MAX_ATTACHMENT_BYTES = 250 * 1024 * 1024
