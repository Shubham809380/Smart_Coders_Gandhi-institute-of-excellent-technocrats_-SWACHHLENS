import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import logo from "../../logo.svg";

const TERMS_SECTIONS = [
  {
    title: "1. About SwachhLens",
    body: [
      "SwachhLens is a civic technology platform that helps citizens report unmanaged waste — such as litter, illegal dumping, and overflowing bins — to municipal sanitation teams, and helps those teams track cleanups through to completion.",
      "By creating an account you agree to these Terms of Service. If you do not agree, please do not use the platform.",
    ],
  },
  {
    title: "2. Your Account",
    body: [
      "You must provide accurate information when signing up, keep your password confidential, and are responsible for all activity that happens under your account.",
      "You may use SwachhLens as a Citizen (reporting waste) or as a Sanitation Worker (handling assigned cleanup tasks). Administrative access is provisioned only by the operating municipality and cannot be self-selected during signup.",
    ],
  },
  {
    title: "3. Acceptable Use",
    body: [
      "Reports must be genuine. Submitting false reports, prank photos, images of people taken without their knowledge, or content that is unlawful, abusive, obscene, or infringing is not allowed.",
      "Do not attempt to disrupt, reverse-engineer, scrape, or gain unauthorised access to the platform or its data. We may suspend accounts that violate these rules.",
    ],
  },
  {
    title: "4. Reports & AI Analysis",
    body: [
      "When you submit a report, photos are analysed automatically by our AI models to classify the waste type, estimate its volume and severity, and help prioritise cleanup dispatch. AI output is an aid, not a guarantee; final decisions rest with municipal staff.",
      "You grant us a limited licence to store and process the media and location you upload for the sole purpose of operating and improving the waste-reporting service.",
    ],
  },
  {
    title: "5. Availability & Changes",
    body: [
      "We work hard to keep SwachhLens available, but the service is provided \"as is\" without warranties of any kind. Features, analysis quality, and availability may change as the platform evolves.",
      "To the maximum extent permitted by law, SwachhLens is not liable for indirect or consequential losses arising from your use of the service.",
    ],
  },
  {
    title: "6. Contact",
    body: [
      "Questions about these terms can be raised from the Profile section of the app or sent to the support address shared by your municipality's programme team.",
    ],
  },
];

const PRIVACY_SECTIONS = [
  {
    title: "1. What We Collect",
    body: [
      "Account details: your name, email address, phone number (optional), role, and profile photo if you choose to add one.",
      "Report content: the photo/video you capture, GPS location and address of the reported site, and any note you add. For cleanup verification we also process before/after photos of the same site.",
    ],
  },
  {
    title: "2. How We Use It",
    body: [
      "To create and secure your account, authenticate you, and let you track your reports.",
      "To analyse report photos with AI, detect duplicates, prioritise dispatch, route suitable material to recycling partners, and notify you about progress. Email notifications (welcome, sign-in alerts, status updates) are sent to your registered email address.",
    ],
  },
  {
    title: "3. Passwords & Security",
    body: [
      "Passwords are stored only as bcrypt hashes — never in plain text. Password-reset links contain single-use tokens that expire within 30 minutes; we store only a cryptographic hash of each token.",
      "We never ask for your password by email. Emails claiming to be SwachhLens but asking for credentials should be ignored and reported.",
    ],
  },
  {
    title: "4. Sharing",
    body: [
      "Your report data is shared with authorised municipal sanitation staff for the purpose of handling the report. We do not sell personal data.",
      "We use trusted processors strictly on our instructions — cloud hosting and database (Neon), transactional email delivery (Brevo), map tiles (MapTiler/OpenStreetMap), and Google solely if you choose Google sign-in.",
    ],
  },
  {
    title: "5. Your Choices",
    body: [
      "Location is captured only when you submit a report; camera/gallery access is requested only for capturing evidence. You can update your name, phone, and photo from the Profile screen.",
      "You may request deletion of your account and associated personal data via the contact channel in the app, subject to record-keeping needs of municipal operations.",
    ],
  },
  {
    title: "6. Contact",
    body: [
      "For privacy questions or data requests, reach out through the in-app support option or the programme team running SwachhLens in your city.",
    ],
  },
];

