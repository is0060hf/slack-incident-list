import { Pool } from '@neondatabase/serverless';

// データベース接続プールの作成
let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    const databaseUrl = process.env.DATABASE_URL;
    
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is not set in environment variables');
    }
    
    pool = new Pool({ connectionString: databaseUrl });
  }
  
  return pool;
}

// SQLクエリを実行する汎用関数
export async function query<T = any>(
  text: string,
  params?: any[]
): Promise<T[]> {
  const pool = getPool();
  
  try {
    const result = await pool.query(text, params);
    return result.rows as T[];
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
}

// トランザクション実行用の関数
export async function transaction<T>(
  queries: Array<{ text: string; params?: any[] }>
): Promise<T[]> {
  const pool = getPool();
  const client = await pool.connect();
  const results: T[] = [];
  
  try {
    await client.query('BEGIN');
    
    for (const query of queries) {
      const result = await client.query(query.text, query.params);
      results.push(result.rows as T);
    }
    
    await client.query('COMMIT');
    return results;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Transaction error:', error);
    throw error;
  } finally {
    client.release();
  }
}

// データベース接続テスト用の関数
export async function testConnection(): Promise<boolean> {
  try {
    const result = await query<{ test: number }>('SELECT 1 as test');
    return result.length > 0 && result[0].test === 1;
  } catch (error) {
    console.error('Database connection test failed:', error);
    return false;
  }
} 