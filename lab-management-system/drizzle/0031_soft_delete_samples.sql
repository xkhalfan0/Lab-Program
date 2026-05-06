ALTER TABLE `samples`
ADD COLUMN `deletedAt` timestamp NULL,
ADD COLUMN `deletedBy` int NULL;
