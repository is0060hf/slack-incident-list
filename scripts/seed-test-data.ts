import { query, transaction } from '../lib/db';
import { v4 as uuidv4 } from 'uuid';

// テストデータ生成用のサンプルデータ
const incidentTemplates = [
  {
    title: 'データベース接続エラーによるサービス停止',
    description: 'PostgreSQLへの接続がタイムアウトし、全サービスが利用不可',
    severity_level: 4,
    messages: [
      { user: 'yamada', text: '本番環境でDBエラーが発生しています！至急確認お願いします' },
      { user: 'tanaka', text: 'エラーログ確認しました。Connection refusedが大量に出ています' },
      { user: 'suzuki', text: 'DBサーバーのCPU使用率が100%になっています' },
      { user: 'yamada', text: 'とりあえずDBを再起動してみます' },
      { user: 'tanaka', text: '再起動完了。接続が回復しました' }
    ]
  },
  {
    title: 'API レスポンス遅延',
    description: '特定のAPIエンドポイントで5秒以上のレスポンス遅延',
    severity_level: 2,
    messages: [
      { user: 'sato', text: 'ユーザーAPIのレスポンスが遅いという問い合わせが来ています' },
      { user: 'ito', text: '確認したところ、平均レスポンスタイムが5秒を超えています' },
      { user: 'sato', text: 'キャッシュの有効期限切れが原因かもしれません' },
      { user: 'ito', text: 'キャッシュを再生成しました。改善されたか確認お願いします' }
    ]
  },
  {
    title: 'ログインエラー多発',
    description: '認証サービスのエラーにより、複数ユーザーがログイン不可',
    severity_level: 3,
    messages: [
      { user: 'watanabe', text: 'ログインできないという問い合わせが10件以上来ています' },
      { user: 'takahashi', text: '認証サーバーのログを確認します' },
      { user: 'takahashi', text: 'JWTトークンの検証でエラーが発生しているようです' },
      { user: 'watanabe', text: '証明書の有効期限を確認してもらえますか？' },
      { user: 'takahashi', text: '証明書が今朝期限切れになっていました。更新します' }
    ]
  },
  {
    title: 'ファイルアップロード機能の不具合',
    description: '大容量ファイルのアップロード時にタイムアウトエラー',
    severity_level: 2,
    messages: [
      { user: 'kimura', text: '100MB以上のファイルがアップロードできないという報告があります' },
      { user: 'nakamura', text: 'Nginxのclient_max_body_sizeを確認してみます' },
      { user: 'nakamura', text: '設定は問題なさそうです。S3への転送でタイムアウトしているようです' },
      { user: 'kimura', text: 'マルチパートアップロードに変更してみましょうか' }
    ]
  },
  {
    title: 'メール送信エラー',
    description: 'SendGridのAPIエラーにより通知メールが送信されない',
    severity_level: 2,
    messages: [
      { user: 'yoshida', text: 'ユーザーから確認メールが届かないという問い合わせです' },
      { user: 'kobayashi', text: 'SendGridのステータスを確認します' },
      { user: 'kobayashi', text: 'APIキーの月間送信数上限に達しているようです' },
      { user: 'yoshida', text: '一時的に別のAPIキーに切り替えます' }
    ]
  },
  {
    title: '検索機能の異常',
    description: 'Elasticsearchのインデックスエラーで検索結果が0件',
    severity_level: 3,
    messages: [
      { user: 'saito', text: '商品検索が全く機能していません！' },
      { user: 'kato', text: 'Elasticsearchのステータスを確認します' },
      { user: 'kato', text: 'インデックスが破損しているようです' },
      { user: 'saito', text: 'バックアップから復元できますか？' },
      { user: 'kato', text: '昨夜のスナップショットから復元を開始します' },
      { user: 'kato', text: '復元完了。検索機能が正常に動作することを確認しました' }
    ]
  },
  {
    title: 'CDNキャッシュの不整合',
    description: '古いコンテンツが配信され続ける問題',
    severity_level: 1,
    messages: [
      { user: 'matsumoto', text: '更新した画像が反映されないという報告があります' },
      { user: 'inoue', text: 'CloudFrontのキャッシュをパージしてみます' },
      { user: 'inoue', text: 'パージ完了しました。確認お願いします' }
    ]
  },
  {
    title: 'バッチ処理の失敗',
    description: '日次集計バッチがメモリ不足で異常終了',
    severity_level: 2,
    messages: [
      { user: 'yamaguchi', text: '今朝の売上集計が完了していません' },
      { user: 'sasaki', text: 'バッチサーバーのログを確認します' },
      { user: 'sasaki', text: 'OutOfMemoryErrorが発生していました' },
      { user: 'yamaguchi', text: 'ヒープサイズを増やして再実行してください' },
      { user: 'sasaki', text: '再実行完了。正常に終了しました' }
    ]
  },
  {
    title: 'SSL証明書の期限切れ',
    description: 'APIサーバーのSSL証明書が期限切れでHTTPSアクセス不可',
    severity_level: 4,
    messages: [
      { user: 'hayashi', text: 'APIにHTTPSでアクセスできません！緊急です！' },
      { user: 'yamazaki', text: '証明書の有効期限を確認します' },
      { user: 'yamazaki', text: '昨日で期限切れになっていました。Let\'s Encryptで更新します' },
      { user: 'hayashi', text: '更新完了を確認しました。アクセス可能になりました' }
    ]
  },
  {
    title: 'リアルタイム通知の遅延',
    description: 'WebSocketサーバーの過負荷により通知が数分遅れる',
    severity_level: 2,
    messages: [
      { user: 'mori', text: 'チャット通知が遅れているという報告が複数来ています' },
      { user: 'ishikawa', text: 'WebSocketサーバーの接続数を確認します' },
      { user: 'ishikawa', text: '同時接続数が上限の8000に達しています' },
      { user: 'mori', text: 'サーバーを1台追加してロードバランシングしましょう' }
    ]
  }
];

