# Meridian — Campaign Intelligence Platform

> Enterprise-grade paid media analytics platform with real-time campaign performance monitoring, automated anomaly detection, and pipeline health observability.

---

## Overview

Meridian is a full-stack analytics platform that simulates a production Google Ads monitoring system. A Python data pipeline continuously generates realistic ad campaign metrics — modelled on 2024 industry benchmarks — and streams them into a cloud PostgreSQL database. The React dashboard subscribes via WebSockets and updates live without any page refresh.

Built to demonstrate end-to-end data engineering proficiency: from ingestion and schema design to real-time visualisation and SRE observability patterns.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Python Data Pipeline                      │
│  generator.py                                               │
│  ├── 8 campaign types with industry-benchmark CTR/CPC/ROAS  │
│  ├── Time-of-day traffic patterns                           │
│  ├── Business-rule alert engine (5-min cooldown)            │
│  └── Pipeline health logging                                │
└────────────────────────┬────────────────────────────────────┘
                         │ INSERT (REST API)
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                  Supabase (PostgreSQL)                       │
│  ├── campaigns        — master campaign catalogue            │
│  ├── ad_metrics       — raw event stream (append-only)       │
│  ├── alerts           — business-rule violation log          │
│  └── pipeline_logs    — SRE health records                  │
│                                                             │
│  Realtime Engine → broadcasts INSERT events via WebSocket   │
└────────────────────────┬────────────────────────────────────┘
                         │ WebSocket (Supabase Realtime)
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                React Dashboard (Vite)                       │
│  ├── Overview    — KPI cards, live area chart, alert feed   │
│  ├── Campaigns   — per-campaign aggregated performance table │
│  └── System Health — pipeline status, SRE observability     │
└─────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

### Backend / Data Layer

| Component | Technology | Purpose |
|---|---|---|
| Database | Supabase (PostgreSQL 15) | Persistent storage, ACID compliance |
| Realtime | Supabase Realtime (WebSocket) | Push INSERT events to browser |
| Pipeline | Python 3.10+ | Metric simulation and ingestion |
| ORM / Client | `supabase-py` 2.10 | REST API writes from Python |

### Frontend

| Component | Technology | Purpose |
|---|---|---|
| Framework | React 18 | Component-based UI |
| Build Tool | Vite 5 | Sub-second HMR dev server |
| Charts | Recharts 2 | Area, bar, and line charts |
| Realtime Client | `@supabase/supabase-js` | WebSocket channel subscriptions |
| Styling | Vanilla CSS | Custom dark-theme design system |
| Date Formatting | `date-fns` | Timestamp display utilities |

---

## Database Schema

### `campaigns` — Master catalogue
```sql
id          UUID PRIMARY KEY
name        TEXT NOT NULL
budget      NUMERIC(12, 2)
status      TEXT  -- 'active' | 'paused' | 'ended'
platform    TEXT  -- 'Google Ads'
created_at  TIMESTAMPTZ
```

### `ad_metrics` — Raw event stream (append-only)
```sql
id           UUID PRIMARY KEY
campaign_id  UUID → campaigns.id
impressions  INTEGER
clicks       INTEGER
ctr          NUMERIC  -- GENERATED ALWAYS (clicks / impressions)
cpc          NUMERIC  -- cost per click
conversions  INTEGER
spend        NUMERIC
roas         NUMERIC  -- return on ad spend
recorded_at  TIMESTAMPTZ
```
> `ctr` is a **PostgreSQL computed column** — the database calculates it automatically from `clicks` and `impressions`. The pipeline never inserts it directly.

### `alerts` — Business rule violations
```sql
id           UUID PRIMARY KEY
campaign_id  UUID → campaigns.id
alert_type   TEXT  -- 'ctr_drop' | 'budget_exceeded' | 'anomaly' | 'spend_spike'
message      TEXT
severity     TEXT  -- 'low' | 'medium' | 'high'
resolved     BOOLEAN DEFAULT false
created_at   TIMESTAMPTZ
```

### `pipeline_logs` — SRE health records
```sql
id                UUID PRIMARY KEY
run_at            TIMESTAMPTZ
status            TEXT  -- 'success' | 'failure' | 'partial'
records_inserted  INTEGER
error_message     TEXT
duration_ms       INTEGER
```

---

## Campaign Types & Benchmark Data

Eight campaign types modelled on real Google Ads performance data (WordStream 2024, Google Ads Benchmark Report Q1 2024):

