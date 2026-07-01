ALTER TABLE `concrete_test_groups`
  ADD COLUMN `labCuringTemperature` varchar(64) NULL AFTER `moistureCondition`,
  ADD COLUMN `labCuringRh` varchar(64) NULL AFTER `labCuringTemperature`,
  ADD COLUMN `loadingRate` varchar(32) NULL AFTER `labCuringRh`,
  ADD COLUMN `surfaceConditionAtTest` varchar(128) NULL AFTER `loadingRate`,
  ADD COLUMN `cappingMethod` varchar(128) NULL AFTER `surfaceConditionAtTest`;
