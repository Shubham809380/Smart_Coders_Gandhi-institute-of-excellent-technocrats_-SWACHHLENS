<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:0f172a,35:065f46,100:22c55e&height=240&section=header&text=SwachhLens&fontSize=76&fontColor=ffffff&animation=fadeIn&fontAlignY=36&desc=AI-Assisted%20Waste%20Reporting%20%26%20Cleanup%20Coordination%20Platform&descAlignY=60&descSize=17" />

<img src="https://readme-typing-svg.demolab.com?font=Fira+Code&weight=600&size=21&duration=2600&pause=900&color=34D399&center=true&vCenter=true&multiline=true&repeat=true&width=880&height=90&lines=%F0%9F%93%B7+Capture+%E2%86%92+%F0%9F%A4%96+Gemini+Gatekeeper+%E2%86%92+%F0%9F%A7%A0+ONNX%2FYOLO11m+%E2%86%92+%F0%9F%93%8A+Priority+Engine;%F0%9F%9B%A1%EF%B8%8F+Admin+Dispatch+%E2%86%92+%F0%9F%A6%BA+Worker+Cleanup+%E2%86%92+%E2%9C%85+AI-Verified+Resolution;Live+on+Vercel+%2B+Neon+Postgres+%2B+Render+Socket.IO" />

<p>
  <img src="https://img.shields.io/badge/status-active--development-brightgreen?style=for-the-badge" />
  <img src="https://img.shields.io/badge/node-%3E%3D18-339933?style=for-the-badge&logo=node.js&logoColor=white" />
  <img src="https://img.shields.io/badge/license-MIT-blue?style=for-the-badge" />
  <img src="https://img.shields.io/badge/PWA-ready-5A0FC8?style=for-the-badge&logo=pwa&logoColor=white" />
  <img src="https://img.shields.io/badge/i18n-EN%20%C2%B7%20HI%20%C2%B7%20OR-orange?style=for-the-badge" />
</p>

<img src="https://skillicons.dev/icons?i=react,vite,materialui,tailwind,nodejs,express,python,fastapi,postgres,socketio,vercel,render,docker,pytorch,opencv&theme=dark" />

<br/><br/>

`⭐ Star this repo — every star helps a real street get cleaned faster`

</div>

<br/>

> **SwachhLens** turns any phone into a waste-detection sensor. A citizen photographs garbage → a Gemini gatekeeper + ONNX/YOLO11m pipeline detects, measures and scores it in seconds → a deterministic priority engine ranks it → admins dispatch a team → a worker cleans it → an AI re-checks the after-photo → the citizen watches it all resolve, live, on a map.

---

## 📚 Table of Contents

