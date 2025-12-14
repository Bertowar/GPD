
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Configuração do Pool de Conexões para alta performance
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20, // Suporta até 20 conexões simultâneas (escalável)
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

export const query = async (text: string, params?: any[]) => {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  // Logger simples para auditoria de performance
  if (duration > 500) {
    console.warn('Slow query executed', { text, duration, rows: res.rowCount });
  }
  return res;
};

export const getClient = async () => {
  const client = await pool.connect();
  return client;
};
