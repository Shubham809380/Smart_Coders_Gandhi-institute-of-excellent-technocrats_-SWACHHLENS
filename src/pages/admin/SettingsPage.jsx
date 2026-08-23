import { useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout.jsx";
import { Chip, Icon } from "../../components/admin/ui.jsx";
import { useTheme } from "../../contexts/ThemeContext.jsx";
import { useLanguage } from "../../contexts/LanguageContext.jsx";
import { LANGUAGES } from "../../i18n/translations.js";
import { authService } from "../../services.js";

function SectionCard({ title, subtitle, children }) {
  return (
    <section className="adm-card p-4">
      <div className="mb-3">
        <h3 className="text-sm font-extrabold adm-text">{title}</h3>
        {subtitle && <p className="text-xs adm-muted mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

export default function SettingsPage() {
  const { mode, setThemeMode } = useTheme();
  const { lang, setLang, t } = useLanguage();
  const [me] = useState(() => authService.getSessionSnapshot().currentUser);

  const themeOptions = [
    { value: "light", icon: "sun", label: "Light", hint: "Bright console for daylight use" },
    { value: "dark", icon: "moon", label: "Dark", hint: "Low-glare console for control rooms" },
  ];

  return (
    <AdminLayout>
      <div className="max-w-3xl mx-auto space-y-4">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight adm-text">{t("adminSettings")}</h2>
          <p className="text-sm adm-muted mt-0.5">Console preferences for this administrator.</p>
        </div>

        <SectionCard title="Appearance" subtitle="Applies to the whole Admin Panel instantly and is remembered after refresh.">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {themeOptions.map((o) => {
              const active = mode === o.value;
              return (
                <button
                  key={o.value}
                  onClick={() => setThemeMode(o.value)}
                  aria-pressed={active}
                  className={`flex items-start gap-3 rounded-xl border p-3.5 text-left transition-colors ${active ? "" : "hover:bg-[var(--adm-surface-2)]"}`}
                  style={{
                    borderColor: active ? "var(--adm-primary)" : "var(--adm-border)",
                    background: active ? "rgba(0,168,150,0.08)" : "transparent",
                  }}
                >
                  <span
                    className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                    style={{
                      background: active ? "var(--adm-primary)" : "var(--adm-surface-2)",
                      color: active ? "#ffffff" : "var(--adm-muted)",
                    }}
                  >
                    <Icon name={o.icon} size={17} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-extrabold adm-text">{o.label}</span>
                    <span className="block text-[11px] adm-muted mt-0.5">{o.hint}</span>
                  </span>
                  {active && (
                    <span className="ml-auto self-center">
                      <Chip tone="info" icon={<Icon name="check" size={10} />}>Active</Chip>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </SectionCard>

        <SectionCard title="Language" subtitle="Display language for your account across SwachhLens.">
          <div className="flex flex-wrap gap-2">
            {LANGUAGES.map((l) => {
              const active = lang === l.code;
              return (
                <button
                  key={l.code}
                  onClick={() => setLang(l.code)}
                  aria-pressed={active}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold border transition-colors ${active ? "" : "hover:bg-[var(--adm-surface-2)]"}`}
                  style={{
                    borderColor: active ? "var(--adm-primary)" : "var(--adm-border)",
                    color: active ? "var(--adm-primary)" : "var(--adm-text)",
                    background: active ? "rgba(0,168,150,0.08)" : "transparent",
                  }}
                >
                  {active && <Icon name="check" size={12} />}
                  {l.native}
                </button>
              );
            })}
          </div>
        </SectionCard>

        <SectionCard title="Account">
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center w-10 h-10 rounded-full text-white text-sm font-bold shrink-0" style={{ background: "var(--adm-primary-strong)" }}>
              {(me?.name || "M").charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold adm-text truncate">{me?.name || "Municipal Admin"}</p>
              <p className="text-xs adm-muted truncate">{me?.email || ""}</p>
            </div>
            {me?.role && <span className="ml-auto"><Chip tone="info">{String(me.role).replace(/_/g, " ")}</Chip></span>}
          </div>
        </SectionCard>
      </div>
    </AdminLayout>
  );
}
