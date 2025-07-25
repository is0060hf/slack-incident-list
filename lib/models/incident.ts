// インシデントの型定義
export interface Incident {
  id: string;
  slack_thread_ts: string;
  channel_id: string;
  title: string;
  description: string | null;
  severity_level: number;
  status: 'open' | 'resolved' | 'under_review';
  confidence_score: number;
  detected_at: Date;
  resolved_at: Date | null;
  impact_users: number | null;
  duration_minutes: number | null;
  llm_analysis: Record<string, any> | null;
  created_at: Date;
  updated_at: Date;
}

// インシデントメッセージの型定義
export interface IncidentMessage {
  id: string;
  incident_id: string;
  slack_ts: string;
  user_id: string;
  message: string;
  created_at: Date;
}

// インシデントレビューの型定義
export interface IncidentReview {
  id: string;
  incident_id: string;
  reviewed_by: string | null;
  review_status: string;
  review_notes: string | null;
  reviewed_at: Date;
}

// Slackメッセージの型定義
export interface SlackMessage {
  channel: string;
  user: string;
  text: string;
  ts: string;
  thread_ts?: string;
  type: string;
  subtype?: string;
}

// インシデント作成用のデータ
export interface CreateIncidentData {
  slack_thread_ts: string;
  channel_id: string;
  title: string;
  description: string;
  severity_level: number;
  confidence_score: number;
  detected_at: Date;
  llm_analysis: Record<string, any>;
} 