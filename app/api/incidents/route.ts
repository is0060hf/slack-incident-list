import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { Incident } from '@/lib/models/incident';

// インシデント一覧取得
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status');
    const confidenceMin = searchParams.get('confidence_min');
    const severityLevel = searchParams.get('severity_level');
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    
    // 基本クエリ
    let sqlQuery = 'SELECT * FROM incidents WHERE 1=1';
    const params: any[] = [];
    let paramCount = 0;
    
    // フィルタリング条件を追加
    if (status) {
      paramCount++;
      sqlQuery += ` AND status = $${paramCount}`;
      params.push(status);
    }
    
    if (confidenceMin) {
      paramCount++;
      sqlQuery += ` AND confidence_score >= $${paramCount}`;
      params.push(parseFloat(confidenceMin));
    }
    
    if (severityLevel) {
      paramCount++;
      sqlQuery += ` AND severity_level = $${paramCount}`;
      params.push(parseInt(severityLevel));
    }
    
    if (from) {
      paramCount++;
      sqlQuery += ` AND detected_at >= $${paramCount}`;
      params.push(new Date(from));
    }
    
    if (to) {
      paramCount++;
      sqlQuery += ` AND detected_at <= $${paramCount}`;
      params.push(new Date(to));
    }
    
    // ソート（最新順）
    sqlQuery += ' ORDER BY detected_at DESC';
    
    // クエリ実行
    const incidents = await query<Incident>(sqlQuery, params);
    
    // 統計情報も含める
    const stats = await query<{
      total: string;
      open_count: string;
      resolved_count: string;
      high_severity_count: string;
    }>(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'open' THEN 1 END) as open_count,
        COUNT(CASE WHEN status = 'resolved' THEN 1 END) as resolved_count,
        COUNT(CASE WHEN severity_level >= 3 THEN 1 END) as high_severity_count
      FROM incidents
    `);
    
    return NextResponse.json({
      incidents,
      stats: {
        total: parseInt(stats[0].total),
        open: parseInt(stats[0].open_count),
        resolved: parseInt(stats[0].resolved_count),
        highSeverity: parseInt(stats[0].high_severity_count)
      }
    });
    
  } catch (error) {
    console.error('Error fetching incidents:', error);
    return NextResponse.json(
      { error: 'Failed to fetch incidents' },
      { status: 500 }
    );
  }
} 