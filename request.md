# Slackインシデント管理システム設計書

## 1. システム概要

### 1.1 目的
Slackの特定チャンネルを監視し、障害に関する会話を自動検出してインシデント管理を行うPoCシステム

### 1.2 技術スタック
- **フロントエンド**: Next.js 14 (App Router)
- **バックエンド**: Next.js API Routes + Vercel Functions
- **データベース**: NEON PostgreSQL
- **Slack連携**: Slack Bolt for JavaScript
- **LLM**: Claude API または OpenAI API
- **デプロイ**: Vercel

## 2. データベース設計

### 2.1 incidents テーブル
```sql
CREATE TABLE incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slack_thread_ts VARCHAR(20) NOT NULL UNIQUE,
  channel_id VARCHAR(20) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  severity_level INTEGER NOT NULL CHECK (severity_level BETWEEN 1 AND 4),
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  confidence_score DECIMAL(3,2) NOT NULL CHECK (confidence_score BETWEEN 0 AND 1),
  detected_at TIMESTAMP NOT NULL,
  resolved_at TIMESTAMP,
  impact_users INTEGER,
  duration_minutes INTEGER,
  llm_analysis JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_incidents_status ON incidents(status);
CREATE INDEX idx_incidents_severity ON incidents(severity_level);
CREATE INDEX idx_incidents_confidence ON incidents(confidence_score);
```

### 2.2 incident_messages テーブル
```sql
CREATE TABLE incident_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID REFERENCES incidents(id) ON DELETE CASCADE,
  slack_ts VARCHAR(20) NOT NULL,
  user_id VARCHAR(20) NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_messages_incident ON incident_messages(incident_id);
```

### 2.3 incident_reviews テーブル
```sql
CREATE TABLE incident_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID REFERENCES incidents(id) ON DELETE CASCADE,
  reviewed_by VARCHAR(100),
  review_status VARCHAR(20) NOT NULL,
  review_notes TEXT,
  reviewed_at TIMESTAMP DEFAULT NOW()
);
```

## 3. Slack App設定

### 3.1 必要な権限（OAuth Scopes）
- `channels:history` - チャンネルのメッセージ履歴を読む
- `channels:read` - チャンネル情報を読む
- `chat:write` - メッセージを投稿する（通知用）
- `users:read` - ユーザー情報を読む

### 3.2 イベントサブスクリプション
- `message.channels` - チャンネルの新規メッセージ
- `message.threads` - スレッドの返信

## 4. API設計

### 4.1 Slack Webhook受信
```typescript
// /api/slack/events
POST /api/slack/events
{
  type: "event_callback",
  event: {
    type: "message",
    channel: "C1234567890",
    thread_ts: "1234567890.123456",
    text: "サーバーがダウンしています",
    ts: "1234567890.123456",
    user: "U1234567890"
  }
}
```

### 4.2 インシデント管理API
```typescript
// インシデント一覧取得
GET /api/incidents?status=open&confidence_min=0.7

// インシデント詳細取得
GET /api/incidents/:id

// インシデント更新
PATCH /api/incidents/:id
{
  status: "resolved",
  resolved_at: "2025-07-25T10:00:00Z"
}

// インシデントレビュー
POST /api/incidents/:id/review
{
  review_status: "confirmed",
  review_notes: "データベース接続エラーによる障害"
}
```

## 5. LLM分析ロジック

### 5.1 障害判定プロンプト
```typescript
const INCIDENT_DETECTION_PROMPT = `
以下のSlackスレッドの会話を分析し、システム障害について議論しているか判定してください。

判定基準：
- エラー、ダウン、障害、不具合などのキーワード
- ユーザーからの問題報告
- システムの異常動作の報告
- パフォーマンス低下の報告

会話内容：
{messages}

以下のJSON形式で回答してください：
{
  "is_incident": boolean,
  "confidence": 0.0-1.0,
  "severity_level": 1-4,
  "title": "簡潔なタイトル",
  "description": "障害の概要",
  "keywords": ["検出されたキーワード"]
}
`;
```

### 5.2 自己評価度の基準
- **0.9-1.0**: 明確な障害報告（「サーバーダウン」「全面障害」等）
- **0.7-0.9**: 障害の可能性が高い（複数のエラー報告、影響範囲の議論）
- **0.5-0.7**: 障害の可能性あり（断片的なエラー報告）
- **0.0-0.5**: 障害の可能性低い

## 6. ダッシュボード機能

### 6.1 インシデント一覧
- ステータス別フィルタ（Open/Resolved/Under Review）
- 重要度別フィルタ
- 信頼度別フィルタ（0.7未満は要レビュー表示）
- 期間指定フィルタ

### 6.2 インシデント詳細
- Slackスレッドの全メッセージ表示
- LLM分析結果の表示
- 手動での編集機能
- レビューステータスの変更

### 6.3 統計ダッシュボード
- 月別インシデント発生数
- 重要度別の分布
- 平均解決時間
- 頻出キーワード

## 7. 環境変数設定

```bash
# .env.local
DATABASE_URL=postgresql://user:password@host/database
SLACK_BOT_TOKEN=xoxb-xxxx
SLACK_SIGNING_SECRET=xxxx
SLACK_APP_TOKEN=xapp-xxxx
OPENAI_API_KEY=sk-xxxx # or ANTHROPIC_API_KEY
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
```

## 8. セキュリティ考慮事項

1. **Slack署名検証**: すべてのWebhookリクエストでSlack署名を検証
2. **API認証**: ダッシュボードアクセスには認証を実装（NextAuth.js推奨）
3. **データ暗号化**: センシティブな情報は暗号化して保存
4. **レート制限**: LLM APIコールにレート制限を実装

## 9. 実装順序（PoC向け）

1. **Phase 1: 基本機能（1週間）**
   - Slack App作成と基本的なWebhook受信
   - データベーススキーマ作成
   - メッセージ保存機能

2. **Phase 2: LLM連携（3-4日）**
   - LLMによる障害判定ロジック
   - 信頼度スコア計算
   - インシデント自動登録

3. **Phase 3: ダッシュボード（1週間）**
   - インシデント一覧表示
   - フィルタリング機能
   - 手動編集・レビュー機能

4. **Phase 4: 拡張機能（3-4日）**
   - 統計表示
   - 通知機能
   - エクスポート機能

## 10. 将来の拡張案

- 複数チャンネル対応
- 自動通知・エスカレーション
- SLAトラッキング
- 他の監視ツールとの連携
- 機械学習によるパターン認識