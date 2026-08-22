import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import logo from "../logo.svg";
import { authService } from "../services.js";

const PERMISSIONS = [
  {
    id: "location",
    title: "Location Access",
    desc: "Helps us find nearby waste hotspots and assign cleanup teams to your area.",
    icon: "location_on",
    color: "#34d399",
    request: async () => {
      if (!navigator.geolocation) return "denied";
      return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
          () => resolve("granted"),
          () => resolve("denied"),
          { timeout: 8000 }
        );
      });
    },
  },
  {
    id: "camera",
    title: "Camera Access",
    desc: "Lets you snap photos of waste for instant AI classification and reporting.",
    icon: "photo_camera",
    color: "#06b6d4",
    request: async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        stream.getTracks().forEach((t) => t.stop());
        return "granted";
      } catch {
        return "denied";
      }
    },
  },
  {
    id: "video",
    title: "Video Recording",
    desc: "Record short clips of waste dumps for evidence and faster team response.",
    icon: "videocam",
    color: "#a78bfa",
    request: async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        stream.getTracks().forEach((t) => t.stop());
        return "granted";
      } catch {
        return "denied";
      }
    },
  },
  {
    id: "notification",
    title: "Notifications",
    desc: "Get alerts when your report is assigned, in progress, or resolved.",
    icon: "notifications",
    color: "#f59e0b",
    request: async () => {
      if (!("Notification" in window)) return "denied";
      if (Notification.permission === "granted") return "granted";
      if (Notification.permission === "denied") return "denied";
      const result = await Notification.requestPermission();
      return result;
    },
  },
  {
    id: "storage",
    title: "File Access",
    desc: "Upload waste photos and documents directly from your device storage.",
    icon: "folder",
    color: "#f472b6",
    request: async () => {
      try {
        if (window.showOpenFilePicker) {
          const handle = await window.showOpenFilePicker({
            multiple: false,
            types: [{ description: "Images", accept: { "image/*": [".png", ".jpg", ".jpeg", ".webp"] } }],
          });
          return handle.length > 0 ? "granted" : "denied";
        }
        return new Promise((resolve) => {
          const input = document.createElement("input");
          input.type = "file";
          input.accept = "image/*";
          input.onchange = () => resolve(input.files.length > 0 ? "granted" : "denied");
          input.onerror = () => resolve("denied");
          input.click();
          setTimeout(() => resolve("skipped"), 5000);
        });
      } catch {
        return "denied";
      }
    },
  },
];

export default function PermissionFlow() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [results, setResults] = useState({});
  const [requesting, setRequesting] = useState(false);

  const current = PERMISSIONS[step];
  const isLast = step === PERMISSIONS.length - 1;
  const grantedCount = Object.values(results).filter((r) => r === "granted").length;

  const handleGrant = useCallback(async () => {
    setRequesting(true);
    const status = await current.request();
    setResults((prev) => ({ ...prev, [current.id]: status }));
    setRequesting(false);

    // Notification permission granted while already signed in? Register the
    // Web Push subscription right away (normally it happens after login).
    if (current.id === "notifications" && status === "granted") {
      try { authService.refreshPushSubscription(); } catch { /* pre-login: skipped */ }
    }

    setTimeout(() => {
      if (isLast) {
        navigate("/login");
      } else {
        setStep((s) => s + 1);
      }
    }, 800);
  }, [current, isLast, navigate]);

  const handleSkip = () => {
    setResults((prev) => ({ ...prev, [current.id]: "skipped" }));
    if (isLast) {
      navigate("/login");
    } else {
      setStep((s) => s + 1);
    }
  };

  const handleSkipAll = () => {
    navigate("/login");
  };

  const status = results[current?.id];

  return (
    <div className="perm-root">
      <div className="perm-backdrop" />

      {/* Particles */}
      <div className="perm-particles">
        {Array.from({ length: 10 }).map((_, i) => (
          <span
            key={i}
            className="perm-particle"
            style={{
              left: `${8 + (i * 11) % 84}%`,
              animationDuration: `${7 + (i % 4) * 2}s`,
              animationDelay: `${(i % 3) * 1.1}s`,
              width: `${3 + (i % 3) * 2}px`,
              height: `${3 + (i % 3) * 2}px`,
              opacity: 0.1 + (i % 4) * 0.03,
            }}
          />
        ))}
      </div>

      {/* Skip all */}
      <button className="perm-skip-all" onClick={handleSkipAll}>
        SKIP ALL ›
      </button>

      {/* Progress */}
      <div className="perm-progress">
        {PERMISSIONS.map((_, i) => (
          <div
            key={i}
            className={`perm-dot ${i < step ? "done" : ""} ${i === step ? "active" : ""}`}
          />
        ))}
      </div>

      {/* Card */}
      <div className="perm-card">
        {/* Icon */}
        <div
          className="perm-icon"
          style={{
            background: `linear-gradient(135deg, ${current.color}22, ${current.color}11)`,
            borderColor: `${current.color}33`,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 40, color: current.color }}>
            {current.icon}
          </span>
        </div>

        {/* Text */}
        <h2 className="perm-title">{current.title}</h2>
        <p className="perm-desc">{current.desc}</p>

        {/* Status badge */}
        {status && (
          <div className={`perm-status ${status}`}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              {status === "granted" ? "check_circle" : status === "denied" ? "cancel" : "skip_next"}
            </span>
            {status === "granted" ? "Access Granted" : status === "denied" ? "Access Denied" : "Skipped"}
          </div>
        )}

        {/* Buttons */}
        <div className="perm-actions">
          {!status && (
            <button
              className="perm-btn-primary"
              onClick={handleGrant}
              disabled={requesting}
              style={{ background: current.color, color: "#000" }}
            >
              {requesting ? (
                <span className="perm-spinner" />
              ) : (
                <>
                  <span className="material-symbols-outlined" style={{ fontSize: 20 }}>check</span>
                  Allow {current.title.split(" ")[0]}
                </>
              )}
            </button>
          )}

          {!status && (
            <button className="perm-btn-skip" onClick={handleSkip}>
              Skip for now
            </button>
          )}

          {status && (
            <button
              className="perm-btn-next"
              onClick={() => {
                if (isLast) navigate("/login");
                else setStep((s) => s + 1);
              }}
              style={{ background: current.color, color: "#000" }}
            >
              {isLast ? "Get Started" : "Next"}
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                {isLast ? "arrow_forward" : "arrow_forward"}
              </span>
            </button>
          )}
        </div>

        {/* Counter */}
        <p className="perm-counter">
          {step + 1} of {PERMISSIONS.length} · {grantedCount} granted
        </p>
      </div>
    </div>
  );
}
