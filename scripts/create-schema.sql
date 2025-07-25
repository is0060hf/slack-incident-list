-- Slackインシデント管理システム データベーススキーマ

-- incidents テーブル
CREATE TABLE IF NOT EXISTS incidents (
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

-- incidents テーブルのインデックス
CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_severity ON incidents(severity_level);
CREATE INDEX IF NOT EXISTS idx_incidents_confidence ON incidents(confidence_score);

-- incident_messages テーブル
CREATE TABLE IF NOT EXISTS incident_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID REFERENCES incidents(id) ON DELETE CASCADE,
  slack_ts VARCHAR(20) NOT NULL,
  user_id VARCHAR(20) NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- incident_messages テーブルのインデックス
CREATE INDEX IF NOT EXISTS idx_messages_incident ON incident_messages(incident_id);

-- incident_reviews テーブル
CREATE TABLE IF NOT EXISTS incident_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID REFERENCES incidents(id) ON DELETE CASCADE,
  reviewed_by VARCHAR(100),
  review_status VARCHAR(20) NOT NULL,
  review_notes TEXT,
  reviewed_at TIMESTAMP DEFAULT NOW()
);

-- 更新時刻を自動更新するトリガー関数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- incidentsテーブルに更新トリガーを設定
CREATE TRIGGER update_incidents_updated_at BEFORE UPDATE
    ON incidents FOR EACH ROW EXECUTE FUNCTION 
    update_updated_at_column(); 