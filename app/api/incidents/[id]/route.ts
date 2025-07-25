import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { Incident, IncidentMessage, IncidentReport } from '@/lib/models/incident';
import { z } from 'zod';

// インシデント詳細取得
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    // インシデント情報を取得
    const incidents = await query<Incident>(
      'SELECT * FROM incidents WHERE id = $1',
      [id]
    );
    
    if (incidents.length === 0) {
      return NextResponse.json(
        { error: 'Incident not found' },
        { status: 404 }
      );
    }
    
    const incident = incidents[0];
    
    // 関連するメッセージを取得
    const messages = await query<IncidentMessage>(
      'SELECT * FROM incident_messages WHERE incident_id = $1 ORDER BY created_at ASC',
      [id]
    );
    
    // レビュー履歴を取得
    const reviews = await query(
      'SELECT * FROM incident_reviews WHERE incident_id = $1 ORDER BY reviewed_at DESC',
      [id]
    );
    
    // 分析レポートを取得
    const reports = await query<IncidentReport>(
      'SELECT * FROM incident_reports WHERE incident_id = $1 ORDER BY generated_at DESC',
      [id]
    );
    
    return NextResponse.json({
      incident,
      messages,
      reviews,
      reports
    });
    
  } catch (error) {
    console.error('Error fetching incident:', error);
    return NextResponse.json(
      { error: 'Failed to fetch incident' },
      { status: 500 }
    );
  }
}

// インシデント更新のスキーマ
const UpdateIncidentSchema = z.object({
  status: z.enum(['open', 'resolved', 'under_review']).optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  severity_level: z.number().min(1).max(4).optional(),
  impact_users: z.number().optional(),
  resolved_at: z.string().optional()
});

// インシデント更新
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    
    // バリデーション
    const validatedData = UpdateIncidentSchema.parse(body);
    
    // 更新するフィールドを動的に構築
    const updateFields: string[] = [];
    const updateValues: any[] = [];
    let paramCount = 1;
    
    if (validatedData.status !== undefined) {
      updateFields.push(`status = $${paramCount}`);
      updateValues.push(validatedData.status);
      paramCount++;
    }
    
    if (validatedData.title !== undefined) {
      updateFields.push(`title = $${paramCount}`);
      updateValues.push(validatedData.title);
      paramCount++;
    }
    
    if (validatedData.description !== undefined) {
      updateFields.push(`description = $${paramCount}`);
      updateValues.push(validatedData.description);
      paramCount++;
    }
    
    if (validatedData.severity_level !== undefined) {
      updateFields.push(`severity_level = $${paramCount}`);
      updateValues.push(validatedData.severity_level);
      paramCount++;
    }
    
    if (validatedData.impact_users !== undefined) {
      updateFields.push(`impact_users = $${paramCount}`);
      updateValues.push(validatedData.impact_users);
      paramCount++;
    }
    
    if (validatedData.resolved_at !== undefined) {
      updateFields.push(`resolved_at = $${paramCount}`);
      updateValues.push(new Date(validatedData.resolved_at));
      paramCount++;
    }
    
    // ステータスがresolvedに変更された場合、自動的に解決時刻を設定
    if (validatedData.status === 'resolved' && !validatedData.resolved_at) {
      updateFields.push(`resolved_at = $${paramCount}`);
      updateValues.push(new Date());
      paramCount++;
    }
    
    if (updateFields.length === 0) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      );
    }
    
    // 更新実行
    updateValues.push(id);
    const updatedIncidents = await query<Incident>(
      `UPDATE incidents SET ${updateFields.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      updateValues
    );
    
    if (updatedIncidents.length === 0) {
      return NextResponse.json(
        { error: 'Incident not found' },
        { status: 404 }
      );
    }
    
    // 解決された場合、期間を計算
    const incident = updatedIncidents[0];
    if (incident.status === 'resolved' && incident.resolved_at) {
      const duration = Math.floor(
        (new Date(incident.resolved_at).getTime() - new Date(incident.detected_at).getTime()) / 60000
      );
      await query(
        'UPDATE incidents SET duration_minutes = $1 WHERE id = $2',
        [duration, id]
      );
    }
    
    return NextResponse.json(updatedIncidents[0]);
    
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }
    
    console.error('Error updating incident:', error);
    return NextResponse.json(
      { error: 'Failed to update incident' },
      { status: 500 }
    );
  }
} 