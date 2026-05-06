import express from 'express';
import { readFileSync } from 'fs';
import { createPool } from 'mysql2/promise';

const router = express.Router();

router.post('/api/admin/import-backup', async (req, res) => {
  try {
    const sql = readFileSync('./restore_data.sql', 'utf-8');
    const dbUrl = new URL(process.env.DATABASE_URL!);
    
    const pool = createPool({
      host: dbUrl.hostname,
      port: parseInt(dbUrl.port || '3306'),
      user: dbUrl.username,
      password: dbUrl.password,
      database: dbUrl.pathname.slice(1),
      multipleStatements: true
    });

    await pool.query(sql);
    await pool.end();
    
    res.json({ success: true, message: 'Data imported successfully!' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