function LegalContent({ kind }) {
  const sections = kind === "privacy" ? PRIVACY_SECTIONS : TERMS_SECTIONS;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-on-surface-variant" style={{ fontFamily: "Manrope" }}>
        Last updated: August 2026
      </p>
      {sections.map((section) => (
        <section key={section.title} className="bg-surface-container border border-outline-variant rounded-2xl p-5">
          <h3 className="text-base font-bold text-on-background mb-2" style={{ fontFamily: "Manrope" }}>
            {section.title}
          </h3>
          {section.body.map((para, i) => (
            <p key={i} className="text-sm text-on-surface-variant leading-relaxed mb-2 last:mb-0" style={{ fontFamily: "Manrope" }}>
              {para}
            </p>
          ))}
        </section>
      ))}
    </div>
  );
}

export function LegalPage({ kind }) {
  const navigate = useNavigate();
  const isPrivacy = kind === "privacy";
  return (
    <div className="min-h-screen bg-background flex flex-col font-display">
      {/* Header */}
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
              <span className="block text-white font-bold text-base leading-tight truncate" style={{ fontFamily: "Manrope" }}>
                {isPrivacy ? "Privacy Policy" : "Terms of Service"}
              </span>
              <span className="block text-primary-fixed-dim/70 text-[11px] leading-tight" style={{ fontFamily: "Manrope" }}>
                SwachhLens · AI-Powered Waste Response
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 pb-24">
          <LegalContent kind={kind} />
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => navigate("/signup")}
              className="bg-primary text-on-primary py-3 px-6 rounded-xl font-bold text-sm hover:opacity-90 active:scale-[0.98] transition-all"
              style={{ fontFamily: "Manrope" }}
            >
              Back to Sign Up
            </button>
            <button
              onClick={() => navigate(isPrivacy ? "/terms" : "/privacy-policy")}
              className="border border-outline-variant bg-surface-container text-on-background py-3 px-6 rounded-xl font-bold text-sm hover:bg-surface-container-high active:scale-[0.98] transition-all"
              style={{ fontFamily: "Manrope" }}
            >
              {isPrivacy ? "Read Terms of Service" : "Read Privacy Policy"}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

export function LegalModal({ open, kind, onClose }) {
  const isPrivacy = kind === "privacy";

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" onClick={onClose} />
      {/* Sheet */}
      <div
        className="relative w-full sm:max-w-xl bg-background rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[92vh] sm:max-h-[85vh]"
        style={{ animation: "legalSheetUp 0.28s cubic-bezier(0.22,1,0.36,1)" }}
      >
        <style>{`@keyframes legalSheetUp { from { opacity:0; transform: translateY(28px); } to { opacity:1; transform: translateY(0); } }`}</style>

        {/* Modal header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-outline-variant shrink-0">
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl flex items-center justify-center bg-surface-container text-on-surface-variant hover:text-on-surface transition-colors"
            aria-label="Back to signup"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
          <div className="min-w-0 flex-1">
            <span className="block font-bold text-on-background leading-tight" style={{ fontFamily: "Manrope" }}>
              {isPrivacy ? "Privacy Policy" : "Terms of Service"}
            </span>
            <span className="block text-xs text-on-surface-variant" style={{ fontFamily: "Manrope" }}>
              SwachhLens · Last updated August 2026
            </span>
          </div>
          <a
            href={isPrivacy ? "/privacy-policy" : "/terms"}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-semibold text-primary hover:underline shrink-0"
            style={{ fontFamily: "Manrope" }}
          >
            Open page
          </a>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto px-5 py-4 flex-1">
          <LegalContent kind={kind} />
        </div>

        {/* Footer action */}
        <div className="px-5 py-4 border-t border-outline-variant shrink-0">
          <button
            onClick={onClose}
            className="w-full bg-primary text-on-primary py-3 rounded-xl font-bold text-sm hover:opacity-90 active:scale-[0.98] transition-all"
            style={{ fontFamily: "Manrope" }}
          >
            Back to Sign Up
          </button>
        </div>
      </div>
    </div>
  );
}

export function TermsPage() { return <LegalPage kind="terms" />; }
export function PrivacyPage() { return <LegalPage kind="privacy" />; }
