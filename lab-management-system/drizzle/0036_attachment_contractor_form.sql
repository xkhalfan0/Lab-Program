ALTER TABLE `attachments`
  MODIFY COLUMN `attachmentType` ENUM(
    'photo',
    'document',
    'contractor_letter',
    'sector_letter',
    'payment_order',
    'payment_receipt',
    'test_report',
    'contractor_form',
    'other'
  ) NOT NULL;
