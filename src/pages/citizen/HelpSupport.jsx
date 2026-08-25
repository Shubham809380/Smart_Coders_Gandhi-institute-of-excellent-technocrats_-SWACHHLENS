import { useNavigate } from "react-router-dom";
import logo from "../../logo.svg";

const FAQ = [
  {
    q: "How do I report waste?",
    a: "Tap 'Report Waste' on the home screen, take a photo of the waste, and submit. Our AI will classify the waste type, estimate volume, and route your report to the municipal team automatically.",
  },
  {
    q: "What happens after I submit a report?",
    a: "Your report enters the review queue. A municipal staff member reviews the AI analysis, assigns a cleanup team, and you can track progress in real time under 'My Reports'.",
  },
  {
    q: "Why was my photo rejected?",
    a: "The AI may reject a photo if it is too blurry, too dark, or does not clearly show waste. Retake a clear, well-lit photo focused on the waste for best results.",
  },
  {
    q: "Can I report the same waste location twice?",
    a: "Yes. The system will flag it as a possible duplicate so staff can check if a previous report already covers it. Duplicate detection helps avoid wasted cleanup trips.",
  },
  {
    q: "How do I track my report status?",
    a: "Go to 'My Reports' from the home screen. Each report shows its current status: Submitted, AI Analyzed, Under Review, Assigned, or Resolved.",
  },
  {
    q: "I am a sanitation worker. How do I use the app?",
    a: "Log in with your worker credentials. You will see assigned tasks on your home screen with navigation, photo verification steps, and cleanup completion flow.",
  },
];

const TIPS = [
  { icon: "photo_camera", title: "Good Lighting", desc: "Take photos in daylight or well-lit areas for accurate AI classification." },
  { icon: "center_focus_strong", title: "Focus on Waste", desc: "Keep the waste centered in the frame. Include surrounding context for volume estimation." },
  { icon: "location_on", title: "Enable Location", desc: "Allow location access so the cleanup team can find the exact spot." },
  { icon: "notifications", title: "Stay Notified", desc: "Enable notifications to get updates when your report is assigned or resolved." },
];

export default function HelpSupport() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-background flex flex-col font-display">
      <header
        className="sticky top-0 z-20 border-b border-outline-variant"
        style={{ background: "linear-gradient(160deg, #001a0d, #003319)" }}
      >
        <div className="max-w-3xl mx-auto flex items-center gap-3 px-4 sm:px-6 py-4 pt-[max(1rem,env(safe-area-inset-top))]">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-xl flex items-center justify-center text-white hover:bg-white/10 transition-colors shrink-0"
            aria-label="Go back"
          >
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <div className="flex items-center gap-2.5 min-w-0">
            <img src={logo} alt="" className="w-8 h-8 rounded-lg object-contain shrink-0" />
            <div className="min-w-0">
              <span className="block text-white font-bold text-base leading-tight" style={{ fontFamily: "Manrope" }}>
                Help & Support
              </span>
              <span className="block text-primary-fixed-dim/70 text-[11px] leading-tight" style={{ fontFamily: "Manrope" }}>
                SwachhLens · AI-Powered Waste Response
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 pb-24">
          {/* Tips */}
          <h2 className="text-sm font-bold text-on-surface-variant uppercase tracking-wider mb-3" style={{ fontFamily: "Manrope" }}>
            Tips for Better Reports
          </h2>
          <div className="grid grid-cols-2 gap-3 mb-8">
            {TIPS.map((t) => (
              <div key={t.title} className="bg-surface-container border border-outline-variant rounded-2xl p-4">
                <span className="material-symbols-outlined text-primary text-xl mb-2">{t.icon}</span>
                <h3 className="text-sm font-bold text-on-background mb-1" style={{ fontFamily: "Manrope" }}>{t.title}</h3>
                <p className="text-xs text-on-surface-variant leading-relaxed" style={{ fontFamily: "Manrope" }}>{t.desc}</p>
              </div>
            ))}
          </div>

          {/* FAQ */}
          <h2 className="text-sm font-bold text-on-surface-variant uppercase tracking-wider mb-3" style={{ fontFamily: "Manrope" }}>
            Frequently Asked Questions
          </h2>
          <div className="flex flex-col gap-3 mb-8">
            {FAQ.map((item) => (
              <details key={item.q} className="bg-surface-container border border-outline-variant rounded-2xl group">
                <summary className="flex items-center justify-between px-5 py-4 cursor-pointer list-none">
                  <span className="text-sm font-bold text-on-background pr-2" style={{ fontFamily: "Manrope" }}>{item.q}</span>
                  <span className="material-symbols-outlined text-on-surface-variant text-xl transition-transform group-open:rotate-180">
                    expand_more
                  </span>
                </summary>
                <div className="px-5 pb-4">
                  <p className="text-sm text-on-surface-variant leading-relaxed" style={{ fontFamily: "Manrope" }}>{item.a}</p>
                </div>
              </details>
            ))}
          </div>

          {/* Contact */}
          <h2 className="text-sm font-bold text-on-surface-variant uppercase tracking-wider mb-3" style={{ fontFamily: "Manrope" }}>
            Contact Us
          </h2>
          <div className="bg-surface-container border border-outline-variant rounded-2xl p-5">
            <div className="flex items-center gap-3 mb-3">
              <span className="material-symbols-outlined text-primary text-xl">mail</span>
              <div>
                <p className="text-sm font-bold text-on-background" style={{ fontFamily: "Manrope" }}>Email Support</p>
                <a href="mailto:patrashubham031@gmail.com" className="text-sm text-primary hover:underline" style={{ fontFamily: "Manrope" }}>
                  patrashubham031@gmail.com
                </a>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-primary text-xl">apartment</span>
              <div>
                <p className="text-sm font-bold text-on-background" style={{ fontFamily: "Manrope" }}>Municipal Programme Team</p>
                <p className="text-sm text-on-surface-variant" style={{ fontFamily: "Manrope" }}>
                  Reach out through your municipality's SwachhLens programme coordinator for account or deployment queries.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
