import { query, transaction } from '../db';
import { Incident, IncidentMessage, CreateIncidentData } from '../models/incident';

// インシデントをスレッドタイムスタンプで検索
export async function findIncidentByThreadTs(
  threadTs: string
): Promise<Incident | null> {
  const results = await query<Incident>(
    'SELECT * FROM incidents WHERE slack_thread_ts = $1',
    [threadTs]
  );
  
  return results.length > 0 ? results[0] : null;
}

// インシデントを作成
export async function createIncident(
  data: CreateIncidentData
): Promise<Incident> {
  const results = await query<Incident>(
    `INSERT INTO incidents (
      slack_thread_ts, channel_id, title, description,
      severity_level, confidence_score, detected_at, llm_analysis
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *`,
    [
      data.slack_thread_ts,
      data.channel_id,
      data.title,
      data.description,
      data.severity_level,
      data.confidence_score,
      data.detected_at,
      JSON.stringify(data.llm_analysis)
    ]
  );
  
  return results[0];
}

// インシデントのステータスを更新
export async function updateIncidentStatus(
  id: string,
  status: 'open' | 'resolved' | 'under_review',
  resolvedAt?: Date
): Promise<Incident> {
  const results = await query<Incident>(
    `UPDATE incidents 
     SET status = $2, resolved_at = $3
     WHERE id = $1
     RETURNING *`,
    [id, status, resolvedAt || null]
  );
  
  return results[0];
}

// メッセージを保存
export async function saveMessage(
  incidentId: string,
  slackTs: string,
  userId: string,
  message: string
): Promise<IncidentMessage> {
  const results = await query<IncidentMessage>(
    `INSERT INTO incident_messages (incident_id, slack_ts, user_id, message)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [incidentId, slackTs, userId, message]
  );
  
  return results[0];
}

// インシデントに関連するメッセージを取得
export async function getIncidentMessages(
  incidentId: string
): Promise<IncidentMessage[]> {
  return await query<IncidentMessage>(
    'SELECT * FROM incident_messages WHERE incident_id = $1 ORDER BY created_at ASC',
    [incidentId]
  );
}

// メッセージが既に保存されているか確認
export async function isMessageSaved(
  slackTs: string
): Promise<boolean> {
  const results = await query<{ count: string }>(
    'SELECT COUNT(*) as count FROM incident_messages WHERE slack_ts = $1',
    [slackTs]
  );
  
  return parseInt(results[0].count) > 0;
}

// インシデントとメッセージを一括で作成（トランザクション）
export async function createIncidentWithMessages(
  incidentData: CreateIncidentData,
  messages: Array<{ slack_ts: string; user_id: string; message: string }>
): Promise<{ incident: Incident; messages: IncidentMessage[] }> {
  const queries = [];
  
  // インシデント作成クエリ
  queries.push({
    text: `INSERT INTO incidents (
      slack_thread_ts, channel_id, title, description,
      severity_level, confidence_score, detected_at, llm_analysis
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *`,
    params: [
      incidentData.slack_thread_ts,
      incidentData.channel_id,
      incidentData.title,
      incidentData.description,
      incidentData.severity_level,
      incidentData.confidence_score,
      incidentData.detected_at,
      JSON.stringify(incidentData.llm_analysis)
    ]
  });
  
  // メッセージ作成クエリ（最初のクエリの結果を使用）
  const messageQueries = messages.map((msg, index) => ({
    text: `INSERT INTO incident_messages (incident_id, slack_ts, user_id, message)
           VALUES ((SELECT id FROM incidents WHERE slack_thread_ts = $1), $2, $3, $4)
           RETURNING *`,
    params: [incidentData.slack_thread_ts, msg.slack_ts, msg.user_id, msg.message]
  }));
  
  queries.push(...messageQueries);
  
  const results = await transaction<any>(queries);
  
  return {
    incident: (results[0] as any[])[0] as Incident,
    messages: results.slice(1).map(r => (r as any[])[0]) as IncidentMessage[]
  };
} 