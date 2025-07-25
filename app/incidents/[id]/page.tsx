'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';

interface Incident {
  id: string;
  slack_thread_ts: string;
  channel_id: string;
  title: string;
  description: string | null;
  severity_level: number;
  status: 'open' | 'resolved' | 'under_review';
  confidence_score: number;
  detected_at: string;
  resolved_at: string | null;
  impact_users: number | null;
  duration_minutes: number | null;
  llm_analysis: any;
}

interface Message {
  id: string;
  user_id: string;
  message: string;
  created_at: string;
}

interface Review {
  id: string;
  reviewed_by: string;
  review_status: string;
  review_notes: string | null;
  reviewed_at: string;
}

interface Report {
  id: string;
  incident_id: string;
  report_type: string;
  title: string;
  discovery_process: string;
  issue_overview: string;
  root_cause: string;
  actions_taken: string;
  future_considerations: string;
  generated_by: string;
  generated_at: string;
}

export default function IncidentDetail() {
  const params = useParams();
  const router = useRouter();
  const [incident, setIncident] = useState<Incident | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<any>({});
  const [reviewData, setReviewData] = useState({
    review_status: '',
    review_notes: '',
    reviewed_by: ''
  });
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

  useEffect(() => {
    fetchIncidentDetail();
  }, [params.id]);

  const fetchIncidentDetail = async () => {
    try {
      const response = await fetch(`/api/incidents/${params.id}`);
      const data = await response.json();
      
      setIncident(data.incident);
      setMessages(data.messages);
      setReviews(data.reviews);
      setReports(data.reports || []);
      setEditData({
        title: data.incident.title,
        description: data.incident.description || '',
        severity_level: data.incident.severity_level,
        status: data.incident.status
      });
    } catch (error) {
      console.error('Failed to fetch incident:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async () => {
    try {
      const response = await fetch(`/api/incidents/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editData)
      });
      
      if (response.ok) {
        await fetchIncidentDetail();
        setIsEditing(false);
      }
    } catch (error) {
      console.error('Failed to update incident:', error);
    }
  };

  const handleReview = async () => {
    try {
      const response = await fetch(`/api/incidents/${params.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reviewData)
      });
      
      if (response.ok) {
        await fetchIncidentDetail();
        setReviewData({ review_status: '', review_notes: '', reviewed_by: '' });
      }
    } catch (error) {
      console.error('Failed to submit review:', error);
    }
  };

  const generateReport = async () => {
    setIsGeneratingReport(true);
    try {
      const response = await fetch(`/api/incidents/${params.id}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ regenerate: true })
      });

      if (response.ok) {
        const data = await response.json();
        alert('レポートを生成しました');
        fetchIncidentDetail();
      } else {
        const error = await response.json();
        alert(`レポート生成に失敗しました: ${error.error}`);
      }
    } catch (error) {
      console.error('Error generating report:', error);
      alert('レポートの生成に失敗しました');
    } finally {
      setIsGeneratingReport(false);
    }
  };

  if (loading || !incident) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-gray-500">読み込み中...</div>
      </div>
    );
  }

  const getSeverityLabel = (level: number) => {
    const labels = { 1: '低', 2: '中', 3: '高', 4: '緊急' };
    return labels[level as keyof typeof labels] || '不明';
  };

  const getStatusLabel = (status: string) => {
    const labels = {
      open: 'Open',
      resolved: 'Resolved',
      under_review: 'Under Review'
    };
    return labels[status as keyof typeof labels] || status;
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* ヘッダー */}
      <div className="mb-8">
        <button
          onClick={() => router.push('/')}
          className="text-gray-500 hover:text-gray-700 mb-4 inline-block"
        >
          ← 一覧に戻る
        </button>
        
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex justify-between items-start mb-4">
            <div className="flex-1">
              {isEditing ? (
                <input
                  type="text"
                  value={editData.title}
                  onChange={(e) => setEditData({ ...editData, title: e.target.value })}
                  className="text-2xl font-bold w-full border-b border-gray-300 focus:border-indigo-500 outline-none"
                />
              ) : (
                <h1 className="text-2xl font-bold text-gray-900">{incident.title}</h1>
              )}
            </div>
            <div className="ml-4">
              {isEditing ? (
                <>
                  <button
                    onClick={handleUpdate}
                    className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 mr-2"
                  >
                    保存
                  </button>
                  <button
                    onClick={() => setIsEditing(false)}
                    className="bg-gray-300 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-400"
                  >
                    キャンセル
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setIsEditing(true)}
                  className="bg-gray-200 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-300"
                >
                  編集
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-gray-500">ステータス</p>
              {isEditing ? (
                <select
                  value={editData.status}
                  onChange={(e) => setEditData({ ...editData, status: e.target.value })}
                  className="mt-1 w-full border border-gray-300 rounded-md px-2 py-1"
                >
                  <option value="open">Open</option>
                  <option value="resolved">Resolved</option>
                  <option value="under_review">Under Review</option>
                </select>
              ) : (
                <p className="font-medium">{getStatusLabel(incident.status)}</p>
              )}
            </div>
            <div>
              <p className="text-sm text-gray-500">重要度</p>
              {isEditing ? (
                <select
                  value={editData.severity_level}
                  onChange={(e) => setEditData({ ...editData, severity_level: parseInt(e.target.value) })}
                  className="mt-1 w-full border border-gray-300 rounded-md px-2 py-1"
                >
                  <option value="1">低</option>
                  <option value="2">中</option>
                  <option value="3">高</option>
                  <option value="4">緊急</option>
                </select>
              ) : (
                <p className="font-medium">{getSeverityLabel(incident.severity_level)}</p>
              )}
            </div>
            <div>
              <p className="text-sm text-gray-500">信頼度</p>
              <p className="font-medium">{(incident.confidence_score * 100).toFixed(0)}%</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">検出日時</p>
              <p className="font-medium">
                {format(new Date(incident.detected_at), 'yyyy/MM/dd HH:mm', { locale: ja })}
              </p>
            </div>
          </div>

          {isEditing ? (
            <div className="mt-4">
              <label className="block text-sm text-gray-500 mb-1">説明</label>
              <textarea
                value={editData.description}
                onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
                rows={3}
              />
            </div>
          ) : (
            incident.description && (
              <div className="mt-4">
                <p className="text-sm text-gray-500">説明</p>
                <p className="mt-1">{incident.description}</p>
              </div>
            )
          )}
        </div>
      </div>

      {/* Slackメッセージ履歴 */}
      <div className="bg-white shadow rounded-lg p-6 mb-8">
        <h2 className="text-lg font-medium mb-4">Slackメッセージ履歴</h2>
        <div className="space-y-3">
          {messages.map((message) => (
            <div key={message.id} className="border-l-2 border-gray-200 pl-4">
              <div className="flex items-center text-sm text-gray-500">
                <span className="font-medium">{message.user_id}</span>
                <span className="mx-2">·</span>
                <span>{format(new Date(message.created_at), 'HH:mm:ss', { locale: ja })}</span>
              </div>
              <p className="mt-1 text-gray-900">{message.message}</p>
            </div>
          ))}
        </div>
      </div>

      {/* LLM分析結果 */}
      {incident.llm_analysis && (
        <div className="bg-white shadow rounded-lg p-6 mb-8">
          <h2 className="text-lg font-medium mb-4">LLM分析結果</h2>
          <div className="bg-gray-50 rounded p-4">
            <pre className="text-sm">{JSON.stringify(incident.llm_analysis, null, 2)}</pre>
          </div>
        </div>
      )}

      {/* レビュー */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium mb-4">レビュー</h2>
        
        {/* レビュー投稿フォーム */}
        <div className="mb-6 p-4 border border-gray-200 rounded">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                レビューステータス
              </label>
              <select
                value={reviewData.review_status}
                onChange={(e) => setReviewData({ ...reviewData, review_status: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
              >
                <option value="">選択してください</option>
                <option value="confirmed">確認済み</option>
                <option value="false_positive">誤検知</option>
                <option value="needs_investigation">調査必要</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                レビュー者
              </label>
              <input
                type="text"
                value={reviewData.reviewed_by}
                onChange={(e) => setReviewData({ ...reviewData, reviewed_by: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
                placeholder="お名前"
              />
            </div>
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              レビューメモ
            </label>
            <textarea
              value={reviewData.review_notes}
              onChange={(e) => setReviewData({ ...reviewData, review_notes: e.target.value })}
              className="w-full border border-gray-300 rounded-md px-3 py-2"
              rows={3}
            />
          </div>
          <button
            onClick={handleReview}
            disabled={!reviewData.review_status}
            className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 disabled:bg-gray-400"
          >
            レビューを投稿
          </button>
        </div>

        {/* レビュー履歴 */}
        <div className="space-y-3">
          {reviews.map((review) => (
            <div key={review.id} className="border-b border-gray-200 pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="font-medium">{review.reviewed_by}</span>
                  <span className="text-sm text-gray-500">
                    {format(new Date(review.reviewed_at), 'yyyy/MM/dd HH:mm', { locale: ja })}
                  </span>
                </div>
                <span className={`px-2 py-1 text-xs rounded-full ${
                  review.review_status === 'confirmed' ? 'bg-green-100 text-green-800' :
                  review.review_status === 'false_positive' ? 'bg-yellow-100 text-yellow-800' :
                  'bg-blue-100 text-blue-800'
                }`}>
                  {review.review_status === 'confirmed' ? '確認済み' :
                   review.review_status === 'false_positive' ? '誤検知' :
                   '調査必要'}
                </span>
              </div>
              {review.review_notes && (
                <p className="mt-2 text-sm text-gray-600">{review.review_notes}</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 分析レポート */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-gray-900">分析レポート</h2>
          <button
            onClick={generateReport}
            disabled={isGeneratingReport}
            className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50"
          >
            {isGeneratingReport ? '生成中...' : 'レポート生成'}
          </button>
        </div>

        {reports.length > 0 ? (
          <div className="space-y-6">
            {reports.map((report, index) => (
              <div key={report.id} className={`border rounded-lg p-6 ${index === 0 ? 'border-purple-300 bg-purple-50' : 'border-gray-200'}`}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-medium text-lg">{report.title}</h3>
                  <span className="text-sm text-gray-500">
                    {format(new Date(report.generated_at), 'yyyy/MM/dd HH:mm', { locale: ja })}
                  </span>
                </div>

                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium text-gray-700 mb-1">発覚した経緯</h4>
                    <p className="text-sm text-gray-600 whitespace-pre-wrap">{report.discovery_process}</p>
                  </div>

                  <div>
                    <h4 className="font-medium text-gray-700 mb-1">トラブルの概要</h4>
                    <p className="text-sm text-gray-600 whitespace-pre-wrap">{report.issue_overview}</p>
                  </div>

                  <div>
                    <h4 className="font-medium text-gray-700 mb-1">主な原因</h4>
                    <p className="text-sm text-gray-600 whitespace-pre-wrap">{report.root_cause}</p>
                  </div>

                  <div>
                    <h4 className="font-medium text-gray-700 mb-1">対応や改善策</h4>
                    <p className="text-sm text-gray-600 whitespace-pre-wrap">{report.actions_taken}</p>
                  </div>

                  <div>
                    <h4 className="font-medium text-gray-700 mb-1">今後検討が必要なこと</h4>
                    <p className="text-sm text-gray-600 whitespace-pre-wrap">{report.future_considerations}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-center py-8">まだレポートが生成されていません</p>
        )}
      </div>
    </div>
  );
} 