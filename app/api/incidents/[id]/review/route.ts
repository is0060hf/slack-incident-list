import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { z } from 'zod';

// レビュー投稿のスキーマ
const ReviewSchema = z.object({
  review_status: z.enum(['confirmed', 'false_positive', 'needs_investigation']),
  review_notes: z.string().optional(),
  reviewed_by: z.string().optional()
});

// インシデントレビューを投稿
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    
    // バリデーション
    const validatedData = ReviewSchema.parse(body);
    
    // インシデントの存在確認
    const incidents = await query(
      'SELECT id FROM incidents WHERE id = $1',
      [id]
    );
    
    if (incidents.length === 0) {
      return NextResponse.json(
        { error: 'Incident not found' },
        { status: 404 }
      );
    }
    
    // レビューを作成
    const review = await query(
      `INSERT INTO incident_reviews (incident_id, reviewed_by, review_status, review_notes)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [
        id,
        validatedData.reviewed_by || 'Anonymous',
        validatedData.review_status,
        validatedData.review_notes || null
      ]
    );
    
    // インシデントのステータスを更新
    if (validatedData.review_status === 'false_positive') {
      // 誤検知の場合はステータスを解決済みに
      await query(
        'UPDATE incidents SET status = $1, resolved_at = $2 WHERE id = $3',
        ['resolved', new Date(), id]
      );
    } else if (validatedData.review_status === 'needs_investigation') {
      // 調査が必要な場合はレビュー中に
      await query(
        'UPDATE incidents SET status = $1 WHERE id = $2',
        ['under_review', id]
      );
    }
    
    return NextResponse.json(review[0]);
    
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }
    
    console.error('Error creating review:', error);
    return NextResponse.json(
      { error: 'Failed to create review' },
      { status: 500 }
    );
  }
} 