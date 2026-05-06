import { readFileSync } from 'fs';
import { createConnection } from 'mysql2/promise';

const sql = readFileSync('./restore_data.sql', 'utf-8');
const dbUrl = new URL(process.env.DATABASE_URL);

const connection = await createConnection({
  host: dbUrl.hostname,
  port: parseInt(dbUrl.port || '3306'),
  user: dbUrl.username,
  password: dbUrl.password,
  database: dbUrl.pathname.slice(1),
  multipleStatements: true
});

console.log('🔄 Importing data...');
await connection.query(sql);
console.log('✅ Data imported successfully!');
await connection.end();
