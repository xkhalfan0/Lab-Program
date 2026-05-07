-- Backup script for targeted test type codes
-- Run this in MySQL before deleting any test types.

SET @backup_ts = DATE_FORMAT(NOW(), '%Y%m%d_%H%i%s');

-- 1) Backup matching test_types rows
SET @sql1 = CONCAT(
  'CREATE TABLE IF NOT EXISTS backup_test_types_', @backup_ts,
  ' AS SELECT * FROM test_types WHERE code IN (',
  "'ASPH_SPRAY','ASPH_SPRAY_SS1','ASPH_SPRAY_SS1H','ASPH_SPRAY_CRS1',",
  "'ASPH_SPRAY_MC30','ASPH_SPRAY_MC70','ASPH_SPRAY_MC250','ASPH_SPRAY_CUSTOM',",
  "'AGG_LA_ABRASION','CONC_FOAM_CUBE','CONC_MIX_GRAD'",
  ');'
);
PREPARE stmt1 FROM @sql1;
EXECUTE stmt1;
DEALLOCATE PREPARE stmt1;

-- 2) Backup matching distributions rows
SET @sql2 = CONCAT(
  'CREATE TABLE IF NOT EXISTS backup_distributions_', @backup_ts,
  ' AS SELECT * FROM distributions WHERE testType IN (',
  "'ASPH_SPRAY','ASPH_SPRAY_SS1','ASPH_SPRAY_SS1H','ASPH_SPRAY_CRS1',",
  "'ASPH_SPRAY_MC30','ASPH_SPRAY_MC70','ASPH_SPRAY_MC250','ASPH_SPRAY_CUSTOM',",
  "'AGG_LA_ABRASION','CONC_FOAM_CUBE','CONC_MIX_GRAD'",
  ');'
);
PREPARE stmt2 FROM @sql2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

-- 3) Backup matching specialized_test_results rows
SET @sql3 = CONCAT(
  'CREATE TABLE IF NOT EXISTS backup_specialized_test_results_', @backup_ts,
  ' AS SELECT * FROM specialized_test_results WHERE testTypeCode IN (',
  "'ASPH_SPRAY','ASPH_SPRAY_SS1','ASPH_SPRAY_SS1H','ASPH_SPRAY_CRS1',",
  "'ASPH_SPRAY_MC30','ASPH_SPRAY_MC70','ASPH_SPRAY_MC250','ASPH_SPRAY_CUSTOM',",
  "'AGG_LA_ABRASION','CONC_FOAM_CUBE','CONC_MIX_GRAD'",
  ');'
);
PREPARE stmt3 FROM @sql3;
EXECUTE stmt3;
DEALLOCATE PREPARE stmt3;

-- Quick row counts in backup tables
SET @q1 = CONCAT('SELECT ''backup_test_types'' AS table_name, COUNT(*) AS row_count FROM backup_test_types_', @backup_ts);
SET @q2 = CONCAT('SELECT ''backup_distributions'' AS table_name, COUNT(*) AS row_count FROM backup_distributions_', @backup_ts);
SET @q3 = CONCAT('SELECT ''backup_specialized_test_results'' AS table_name, COUNT(*) AS row_count FROM backup_specialized_test_results_', @backup_ts);

PREPARE c1 FROM @q1; EXECUTE c1; DEALLOCATE PREPARE c1;
PREPARE c2 FROM @q2; EXECUTE c2; DEALLOCATE PREPARE c2;
PREPARE c3 FROM @q3; EXECUTE c3; DEALLOCATE PREPARE c3;