| | | |
|---|---|---|
| 🏗️ [Architecture](#️-high-level-architecture) | 🧠 [AI Pipeline](#-ai-pipeline--the-waste-measurement-flow) | ⚖️ [Priority Engine](#️-priority-engine) |
| 🗄️ [Database Schema](#️-database-schema-neon-postgresql) | 🔌 [API Surface](#-api-surface-backendrouterjs) | 🗺️ [Report Lifecycle](#️-report-lifecycle-13-states) |
| 👥 [Roles & Screens](#-roles--screens) | 🌐 [Realtime Layer](#-realtime-layer) | ☁️ [Deployment](#️-deployment-topology-live) |
| 🔑 [Environment Variables](#-environment-variables) | 🚀 [Quickstart](#-quickstart) | 📄 [License](#-license) |

---

## 🏗️ High-Level Architecture

```mermaid
%%{init: {'theme':'dark', 'themeVariables': {'primaryColor':'#0f172a','primaryTextColor':'#e2e8f0','primaryBorderColor':'#22c55e','lineColor':'#22c55e','fontSize':'13px'}}}%%
flowchart TB
    subgraph CLIENT["📱 FRONTEND — React 19 SPA + PWA"]
        direction TB
        REACT["Vite 8 · MUI v9 · Tailwind<br/>React Router 7 · Leaflet/MapLibre<br/>i18n EN / हिंदी / ଓଡ଼ିଆ · Dark/Light Theme"]
        SVC["src/services.js — single API layer<br/>auth · report · ai · team · admin · worker"]
        REACT --> SVC
    end

    subgraph API["🟢 API BACKEND — Node ≥18, zero-framework router"]
        direction TB
        ENTRY["server.js (self-hosted) · api/index.js (Vercel fn)"]
        ROUTER["backend/router.js  (~1575 lines)<br/>bcrypt + session auth · RBAC (6 roles)"]
        UTILS["utils.js — priority scoring + duplicate detection"]
        SSE["events.js — SSE fallback"]
        NOTIF["mailer.js (Brevo/Resend) · push.js (VAPID)"]
        AIP["ai/ provider layer<br/>onnxProvider.js · provider.js (mock)"]
        ENTRY --> ROUTER --> UTILS
        ROUTER --> SSE
        ROUTER --> NOTIF
        ROUTER --> AIP
    end

    subgraph SOCK["🔌 SOCKET SERVER — Express + Socket.IO (Render)"]
        direction TB
        SIO["Live new-report alerts · worker duty/location<br/>/internal/emit bridge (INTERNAL_API_SECRET)"]
    end

    subgraph PG["🐘 Neon PostgreSQL"]
        direction TB
        TBL["users · sessions · reports · teams · vehicles<br/>notifications · activity_logs · inference_logs<br/>push_subscriptions · media_blobs"]
    end

    subgraph AISVC["🧠 AI MICROSERVICE — Python FastAPI :8000 (optional, full stack)"]
        direction TB
        PIPE["YOLO11m detect → SAM + Depth-Anything-V2 volume<br/>→ CLIP dedupe → XGBoost severity → dispatch rules"]
    end

    SVC -->|"REST JSON /api/*"| ROUTER
    SVC <-->|"Socket.IO"| SIO
    ROUTER --> PG
    SIO --> PG
    ROUTER -.->|"internal emit"| SIO
    AIP -->|"AI_PROVIDER=onnx (prod, in-process)"| ROUTER
    AIP -.->|"AI_PROVIDER=python (local/full)"| AISVC

    style CLIENT fill:#0f172a,stroke:#38bdf8,color:#e2e8f0
    style API fill:#0f172a,stroke:#22c55e,color:#e2e8f0
    style SOCK fill:#0f172a,stroke:#f472b6,color:#e2e8f0
    style PG fill:#0f172a,stroke:#a78bfa,color:#e2e8f0
    style AISVC fill:#0f172a,stroke:#facc15,color:#e2e8f0
```

---

## 🧠 AI Pipeline — The Waste Measurement Flow

**Production path** (serverless, `backend/ai/onnxProvider.js`, `AI_PROVIDER=onnx`):

```mermaid
%%{init: {'theme':'dark', 'themeVariables': {'primaryColor':'#0f172a','primaryTextColor':'#e2e8f0','primaryBorderColor':'#22c55e','lineColor':'#22c55e'}}}%%
flowchart LR
    IMG["📷 Image"] --> GATE{"Gemini Gatekeeper<br/>(fail-open)"}
    GATE -->|not waste| REJ["🚫 HTTP 400<br/>honest rejection"]
    GATE -->|waste confirmed| CLS["classifyBuffer()<br/>ONNX CNN → wasteType + confidence"]
    CLS --> DET["heuristicDetect()<br/>OpenCV saliency → bbox"]
    DET --> VOL["heuristicVolume()<br/>contour analysis → volumeScore<br/>→ coveragePercent ⭐"]
    VOL --> SEV["ruleBasedSeverity()<br/>port of severity.py → low/med/high/critical"]
    SEV --> DIS["recommendAction()<br/>team · vehicle · SLA hours · PPE"]
    DIS --> DUP["phash duplicate check<br/>vs nearby reports"]
    DUP --> OUT["✅ result: wasteType, confidence,<br/>estimatedVolume, severity,<br/>detectionSummary.coveragePercent, dispatch"]

    style IMG fill:#0f172a,stroke:#38bdf8,color:#e2e8f0
    style OUT fill:#0f172a,stroke:#22c55e,color:#e2e8f0
    style REJ fill:#0f172a,stroke:#ef4444,color:#e2e8f0
```

> 🖥️ `coveragePercent` flows straight into `AnalyzingWaste.jsx` → `draft.aiResult` → **`AIResults.jsx`** gauge, where `resolveWastePercent()` drives the needle / arc / status card.
> 🔁 On any failure the request **auto-falls back** to `MockAIProvider` — the UI never hard-crashes.

<div align="center">

### 🛰️ Full Model Stack (standalone Python microservice, `AI_PROVIDER=python`)

| Stage | Model | Fallback |
|:---:|:---:|:---:|
| 1️⃣ Detection | **YOLO11m** | OpenCV heuristic |
| 2️⃣ Classification | Trained CNN | — |
| 3️⃣ Volume | **SAM (vit_b)** + **Depth Anything V2** | Contour estimation |
| 4️⃣ Dedupe | **CLIP** embeddings (cosine, 0.85 threshold, 50m/24h) | Perceptual hash |
| 5️⃣ Severity | **XGBoost** | Rule-based |
| 6️⃣ Dispatch | Rule engine | — |

`export_onnx.py` + `verify_onnx_parity.py` keep the serverless ONNX path numerically consistent with the full Python stack. Training data lives in `garbage_classification/` and `realwaste-main/`.

</div>

**13 Waste Categories:** `overflowing_bin` · `garbage_dump` · `plastic_waste` · `construction_debris` · `organic_waste` · `e_waste` · `hazardous_waste` · `drain_blockage` · `paper_waste` · `cardboard_waste` · `metal_waste` · `glass_waste` · `textile_waste`

---

## ⚖️ Priority Engine

Deterministic scoring in `backend/utils.js`, weighted from `constants.js → PRIORITY_WEIGHTS`:

<div align="center">

| Factor | Weight |
|---|:---:|
| Volume — small / medium / large / very_large | 8 / 18 / 28 / 36 |
| Severity — low / medium / high / critical | 8 / 18 / 30 / 40 |
| ☣️ Hazardous waste flag | +18 |
| 🚰 Drain blockage | +20 |
| 🏥 Hospital nearby | +14 |
| 🏫 School nearby | +10 |
| 🚧 Road obstruction | +12 |
| 🔁 Duplicate report support | +8 |
| ⏰ Report age > 24 hours | +6 |

</div>

Output → a **priority level** + human-readable **reasons array**, surfaced directly in the Admin Priority Queue.

---

## 🗄️ Database Schema (Neon PostgreSQL)

```mermaid
%%{init: {'theme':'dark', 'themeVariables': {'primaryColor':'#0f172a','primaryTextColor':'#e2e8f0','primaryBorderColor':'#a78bfa','lineColor':'#64748b'}}}%%
erDiagram
    USERS ||--o{ SESSIONS : has
    USERS ||--o{ REPORTS : files
    USERS ||--o{ PUSH_SUBSCRIPTIONS : registers
    TEAMS ||--o{ REPORTS : assigned_to
    REPORTS ||--o{ INFERENCE_LOGS : generates
    REPORTS ||--o{ NOTIFICATIONS : triggers
    VEHICLES ||--o{ TEAMS : used_by

    USERS {
        text role "citizen/admin/worker/..."
        text duty_status
        double current_lat
        double current_lng
        boolean terms_accepted
    }
    REPORTS {
        text status "13-state lifecycle"
        text ai_waste_type
        float ai_confidence
        jsonb ai_detection_summary
        jsonb ai_after_analysis
        int priority_score
        text priority_level
        boolean escalated
        boolean duplicate_group_dismissed
        text recycling_status
        int feedback_rating
    }
    SESSIONS {
        timestamptz expires_at
        timestamptz last_activity_at
    }
    INFERENCE_LOGS { }
    PUSH_SUBSCRIPTIONS { }
    MEDIA_BLOBS { }
```

<sub>Tables auto-migrate on boot (`db.js`): `users` · `sessions` · `password_reset_tokens` · `reports` · `teams` · `vehicles` · `notifications` · `activity_logs` · `inference_logs` · `push_subscriptions` · `media_blobs`</sub>

---

## 🔌 API Surface (`backend/router.js`)

<table>
<tr><th>Group</th><th>Endpoints</th></tr>
<tr><td><b>🔑 Auth</b></td><td><code>signup · login · logout · me · google · forgot-password · reset-password · change-password · profile</code></td></tr>
<tr><td><b>📋 Reports</b></td><td><code>reports · reports/all</code> — create, list, status transitions, feedback</td></tr>
<tr><td><b>🧠 AI</b></td><td><code>ai/analyze · ai/bin-type · ai/verify-cleanup</code></td></tr>
<tr><td><b>🦺 Worker</b></td><td><code>worker/tasks · duty · location · stats · history · report-issue · report-notes · proximity-alerts(+dismiss-all)</code></td></tr>
<tr><td><b>🛡️ Admin</b></td><td><code>admin/dashboard · analytics · alerts · users · workers(+nearby) · teams · bulk-assign · verification-queue · complaints · duplicates(+dismiss/merge) · hotspots · activity-logs</code></td></tr>
<tr><td><b>🔔 Misc</b></td><td><code>notifications(+read-all) · push/subscribe · push/unsubscribe · heartbeat · health · hotspots · waste-hotspots · teams · vehicles</code></td></tr>
</table>

---

## 🗺️ Report Lifecycle (13 states)

```mermaid
%%{init: {'theme':'dark', 'themeVariables': {'primaryColor':'#0f172a','primaryTextColor':'#e2e8f0','primaryBorderColor':'#22c55e','lineColor':'#64748b'}}}%%
stateDiagram-v2
    [*] --> draft
    draft --> submitted
    submitted --> ai_analyzing
    ai_analyzing --> ai_analyzed
    ai_analyzed --> under_review
    under_review --> assigned
    assigned --> en_route
    en_route --> cleanup_in_progress
    cleanup_in_progress --> verification
    verification --> resolved
    resolved --> reopened
    reopened --> under_review

    under_review --> rejected
    under_review --> duplicate
    rejected --> [*]
    duplicate --> [*]
    resolved --> [*]
```

Every transition is timestamped into a `status_timeline` **JSONB** column for full audit history.

---

## 👥 Roles & Screens

<table>
<tr><th>👤 Citizen</th><th>🦺 Cleanup Worker</th><th>🛡️ Admin / Ward Officer / Supervisor</th></tr>
<tr>
<td valign="top">

`Home`
`→ Explore Map`
`→ Capture Waste`
`→ Analyzing (AI)`
`→ AI Results (gauge)`
`→ Success`
`→ Tracking Cleanup`
`→ My Reports / Profile`

</td>
<td valign="top">

`Worker Tasks`
`→ Task Detail`
`→ Task In Progress`
`→ Complete Cleanup`
`  (after-photo AI verify)`
`→ Worker Map`
`→ History / Notifications`

</td>
<td valign="top">

`Dashboard` · `Live Map`
`Priority Queue` · `AI Priority Queue`
`Smart Dispatch` · `Teams & Fleet`
`Verification Queue`
`Duplicate Review`
`Complaint Queue/Detail`
`Analytics` · `Alerts Center`
`Recycling Routing`
`Worker/User Management`

</td>
</tr>
</table>

Roles (`constants.js`): `citizen` · `cleanup_worker` · `admin` · `super_admin` · `ward_officer` · `sanitation_supervisor` — admin-tier roles all resolve to the same dashboard app state.

---

## 🌐 Realtime Layer

```mermaid
%%{init: {'theme':'dark', 'themeVariables': {'primaryColor':'#0f172a','primaryTextColor':'#e2e8f0','primaryBorderColor':'#f472b6','lineColor':'#64748b'}}}%%
flowchart LR
    A["Node API"] -->|"INTERNAL_API_SECRET"| B["/internal/emit"]
    B --> C["🔌 Socket.IO (Render)"]
    C -->|"live"| D["Browser: instant alerts"]
    A -.->|"VITE_SOCKET_URL unset"| E["📡 SSE /api/events"]
    E -.->|"fallback"| D

    style C fill:#0f172a,stroke:#f472b6,color:#e2e8f0
    style E fill:#0f172a,stroke:#facc15,color:#e2e8f0
```

- **Socket.IO** (`socket-server/`, Render-hosted): new-report alerts to on-duty workers, worker duty/location broadcasts, origin allow-list CORS
- **SSE** (`backend/events.js`): zero-config fallback for monolith/local mode — `hooks/useLive.js` auto-switches, `App.jsx` shows a reconnecting screen on outage
- **Web Push** (VAPID) for background notifications · **Email** (Brevo, or Resend as fallback) for auth mail

---

## ☁️ Deployment Topology (Live)

<div align="center">

| Component | Host | Notes |
|---|---|---|
| **Frontend + API** | ▲ Vercel — `swachhlens-ruddy.vercel.app` | `api/index.js` serverless fn bundles ONNX classifier + OpenCV heuristics; rewrites `/api/*`, `/uploads/*` |
| **Database** | 🐘 Neon PostgreSQL | Auto-init + seed on cold start (`db.js`, `seed-neon.js`) |
| **Socket Server** | 🎨 Render | `render.yaml` + `Dockerfile.render`, long-lived process |
| **AI Microservice** | 🎨 Render / Docker *(optional)* | Full YOLO/SAM/CLIP stack when `AI_PROVIDER=python` |
| **Local Dev** | `node dev.js` orchestrator | `npm run dev` / `dev:all` / `start:all` → AI + API + Vite together |

</div>

```mermaid
%%{init: {'theme':'dark', 'themeVariables': {'primaryColor':'#0f172a','primaryTextColor':'#e2e8f0','primaryBorderColor':'#22c55e','lineColor':'#64748b'}}}%%
flowchart TB
    subgraph VC["▲ Vercel"]
        FN["api/index.js<br/>ONNX + heuristic"]
    end
    subgraph NEON["🐘 Neon"]
        DBX[("PostgreSQL")]
    end
    subgraph RND["🎨 Render"]
        SIOX["Socket Server"]
        AIX["AI Microservice (optional)"]
    end
    VC --> NEON
    VC -.->|"internal/emit"| SIOX
    SIOX --> NEON
```

---

## 🔑 Environment Variables

<details>
<summary><b>⚙️ Backend (<code>.env</code>)</b></summary>

```bash
# Database
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require

# Auth
AUTH_PROVIDER=neon
JWT_SECRET=your-random-secret-here

# AI Provider — mock | onnx | python
AI_PROVIDER=onnx

# Google OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Email — Brevo wins if both set
BREVO_API_KEY=
RESEND_API_KEY=re_your-resend-api-key
EMAIL_FROM=SwachhLens <onboarding@resend.dev>

# YOLO (python mode only)
YOLO_ENDPOINT_URL=
YOLO_API_KEY=

# Realtime bridge → Render Socket.IO
SOCKET_INTERNAL_URL=
INTERNAL_API_SECRET=
FRONTEND_URL=http://localhost:5173

PORT=3000
```

</details>

<details>
<summary><b>⚙️ Frontend (<code>.env</code>, <code>VITE_</code> prefix required)</b></summary>

```bash
VITE_API_URL=                          # empty = same-origin (Vercel rewrite)
VITE_SOCKET_URL=http://localhost:3001  # required in prod for realtime
VITE_GOOGLE_CLIENT_ID=
VITE_CLOUDINARY_CLOUD_NAME=
VITE_CLOUDINARY_API_KEY=
```

</details>

---

## 🚀 Quickstart

```bash
git clone https://github.com/your-org/swachhlens.git
cd swachhlens
npm install
cp .env.example .env

# 🚀 run everything — AI + API + Vite
npm run dev:all
```

<div align="center">

| Service | URL |
|---|---|
| 🌐 Frontend (Vite) | `localhost:5173` |
| 🟢 Node API | `localhost:3000` |
| 🐍 AI Microservice | `localhost:8000` |
| 🔌 Socket Server | `localhost:3001` |

</div>

```bash
npm run start:socket   # run the realtime service standalone
npm run build           # production build → verified Vercel deploy
```

---

## 📄 License

Distributed under the **MIT License**.

<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:22c55e,35:065f46,100:0f172a&height=150&section=footer" />

<sub>🌱 One photo, one report, one verified cleanup at a time.</sub>

<img src="https://komarev.com/ghpvc/?username=swachhlens&label=Project%20Views&color=22C55E&style=flat-square" />

</div>
