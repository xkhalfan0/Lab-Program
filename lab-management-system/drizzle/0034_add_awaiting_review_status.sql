ALTER TABLE `samples`
MODIFY COLUMN `status` enum(
  'received',
  'distributed',
  'testing_in_progress',
  'awaiting_review',
  'under_review',
  'tested',
  'processed',
  'reviewed',
  'approved',
  'qc_passed',
  'qc_failed',
  'clearance_requested',
  'clearance_issued',
  'rejected',
  'revision_requested',
  'deleted'
) NOT NULL DEFAULT 'received';
