import { useNavigate } from "react-router-dom";
import logo from "../../logo.svg";

const FEATURES = [
  { icon: "smart_toy", title: "AI Waste Classification", desc: "Multi-label CNN classifies waste type, estimates volume, and assigns severity in seconds." },
  { icon: "verified", title: "Duplicate Detection", desc: "Location-aware duplicate matching prevents wasted cleanup trips for the same spot." },
  { icon: "route", title: "Smart Dispatch", desc: "AI-powered team assignment based on ward, vehicle capability, proximity, and workload." },
  { icon: "map", title: "Live Tracking", desc: "Real-time map view of waste hotspots and report progress from submission to resolution." },
];

export default function About() {
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
                About SwachhLens
              </span>
              <span className="block text-primary-fixed-dim/70 text-[11px] leading-tight" style={{ fontFamily: "Manrope" }}>
                AI-Powered Waste Response
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 pb-24">
          {/* Hero */}
          <div className="text-center mb-8">
            <img src={logo} alt="SwachhLens" className="w-16 h-16 rounded-2xl mx-auto mb-4 shadow-lg" />
            <h1 className="text-xl font-bold text-on-background mb-1" style={{ fontFamily: "Manrope" }}>SwachhLens</h1>
            <p className="text-sm text-on-surface-variant" style={{ fontFamily: "Manrope" }}>
              AI-Powered Waste Response Platform
            </p>
            <p className="text-xs text-on-surface-variant mt-1" style={{ fontFamily: "Manrope" }}>
              Version 1.0.0 &middot; 2026
            </p>
          </div>

          {/* Mission */}
          <div className="bg-surface-container border border-outline-variant rounded-2xl p-5 mb-6">
            <h2 className="text-sm font-bold text-on-background mb-2" style={{ fontFamily: "Manrope" }}>Our Mission</h2>
            <p className="text-sm text-on-surface-variant leading-relaxed" style={{ fontFamily: "Manrope" }}>
              SwachhLens helps citizens report unmanaged waste — litter, illegal dumping, overflowing bins —
              and connects them directly to municipal sanitation teams. Our AI classifies waste, estimates
              severity, and prioritizes dispatch so cleanups happen faster and smarter.
            </p>
          </div>

          {/* Features */}
          <h2 className="text-sm font-bold text-on-surface-variant uppercase tracking-wider mb-3" style={{ fontFamily: "Manrope" }}>
            Key Features
          </h2>
          <div className="flex flex-col gap-3 mb-8">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex items-start gap-3 bg-surface-container border border-outline-variant rounded-2xl p-4">
                <span className="material-symbols-outlined text-primary text-xl mt-0.5">{f.icon}</span>
                <div>
                  <h3 className="text-sm font-bold text-on-background mb-0.5" style={{ fontFamily: "Manrope" }}>{f.title}</h3>
                  <p className="text-xs text-on-surface-variant leading-relaxed" style={{ fontFamily: "Manrope" }}>{f.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Tech */}
          <div className="bg-surface-container border border-outline-variant rounded-2xl p-5 mb-6">
            <h2 className="text-sm font-bold text-on-background mb-2" style={{ fontFamily: "Manrope" }}>Technology</h2>
            <p className="text-sm text-on-surface-variant leading-relaxed mb-2" style={{ fontFamily: "Manrope" }}>
              Built with EfficientNet-B0 multi-label CNN for on-device waste classification,
              Gemini vision API for verification, and a real-time priority dispatch engine.
            </p>
            <p className="text-xs text-on-surface-variant" style={{ fontFamily: "Manrope" }}>
              Frontend: React &middot; MUI &middot; Vercel &nbsp;|&nbsp; Backend: Node.js &middot; Neon DB
            </p>
          </div>

          {/* Links */}
          <div className="flex flex-col gap-2">
            <button
              onClick={() => navigate("/terms")}
              className="w-full text-left bg-surface-container border border-outline-variant rounded-2xl px-5 py-4 flex items-center justify-between hover:bg-surface-container-high transition-colors"
            >
              <span className="text-sm font-bold text-on-background" style={{ fontFamily: "Manrope" }}>Terms of Service</span>
              <span className="material-symbols-outlined text-on-surface-variant text-xl">chevron_right</span>
            </button>
            <button
              onClick={() => navigate("/privacy-policy")}
              className="w-full text-left bg-surface-container border border-outline-variant rounded-2xl px-5 py-4 flex items-center justify-between hover:bg-surface-container-high transition-colors"
            >
              <span className="text-sm font-bold text-on-background" style={{ fontFamily: "Manrope" }}>Privacy Policy</span>
              <span className="material-symbols-outlined text-on-surface-variant text-xl">chevron_right</span>
            </button>
          </div>

          {/* Footer */}
          <p className="text-center text-xs text-on-surface-variant mt-8" style={{ fontFamily: "Manrope" }}>
            Made for TechNova 2026
          </p>
        </div>
      </main>
    </div>
  );
}
