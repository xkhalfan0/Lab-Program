ALTER TABLE `samples`
ADD COLUMN `deletionReason` text NULL,
ADD COLUMN `deletionCategory` varchar(64) NULL;
