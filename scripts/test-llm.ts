import { testLLMConnection, detectIncident } from '../lib/llm';

// テストメッセージ
const testMessages = [
  {
    user: '田中太郎',
    text: 'APIサーバーがダウンしています！全ユーザーがログインできない状態です',
    ts: '1234567890.123456'
  },
  {
    user: '山田花子',
    text: '確認しました。データベース接続でタイムアウトが発生しているようです',
    ts: '1234567891.123456'
  },
  {
    user: '鈴木一郎',
    text: '緊急対応を開始します。影響範囲は全サービスに及んでいます',
    ts: '1234567892.123456'
  }
];

async function runTest() {
  console.log('LLMテストを開始します...\n');
  
  try {
    // 1. 接続テスト
    console.log('1. LLM接続テスト');
    const isConnected = await testLLMConnection();
    console.log(`   結果: ${isConnected ? '✅ 成功' : '❌ 失敗'}\n`);
    
    if (!isConnected) {
      console.error('LLMに接続できませんでした。環境変数を確認してください。');
      return;
    }
    
    // 2. 障害検出テスト
    console.log('2. 障害検出テスト');
    console.log('   テストメッセージ:');
    testMessages.forEach(msg => {
      console.log(`   - [${msg.user}]: ${msg.text}`);
    });
    console.log('');
    
    const result = await detectIncident(testMessages);
    
    console.log('   検出結果:');
    console.log(`   - インシデント判定: ${result.is_incident ? '✅ Yes' : '❌ No'}`);
    console.log(`   - 信頼度: ${(result.confidence * 100).toFixed(1)}%`);
    console.log(`   - 重要度レベル: ${result.severity_level} (1-4)`);
    console.log(`   - タイトル: ${result.title}`);
    console.log(`   - 説明: ${result.description}`);
    console.log(`   - キーワード: ${result.keywords.join(', ')}`);
    
  } catch (error) {
    console.error('テスト中にエラーが発生しました:', error);
  }
}

// テストを実行
runTest(); 