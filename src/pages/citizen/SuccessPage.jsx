import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

export default function SuccessPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [copied, setCopied] = useState(false);

  const reportId = location.state?.reportId || 'SWL-00000';

  const stages = [
    { label: 'Submitted', active: true },
    { label: 'AI Analysis', active: false },
    { label: 'Team Dispatched', active: false },
    { label: 'Cleanup in Progress', active: false },
    { label: 'Resolved', active: false },
  ];

  const copyToClipboard = () => {
    navigator.clipboard.writeText(reportId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="bg-background min-h-screen pb-8">
      <main className="flex flex-col items-center px-4 pt-12 pb-6 gap-6 max-w-lg mx-auto w-full">

        <div className="flex flex-col items-center gap-3">
          <div className="relative w-24 h-24 flex items-center justify-center">
            <span className="absolute inset-0 rounded-full bg-green-500/20 animate-ping" />
            <span className="absolute inset-1 rounded-full bg-green-500/10 animate-pulse" />
            <div className="w-24 h-24 rounded-full bg-green-500 flex items-center justify-center shadow-lg shadow-green-500/30">
              <span className="material-symbols-outlined text-white text-5xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                check
              </span>
            </div>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 text-center">Report Submitted!</h1>
          <p className="text-sm text-gray-500 text-center max-w-xs">
            Your report has been received and is being processed.
          </p>
        </div>

        <div className="w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex items-center gap-3">
          <span className="material-symbols-outlined text-gray-400 text-xl">
            tag
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-400 font-medium">Report ID</p>
            <p className="text-sm font-bold text-gray-900 font-mono tracking-wide truncate">{reportId}</p>
          </div>
          <button
            onClick={copyToClipboard}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors active:scale-95 border"
            style={{
              backgroundColor: copied ? '#f0fdf4' : '#f9fafb',
              borderColor: copied ? '#bbf7d0' : '#e5e7eb',
              color: copied ? '#16a34a' : '#6b7280',
            }}
          >
            <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 1" }}>
              {copied ? 'check' : 'content_copy'}
            </span>
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>

        <div className="w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <h2 className="text-base font-bold text-gray-900 mb-5">Report Progress</h2>
          <div className="flex flex-col">
            {stages.map((stage, i) => {
              const isLast = i === stages.length - 1;
              const isCompleted = i === 0;
              return (
                <div key={i} className="flex items-stretch gap-3">
                  <div className="flex flex-col items-center">
                    <div
                      className={`relative w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                        isCompleted
                          ? 'bg-green-500'
                          : 'border-2 border-gray-300 bg-white'
                      }`}
                    >
                      {isCompleted && (
                        <span className="material-symbols-outlined text-white text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>
                          check
                        </span>
                      )}
                      {isCompleted && (
                        <span className="absolute inset-0 rounded-full bg-green-400 animate-ping opacity-30" />
                      )}
                    </div>
                    {!isLast && (
                      <div className={`w-0.5 flex-1 min-h-[32px] ${isCompleted ? 'bg-green-500' : 'bg-gray-200'}`} />
                    )}
                  </div>
                  <div className={`pb-5 ${isLast ? 'pb-0' : ''}`}>
                    <p
                      className={`text-sm font-semibold ${
                        isCompleted ? 'text-green-600' : 'text-gray-400'
                      }`}
                    >
                      {stage.label}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="w-full flex flex-col gap-3 mt-2">
          <button
            onClick={() => navigate('/tracking', { state: { reportId } })}
            className="w-full h-13 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.98] bg-green-600 text-white shadow-lg shadow-green-600/25 hover:bg-green-700"
          >
            <span className="material-symbols-outlined text-lg">progress_activity</span>
            Track Progress
          </button>
          <button
            onClick={() => navigate('/home')}
            className="w-full h-13 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.98] bg-gray-100 text-gray-700 hover:bg-gray-200"
          >
            <span className="material-symbols-outlined text-lg">home</span>
            Back to Home
          </button>
        </div>
      </main>
    </div>
  );
}