| Campaign | Impressions/event | CTR Range | CPC Range | Conv. Rate | Notes |
|---|---|---|---|---|---|
| Search \| Brand Terms | 800–4,000 | 8–18% | $0.30–$1.20 | 10–20% | Brand intent = highest CTR |
| Search \| Generic High-Intent | 2,000–9,000 | 3–7% | $2.50–$6.50 | 3–8% | Competitive keyword auctions |
| Search \| Competitor Conquest | 1,500–6,000 | 1–3% | $4.50–$10.00 | 1–3% | Cold audience, expensive |
| Shopping \| All Products | 5,000–25,000 | 0.8–2.5% | $0.40–$1.80 | 2–6% | High purchase intent |
| Display \| Prospecting | 40,000–200,000 | 0.05–0.2% | $0.10–$0.55 | 0.5–1.5% | Wide reach, awareness |
| Display \| Retargeting | 8,000–35,000 | 0.3–1% | $0.20–$0.85 | 2–6% | Warmer audience |
| Performance Max \| ROAS Target | 6,000–30,000 | 2–5% | $1.50–$4.00 | 4–10% | Google's AI-driven format |
| YouTube \| Brand Awareness | 20,000–120,000 | 0.03–0.15% | $0.03–$0.18 | 0.1–0.5% | CPV model, view-based |

---

## Data Pipeline Design

### Metric Generation
Each pipeline event picks a campaign at random and generates metrics using:

- **Campaign-specific CTR baseline** with Gaussian noise (`σ = 20% of mean`) to simulate natural variance
- **Time-of-day traffic multiplier** — peaks at morning (9–12), lunch (12–14), and evening (18–21) UTC, low overnight
- **Day-to-day variance** — ±15% impression volume to reflect real traffic patterns
- **ROAS calculation** — computed as `(conversions × avg_order_value) / spend`, not randomly assigned

### Anomaly Detection (Generator Side)
0.5% of events simulate click fraud:
- Impressions spike 8–25×
- Clicks spike 5–15× independently (abnormal impression-to-click ratio)
- Spend spikes 4–12×

### Alert Engine
Business rules evaluated on every insert, with a **5-minute cooldown** per `(campaign, alert_type)` pair to prevent alert storms:

| Rule | Threshold | Severity |
|---|---|---|
| ROAS below break-even | ROAS < 2.0x with conversions present | High |
| CTR significantly low | CTR < 60% of campaign baseline, impressions > 5,000 | Medium |
| Daily budget consumed | Spend > 90% of daily budget | High |
| Anomaly / click fraud | Triggered by the 0.5% spike injection | High |

---

## Realtime Architecture

### How it works (no polling)

1. Python inserts a row into `ad_metrics` via Supabase REST API
2. PostgreSQL's logical replication captures the `INSERT` event
3. Supabase Realtime broadcasts it over a persistent **WebSocket** to all connected clients
4. React's `useEffect` subscription callback fires with `payload.new`
5. React state updates → component re-renders only the affected parts

### Subscription channels
```js
// ad_metrics channel
supabase.channel('ad_metrics_inserts')
  .on('postgres_changes', { event: 'INSERT', table: 'ad_metrics' }, handler)
  .subscribe()

// alerts channel
supabase.channel('alerts_inserts')
  .on('postgres_changes', { event: 'INSERT', table: 'alerts' }, handler)
  .subscribe()
```

---

## Project Structure

```
adinsight-live/
│
├── .env.example                    # Environment variable template
│
├── database/
│   ├── schema.sql                  # Full schema: tables, indexes, RLS policies, Realtime
│   └── seed_campaigns.sql          # 8 production campaign inserts (safe, idempotent)
│
├── pipeline/
│   ├── generator.py                # Main data pipeline — metric simulation & ingestion
│   ├── requirements.txt            # Python dependencies
│   └── .env                        # Pipeline credentials (not committed)
│
└── frontend/
    ├── index.html                  # Entry point — title, meta, Google Fonts
    ├── package.json                # Node dependencies
    ├── vite.config.js              # Vite config (port 3000)
    └── src/
        ├── main.jsx                # React entry point
        ├── index.css               # Global dark-theme design system (CSS variables)
        ├── App.jsx                 # All components + Supabase subscriptions
        └── lib/
            └── supabase.js         # Supabase client initialisation
```

---

## Getting Started

