import { createConnection } from 'mysql2/promise';

const dbUrl = new URL(process.env.DATABASE_URL);

const connection = await createConnection({
  host: dbUrl.hostname,
  port: parseInt(dbUrl.port || '3306'),
  user: dbUrl.username,
  password: dbUrl.password,
  database: dbUrl.pathname.slice(1),
});

console.log('✅ Connected successfully!');

const [tables] = await connection.query('SHOW TABLES');
console.log(`📊 Found ${tables.length} tables:`, tables.map(t => Object.values(t)[0]));

await connection.end();
