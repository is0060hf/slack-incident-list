import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET() {
  try {
    // 月別インシデント数
    const monthlyIncidents = await query<{
      month: string;
      count: string;
    }>(`
      SELECT 
        TO_CHAR(detected_at, 'YYYY-MM') as month,
        COUNT(*) as count
      FROM incidents
      WHERE detected_at >= NOW() - INTERVAL '6 months'
      GROUP BY TO_CHAR(detected_at, 'YYYY-MM')
      ORDER BY month DESC
    `);

    // 重要度別分布
    const severityDistribution = await query<{
      severity_level: number;
      count: string;
    }>(`
      SELECT 
        severity_level,
        COUNT(*) as count
      FROM incidents
      GROUP BY severity_level
      ORDER BY severity_level
    `);

    // 平均解決時間（分）
    const avgResolutionTime = await query<{
      avg_duration: string;
    }>(`
      SELECT 
        AVG(duration_minutes) as avg_duration
      FROM incidents
      WHERE status = 'resolved' AND duration_minutes IS NOT NULL
    `);

    // 頻出キーワード（タイトルから抽出）
    const keywords = await query<{
      keyword: string;
      count: string;
    }>(`
      WITH words AS (
        SELECT LOWER(unnest(string_to_array(title, ' '))) as keyword
        FROM incidents
      )
      SELECT 
        keyword,
        COUNT(*) as count
      FROM words
      WHERE LENGTH(keyword) > 3
      GROUP BY keyword
      ORDER BY count DESC
      LIMIT 20
    `);

    // ステータス別の件数
    const statusCounts = await query<{
      status: string;
      count: string;
    }>(`
      SELECT 
        status,
        COUNT(*) as count
      FROM incidents
      GROUP BY status
    `);

    return NextResponse.json({
      monthlyIncidents: monthlyIncidents.map(item => ({
        month: item.month,
        count: parseInt(item.count)
      })),
      severityDistribution: severityDistribution.map(item => ({
        severity_level: item.severity_level,
        count: parseInt(item.count)
      })),
      avgResolutionTime: avgResolutionTime[0]?.avg_duration 
        ? Math.round(parseFloat(avgResolutionTime[0].avg_duration))
        : null,
      topKeywords: keywords.map(item => ({
        keyword: item.keyword,
        count: parseInt(item.count)
      })),
      statusCounts: statusCounts.map(item => ({
        status: item.status,
        count: parseInt(item.count)
      }))
    });
    
  } catch (error) {
    console.error('Error fetching statistics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch statistics' },
      { status: 500 }
    );
  }
} 