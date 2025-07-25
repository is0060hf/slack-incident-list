export default function Home() {
  return (
    <main className="min-h-screen p-8 flex flex-col items-center justify-center">
      <div className="max-w-4xl mx-auto text-center">
        <h1 className="text-4xl font-bold mb-4">
          Slack Incident Management System
        </h1>
        <p className="text-lg text-gray-600 mb-8">
          Slackチャンネルの会話を監視し、障害を自動検出するシステム
        </p>
        <div className="bg-gray-100 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-2">Status</h2>
          <p className="text-green-600 font-medium">✅ System is running</p>
        </div>
      </div>
    </main>
  );
}
