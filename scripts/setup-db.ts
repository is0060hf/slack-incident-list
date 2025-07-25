import { readFileSync } from 'fs';
import { join } from 'path';
import { query, testConnection } from '../lib/db';

async function setupDatabase() {
  console.log('データベース設定を開始します...');
  
  try {
    // 接続テスト
    console.log('データベース接続をテストしています...');
    const isConnected = await testConnection();
    
    if (!isConnected) {
      throw new Error('データベースに接続できませんでした');
    }
    
    console.log('✅ データベース接続成功');
    
    // SQLファイルを読み込み
    const schemaPath = join(__dirname, 'create-schema.sql');
    const schemaSql = readFileSync(schemaPath, 'utf-8');
    
    // トリガー関数とその他のステートメントを個別に処理
    const statements = [];
    
    // トリガー関数の前までのステートメントを抽出
    const beforeTriggerFunction = schemaSql.split('-- 更新時刻を自動更新するトリガー関数')[0];
    const basicStatements = beforeTriggerFunction
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0);
    
    statements.push(...basicStatements);
    
    // トリガー関数を1つのステートメントとして追加
    const triggerFunctionMatch = schemaSql.match(/CREATE OR REPLACE FUNCTION[\s\S]*?language 'plpgsql'/);
    if (triggerFunctionMatch) {
      statements.push(triggerFunctionMatch[0]);
    }
    
    // トリガーを追加
    const triggerMatch = schemaSql.match(/CREATE TRIGGER[\s\S]*?update_updated_at_column\(\)/);
    if (triggerMatch) {
      statements.push(triggerMatch[0]);
    }
    
    console.log(`${statements.length}個のSQLステートメントを実行します...`);
    
    // 各ステートメントを実行
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      console.log(`実行中 (${i + 1}/${statements.length}): ${statement.substring(0, 50)}...`);
      
      try {
        await query(statement + ';');
        console.log(`✅ ステートメント ${i + 1} 完了`);
      } catch (error: any) {
        console.error(`❌ ステートメント ${i + 1} エラー:`, error.message);
        throw error;
      }
    }
    
    console.log('\n✅ データベーススキーマの作成が完了しました！');
    
    // テーブルの確認
    console.log('\n作成されたテーブルを確認しています...');
    const tables = await query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables 
       WHERE schemaname = 'public' 
       AND tablename IN ('incidents', 'incident_messages', 'incident_reviews')`
    );
    
    console.log('作成されたテーブル:');
    tables.forEach(table => {
      console.log(`  - ${table.tablename}`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ エラーが発生しました:', error);
    process.exit(1);
  }
}

// スクリプトを実行
setupDatabase(); 