### Prerequisites
- Python 3.10+
- Node.js 18+
- A free [Supabase](https://supabase.com) account

---

### Step 1 — Supabase Setup

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** → paste `database/schema.sql` → **Run**
3. Go to **SQL Editor** → paste `database/seed_campaigns.sql` → **Run**

---

### Step 2 — Configure Credentials

```bash
# From project root — copy template to both locations
copy .env.example pipeline\.env
copy .env.example frontend\.env
```

Edit `pipeline/.env`:
```env
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_KEY=eyJ...   # service_role key — for writes
```

Edit `frontend/.env`:
```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...  # anon key — safe for browser
```

> Find your keys at: **Supabase Dashboard → Project → Settings → API**

---

### Step 3 — Start the Data Pipeline

```bash
cd pipeline
pip install -r requirements.txt
python generator.py
```

You'll see a structured terminal log:
```
[14:32:01]  Search | Brand Terms             2,341 imp    187 clicks   CTR  7.994%   $  221.46 spend   ROAS  4.21x
[14:32:04]  Display | Prospecting          102,871 imp    118 clicks   CTR  0.115%   $   44.18 spend   ROAS  2.87x
[14:32:07]  Performance Max | ROAS Target    8,204 imp    312 clicks   CTR  3.802%   $  689.34 spend   ROAS  6.14x
```

---

### Step 4 — Start the Dashboard

Open a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open **[http://localhost:3000](http://localhost:3000)**

---

## Running After Initial Setup

Every subsequent session only needs two commands:

| Terminal | Directory | Command |
|---|---|---|
| 1 | `pipeline/` | `python generator.py` |
| 2 | `frontend/` | `npm run dev` |

---

## SRE & Reliability Patterns

| Pattern | Implementation |
|---|---|
| Structured logging | `logging` module with timestamp, level, message format |
| Alert cooldown | `_alert_last_fired` dict prevents re-firing within 5 minutes |
| Graceful shutdown | `KeyboardInterrupt` handler writes final pipeline log before exit |
| Error boundary | All Supabase calls wrapped in `try/except` with error logging |
| Pipeline observability | Every insert logged to `pipeline_logs` with status and duration |
| Computed columns | `ctr` calculated by DB — eliminates risk of application-layer rounding errors |
| Idempotent seeds | `WHERE NOT EXISTS` pattern prevents duplicate campaign inserts |

---

## Environment Variables Reference

| Variable | Location | Description |
|---|---|---|
| `SUPABASE_URL` | `pipeline/.env` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | `pipeline/.env` | Service role key — write access |
| `VITE_SUPABASE_URL` | `frontend/.env` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | `frontend/.env` | Anon key — read-only, safe for browser |

---

## Dependencies

### Python (`pipeline/requirements.txt`)
```
supabase==2.10.0        # Supabase Python client
python-dotenv==1.0.1    # .env file loader
colorama==0.4.6         # Cross-platform terminal colour output
```

### JavaScript (`frontend/package.json`)
```
react ^18.3.1                  # UI framework
react-dom ^18.3.1              # DOM renderer
@supabase/supabase-js ^2.39.7  # Supabase client + Realtime
recharts ^2.12.2               # Chart components
date-fns ^3.6.0                # Date formatting
vite ^5.2.0                    # Build tool and dev server
```

---

## Interview Talking Points

**Q: Why Supabase over a traditional database + WebSocket server?**
> Supabase provides managed PostgreSQL with a built-in Realtime engine backed by PostgreSQL's logical replication. This removes the need to build and operate a WebSocket server. In production at scale, this pattern maps to Cloud Spanner or BigQuery with Pub/Sub handling the event stream.

**Q: How does the dashboard update without polling?**
> Supabase Realtime uses PostgreSQL's WAL (Write-Ahead Log) to detect row-level changes. These are streamed to connected clients over a persistent WebSocket. The React client registers a subscription channel — when an INSERT fires in the database, all subscribers receive the event payload immediately, with zero polling overhead.

**Q: How did you design the alert system to avoid noise?**
> Each alert rule has a 5-minute cooldown enforced by an in-memory dictionary keyed on `(campaign_name, alert_type)`. The thresholds are calibrated to real break-even points — for example, ROAS below 2.0x is the typical e-commerce break-even, not an arbitrary number. The 90% budget threshold fires once per cycle, not continuously.

**Q: How would you scale this for a real production workload?**
> Three changes: (1) Replace the Python generator with Apache Kafka or Google Pub/Sub for high-throughput ingestion. (2) Add table partitioning on `recorded_at` — partition `ad_metrics` by day to keep query performance stable as volume grows. (3) Move analytical aggregations to BigQuery or a materialized view layer, keeping PostgreSQL for operational queries only.

**Q: What does the `ctr` computed column give you that application-level calculation wouldn't?**
> Consistency and correctness. If CTR were calculated in the application, any bug or rounding difference across multiple services would produce inconsistent values in the database. A `GENERATED ALWAYS AS` stored column means the database owns the calculation — one source of truth, enforced at the storage layer.
