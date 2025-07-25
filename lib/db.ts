import { Pool } from '@neondatabase/serverless';

// データベース接続設定
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set in environment variables');
}

// Poolモード用の設定（サーバーレス環境に最適化）
let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    // サーバーレス環境に最適化された設定
    pool = new Pool({ 
      connectionString: databaseUrl,
      max: 1, // サーバーレスでは接続数を最小限に
      idleTimeoutMillis: 0, // アイドル接続を即座に閉じる
      connectionTimeoutMillis: 30000, // NEONの起動時間を考慮して30秒に
    });
  }
  
  return pool;
}

// SQLクエリを実行する汎用関数（最適化版）
export async function query<T = any>(
  text: string,
  params?: any[]
): Promise<T[]> {
  let retries = 3;
  let lastError: any;
  
  while (retries > 0) {
    try {
      const pool = getPool();
      const result = await pool.query(text, params);
      return result.rows as T[];
    } catch (error) {
      lastError = error;
      retries--;
      
      console.error(`Database query error (retries left: ${retries}):`, error);
      console.error('Query:', text);
      console.error('Params:', params);
      
      // 接続エラーの場合はプールをリセット
      if (error instanceof Error && 
          (error.message.includes('Connection terminated') || 
           error.message.includes('Client has encountered a connection error') ||
           error.message.includes('timeout'))) {
        console.error('Connection error detected - resetting pool');
        pool = null;
        
        // リトライ前に少し待機
        if (retries > 0) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } else {
        // 接続エラー以外の場合はリトライしない
        break;
      }
    }
  }
  
  throw lastError;
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