async function generateTestData() {
  console.log('テストデータの生成を開始します...');
  
  try {
    // 既存のデータをクリア
    console.log('既存データをクリアしています...');
    await query('DELETE FROM incident_messages');
    await query('DELETE FROM incident_reviews');
    await query('DELETE FROM incident_reports');
    await query('DELETE FROM incidents');
    
    const incidents = [];
    const baseDate = new Date('2025-07-25');
    
    // 20件のインシデントを生成
    for (let i = 0; i < 20; i++) {
      // 過去3ヶ月のランダムな日付を生成
      const daysAgo = Math.floor(Math.random() * 90);
      const incidentDate = new Date(baseDate);
      incidentDate.setDate(incidentDate.getDate() - daysAgo);
      
      // テンプレートからランダムに選択
      const template = incidentTemplates[i % incidentTemplates.length];
      
      // ランダムな要素を追加
      const confidence = 0.5 + Math.random() * 0.5; // 0.5 ~ 1.0
      const channelId = `C${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
      const threadTs = `${Math.floor(incidentDate.getTime() / 1000)}.${Math.floor(Math.random() * 999999)}`;
      
      // 解決済みかどうか
      const isResolved = Math.random() > 0.3; // 70%は解決済み
      const resolvedAt = isResolved ? new Date(incidentDate.getTime() + Math.random() * 24 * 60 * 60 * 1000) : null;
      const durationMinutes = isResolved ? Math.floor((resolvedAt!.getTime() - incidentDate.getTime()) / 60000) : null;
      
      incidents.push({
        id: uuidv4(),
        slack_thread_ts: threadTs,
        channel_id: channelId,
        title: `${template.title} (${incidentDate.toLocaleDateString('ja-JP')})`,
        description: template.description,
        severity_level: template.severity_level,
        status: isResolved ? 'resolved' : 'open',
        confidence_score: confidence,
        detected_at: incidentDate,
        resolved_at: resolvedAt,
        impact_users: Math.floor(Math.random() * 1000) + 10,
        duration_minutes: durationMinutes,
        llm_analysis: {
          is_incident: true,
          confidence: confidence,
          severity_level: template.severity_level,
          title: template.title,
          description: template.description,
          keywords: ['エラー', '障害', '不具合']
        },
        messages: template.messages
      });
    }
    
    // インシデントを挿入
    console.log(`${incidents.length}件のインシデントを作成中...`);
    
    for (const incident of incidents) {
      // インシデントを挿入
      await query(
        `INSERT INTO incidents (
          id, slack_thread_ts, channel_id, title, description,
          severity_level, status, confidence_score, detected_at,
          resolved_at, impact_users, duration_minutes, llm_analysis
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          incident.id,
          incident.slack_thread_ts,
          incident.channel_id,
          incident.title,
          incident.description,
          incident.severity_level,
          incident.status,
          incident.confidence_score,
          incident.detected_at,
          incident.resolved_at,
          incident.impact_users,
          incident.duration_minutes,
          JSON.stringify(incident.llm_analysis)
        ]
      );
      
      // メッセージを挿入
      let messageTs = parseFloat(incident.slack_thread_ts);
      for (const msg of incident.messages) {
        messageTs += Math.random() * 60; // 最大60秒の間隔
        const msgTimestamp = messageTs.toString();
        
        await query(
          `INSERT INTO incident_messages (
            incident_id, slack_ts, user_id, message
          ) VALUES ($1, $2, $3, $4)`,
          [incident.id, msgTimestamp, msg.user, msg.text]
        );
      }
      
      // 解決済みの場合はレビューも追加
      if (incident.status === 'resolved' && Math.random() > 0.5) {
        await query(
          `INSERT INTO incident_reviews (
            incident_id, reviewed_by, review_status, review_notes
          ) VALUES ($1, $2, $3, $4)`,
          [
            incident.id,
            'admin',
            'confirmed',
            '問題は解決され、再発防止策も実施されました。'
          ]
        );
      }
    }
    
    console.log('✅ テストデータの生成が完了しました！');
    
    // 統計情報を表示
    const stats = await query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'open' THEN 1 END) as open,
        COUNT(CASE WHEN status = 'resolved' THEN 1 END) as resolved,
        COUNT(CASE WHEN severity_level = 4 THEN 1 END) as critical
      FROM incidents
    `);
    
    console.log('\n📊 生成されたデータの統計:');
    console.log(`- 総インシデント数: ${stats[0].total}`);
    console.log(`- Open: ${stats[0].open}`);
    console.log(`- Resolved: ${stats[0].resolved}`);
    console.log(`- 緊急度4: ${stats[0].critical}`);
    
  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  }
}

// スクリプトを実行
generateTestData()
  .then(() => process.exit(0))
  .catch(() => process.exit(1)); 