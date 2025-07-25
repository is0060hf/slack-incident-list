import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { Incident } from '@/lib/models/incident';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const format_type = searchParams.get('format') || 'json';
    const status = searchParams.get('status');
    const confidenceMin = searchParams.get('confidence_min');
    const severityLevel = searchParams.get('severity_level');
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    
    // 基本クエリ
    let sqlQuery = 'SELECT * FROM incidents WHERE 1=1';
    const params: any[] = [];
    let paramCount = 0;
    
    // フィルタリング条件を追加（インシデント一覧と同じ）
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
    
    if (format_type === 'csv') {
      // CSV形式でエクスポート
      const csvHeader = [
        'ID',
        'タイトル',
        '説明',
        'ステータス',
        '重要度',
        '信頼度',
        '検出日時',
        '解決日時',
        '影響ユーザー数',
        '解決時間（分）',
        'チャンネルID',
        'スレッドタイムスタンプ'
      ].join(',');
      
      const csvRows = incidents.map(incident => {
        return [
          incident.id,
          `"${incident.title.replace(/"/g, '""')}"`,
          `"${(incident.description || '').replace(/"/g, '""')}"`,
          incident.status,
          incident.severity_level,
          incident.confidence_score,
          format(new Date(incident.detected_at), 'yyyy-MM-dd HH:mm:ss', { locale: ja }),
          incident.resolved_at ? format(new Date(incident.resolved_at), 'yyyy-MM-dd HH:mm:ss', { locale: ja }) : '',
          incident.impact_users || '',
          incident.duration_minutes || '',
          incident.channel_id,
          incident.slack_thread_ts
        ].join(',');
      });
      
      const csv = [csvHeader, ...csvRows].join('\n');
      
      // BOMを追加（Excelで日本語が文字化けしないように）
      const bom = '\uFEFF';
      const csvWithBom = bom + csv;
      
      return new NextResponse(csvWithBom, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="incidents_${format(new Date(), 'yyyyMMdd_HHmmss')}.csv"`
        }
      });
      
    } else {
      // JSON形式でエクスポート
      const exportData = {
        export_date: new Date().toISOString(),
        total_count: incidents.length,
        filters: {
          status,
          confidence_min: confidenceMin,
          severity_level: severityLevel,
          date_from: from,
          date_to: to
        },
        incidents: incidents.map(incident => ({
          ...incident,
          detected_at_formatted: format(new Date(incident.detected_at), 'yyyy-MM-dd HH:mm:ss', { locale: ja }),
          resolved_at_formatted: incident.resolved_at 
            ? format(new Date(incident.resolved_at), 'yyyy-MM-dd HH:mm:ss', { locale: ja })
            : null
        }))
      };
      
      return new NextResponse(JSON.stringify(exportData, null, 2), {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="incidents_${format(new Date(), 'yyyyMMdd_HHmmss')}.json"`
        }
      });
    }
    
  } catch (error) {
    console.error('Error exporting incidents:', error);
    return NextResponse.json(
      { error: 'Failed to export incidents' },
      { status: 500 }
    );
  }
} 