import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from './lib/supabase'
import {
  LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Legend
} from 'recharts'
import { format } from 'date-fns'

// ─── CONSTANTS ────────────────────────────────────────────────
const CAMPAIGN_COLORS = {
  'Search | Brand Terms':           '#6366f1',
  'Search | Generic High-Intent':   '#06b6d4',
  'Search | Competitor Conquest':   '#f43f5e',
  'Shopping | All Products':        '#10b981',
  'Display | Prospecting':          '#f59e0b',
  'Display | Retargeting':          '#a855f7',
  'Performance Max | ROAS Target':  '#3b82f6',
  'YouTube | Brand Awareness':      '#ef4444',
}
const MAX_CHART_POINTS = 40
const MAX_FEED_ITEMS   = 60

// Check if env vars are set
const MISSING_CONFIG = !import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY

// ─── SETUP SCREEN ─────────────────────────────────────────────
function SetupScreen() {
  return (
    <div className="setup-screen">
      <div className="setup-card">
        <div className="setup-icon">⚙️</div>
        <h1 className="setup-title">Connect to Supabase</h1>
        <p className="setup-sub">
          One-time setup needed. Create a <code className="step-code">.env</code> file
          in the <code className="step-code">frontend/</code> folder with your Supabase credentials.
        </p>
        <div className="setup-steps">
          <div className="setup-step">
            <div className="step-num">1</div>
            <div className="step-text">
              <strong>Go to supabase.com → New Project</strong>
              Create a free project (takes ~2 min)
            </div>
          </div>
          <div className="setup-step">
            <div className="step-num">2</div>
            <div className="step-text">
              <strong>Run the schema in SQL Editor</strong>
              Copy &amp; paste <code className="step-code">database/schema.sql</code> and run it
            </div>
          </div>
          <div className="setup-step">
            <div className="step-num">3</div>
            <div className="step-text">
              <strong>Create frontend/.env file</strong>
              <code className="step-code">VITE_SUPABASE_URL=https://xxx.supabase.co</code><br/>
              <code className="step-code">VITE_SUPABASE_ANON_KEY=eyJ...</code>
            </div>
          </div>
          <div className="setup-step">
            <div className="step-num">4</div>
            <div className="step-text">
              <strong>Start the data generator</strong>
              <code className="step-code">cd pipeline &amp;&amp; python generator.py</code>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── CUSTOM TOOLTIP ────────────────────────────────────────────
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: '#0d1526', border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 10, padding: '10px 14px', fontSize: 12
    }}>
      <p style={{ color: '#94a3b8', marginBottom: 6, fontFamily: 'monospace' }}>{label}</p>
      {payload.map(p => (
        <p key={p.dataKey} style={{ color: p.color, margin: '2px 0', fontFamily: 'monospace' }}>
          {p.name}: <strong>{typeof p.value === 'number' ? p.value.toLocaleString() : p.value}</strong>
        </p>
      ))}
    </div>
  )
}

// ─── KPI CARD ─────────────────────────────────────────────────
function KPICard({ icon, label, value, sub, change, accentColor, flash }) {
  return (
    <div className={`kpi-card${flash ? ' flash' : ''}`} style={{ '--accent': accentColor }}>
      <div className="kpi-icon">{icon}</div>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-sub">
        <span>{sub}</span>
        {change && (
          <span className={`kpi-change ${change.startsWith('+') ? 'up' : 'down'}`}>{change}</span>
        )}
      </div>
    </div>
  )
}

// ─── LIVE EVENT FEED ──────────────────────────────────────────
function LiveFeed({ events }) {
  return (
    <div className="event-feed">
      {events.length === 0 && (
        <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', fontSize: 13 }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>📡</div>
          Waiting for live data…<br/>
          <small style={{ fontSize: 11, marginTop: 6, display: 'block' }}>Start the Python generator</small>
        </div>
      )}
      {events.map((ev, i) => (
        <div key={ev.id || i} className="event-item">
          <div
            className="event-dot"
            style={{ background: CAMPAIGN_COLORS[ev._campaignName] || '#6366f1' }}
          />
          <div className="event-body">
            <div className="event-campaign">
              {ev._campaignName || 'Unknown Campaign'}
            </div>
            <div className="event-meta">
              <span className="event-stat">👁 <span>{ev.impressions?.toLocaleString()}</span></span>
              <span className="event-stat">🖱 <span>{ev.clicks}</span></span>
              <span className="event-stat">🎯 <span>{ev.conversions}</span></span>
              <span className="event-stat">💰 <span>${parseFloat(ev.spend || 0).toFixed(2)}</span></span>
              <span className="event-stat">📈 <span>ROAS {parseFloat(ev.roas || 0).toFixed(2)}x</span></span>
            </div>
          </div>
          <div className="event-time">
            {ev.recorded_at ? format(new Date(ev.recorded_at), 'HH:mm:ss') : '--'}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── ALERT FEED ───────────────────────────────────────────────
function AlertFeed({ alerts }) {
  const icons = { critical: '🔴', high: '🟠', medium: '🟡', low: '🟢' }
  return (
    <div className="alert-list">
      {alerts.length === 0 && (
        <div className="no-alerts">
          <span>✅</span>All systems nominal
        </div>
      )}
      {alerts.slice(0, 8).map((a, i) => (
        <div key={a.id || i} className={`alert-item ${a.severity}`}>
          <div className="alert-icon">{icons[a.severity] || '⚪'}</div>
          <div className="alert-body">
            <div className="alert-msg">{a.message}</div>
            <div className="alert-time">
              {a.alert_type?.toUpperCase().replace('_', ' ')} ·{' '}
              {a.created_at ? format(new Date(a.created_at), 'HH:mm:ss') : '--'}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── CAMPAIGN TABLE ───────────────────────────────────────────
function CampaignTable({ campaigns, flashedRows }) {
  return (
    <div className="campaign-table-wrap">
      <table>
        <thead>
          <tr>
            <th>Campaign</th>
            <th>Status</th>
            <th>Impressions</th>
            <th>Clicks</th>
            <th>CTR %</th>
            <th>Spend</th>
            <th>ROAS</th>
            <th>Q.Score</th>
            <th>Events</th>
          </tr>
        </thead>
        <tbody>
          {campaigns.map(c => (
            <tr key={c.id} className={flashedRows.has(c.id) ? 'row-flash' : ''}>
              <td>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                    background: CAMPAIGN_COLORS[c.name] || '#6366f1'
                  }} />
                  <span className="campaign-name-cell">{c.name?.replace(/_/g, ' ')}</span>
                </span>
              </td>
              <td>
                <span className={`status-badge ${c.status}`}>
                  {c.status === 'active' ? '●' : '◌'} {c.status}
                </span>
              </td>
              <td className="metric-mono">{parseInt(c.total_impressions || 0).toLocaleString()}</td>
              <td className="metric-mono">{parseInt(c.total_clicks || 0).toLocaleString()}</td>
              <td className={parseFloat(c.avg_ctr_pct) > 3 ? 'metric-green' : 'metric-mono'}>
                {parseFloat(c.avg_ctr_pct || 0).toFixed(2)}%
              </td>
              <td className="metric-mono">${parseFloat(c.total_spend || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
              <td className={parseFloat(c.avg_roas) >= 3 ? 'metric-green' : parseFloat(c.avg_roas) < 1.5 ? 'metric-red' : 'metric-mono'}>
                {parseFloat(c.avg_roas || 0).toFixed(2)}x
              </td>
              <td>
                <span style={{
                  color: c.avg_quality_score >= 7 ? 'var(--green-l)' :
                         c.avg_quality_score >= 4 ? 'var(--amber)' : 'var(--red-l)',
                  fontWeight: 700, fontFamily: 'monospace'
                }}>
                  {parseFloat(c.avg_quality_score || 0).toFixed(1)}/10
                </span>
              </td>
              <td className="metric-mono">{parseInt(c.total_events || 0).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── SRE HEALTH PANEL ─────────────────────────────────────────
function SREHealth({ pipelineRun, connectionStatus, totalEvents, lastUpdate }) {
  const isOnline    = connectionStatus === 'connected'
  const isStale     = lastUpdate && (Date.now() - new Date(lastUpdate).getTime()) > 30000

  const freshness   = lastUpdate
    ? `${Math.round((Date.now() - new Date(lastUpdate).getTime()) / 1000)}s ago`
    : 'No data yet'

  return (
    <div className="health-grid">
      <div className="health-item">
        <div className="health-icon">📡</div>
        <div>
          <div className="health-label">Realtime WS</div>
          <div className={`health-value ${isOnline ? 'health-ok' : 'health-bad'}`}>
            {isOnline ? 'CONNECTED' : 'OFFLINE'}
          </div>
        </div>
      </div>
      <div className="health-item">
        <div className="health-icon">🔄</div>
        <div>
          <div className="health-label">Data Freshness</div>
          <div className={`health-value ${isStale ? 'health-warn' : 'health-ok'}`}>
            {freshness}
          </div>
        </div>
      </div>
      <div className="health-item">
        <div className="health-icon">📊</div>
        <div>
          <div className="health-label">Total Events</div>
          <div className="health-value health-ok">{totalEvents.toLocaleString()}</div>
        </div>
      </div>
      <div className="health-item">
        <div className="health-icon">⚙️</div>
        <div>
          <div className="health-label">Pipeline Status</div>
          <div className={`health-value ${
            pipelineRun?.status === 'running'  ? 'health-ok' :
            pipelineRun?.status === 'success'  ? 'health-ok' :
            pipelineRun?.status === 'failed'   ? 'health-bad' : 'health-warn'
          }`}>
            {pipelineRun?.status?.toUpperCase() || 'IDLE'}
          </div>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// MAIN APP COMPONENT
// ═══════════════════════════════════════════════════════════════
export default function App() {
  const [activeTab,       setActiveTab]       = useState('dashboard')
  const [connectionStatus, setConnectionStatus] = useState('connecting')
  const [loading,          setLoading]          = useState(true)

  // Data state
  const [liveEvents,    setLiveEvents]    = useState([])
  const [alerts,        setAlerts]        = useState([])
  const [campaigns,     setCampaigns]     = useState([])
  const [chartData,     setChartData]     = useState([])
  const [pipelineRun,   setPipelineRun]   = useState(null)
  const [lastUpdate,    setLastUpdate]    = useState(null)
  const [totalEvents,   setTotalEvents]   = useState(0)
  const [flashedCards,  setFlashedCards]  = useState({})
  const [flashedRows,   setFlashedRows]   = useState(new Set())

  // Aggregated KPIs
  const [kpis, setKpis] = useState({
    totalSpend: 0, totalImpressions: 0, totalClicks: 0,
    totalConversions: 0, avgCtr: 0, avgRoas: 0,
  })

  // ── Initial Data Load ────────────────────────────────────────
  useEffect(() => {
    let cancelled = false

    async function loadInitialData() {
      try {
        // 1. Load campaigns
        const { data: campData } = await supabase
          .from('campaigns')
          .select('id, name, budget, status')
          .order('name')

        // 2. Load all ad_metrics and aggregate per campaign in JS
        const { data: metricsAll } = await supabase
          .from('ad_metrics')
          .select('campaign_id, impressions, clicks, ctr, conversions, spend, roas')
          .limit(2000)

        if (!cancelled && campData) {
          // Build a map: campaign_id -> aggregated stats
          const statsMap = {}
          ;(metricsAll || []).forEach(m => {
            if (!statsMap[m.campaign_id]) {
              statsMap[m.campaign_id] = { total_impressions: 0, total_clicks: 0, total_conversions: 0, total_spend: 0, total_events: 0, roas_sum: 0 }
            }
            statsMap[m.campaign_id].total_impressions  += m.impressions  || 0
            statsMap[m.campaign_id].total_clicks       += m.clicks       || 0
            statsMap[m.campaign_id].total_conversions  += m.conversions  || 0
            statsMap[m.campaign_id].total_spend        += parseFloat(m.spend || 0)
            statsMap[m.campaign_id].roas_sum           += parseFloat(m.roas  || 0)
            statsMap[m.campaign_id].total_events       += 1
          })
          const enriched = campData.map(c => {
            const s = statsMap[c.id] || {}
            const events = s.total_events || 1
            return {
              ...c,
              total_impressions: s.total_impressions || 0,
              total_clicks:      s.total_clicks      || 0,
              total_conversions: s.total_conversions || 0,
              total_spend:       s.total_spend       || 0,
              total_events:      s.total_events      || 0,
              avg_ctr_pct: s.total_impressions > 0
                ? (s.total_clicks / s.total_impressions * 100).toFixed(4)
                : 0,
              avg_roas: events > 0 ? (s.roas_sum / events).toFixed(4) : 0,
              avg_quality_score: 0,
            }
          })
          setCampaigns(enriched)
        }

        // 3. Load recent events from ad_metrics
        const { data: campMap } = await supabase.from('campaigns').select('id, name')
        const nameMap = Object.fromEntries((campMap || []).map(c => [c.id, c.name]))

        const { data: events } = await supabase
          .from('ad_metrics')
          .select('*')
          .order('recorded_at', { ascending: false })
          .limit(60)
        if (!cancelled && events) {
          const tagged = events.map(e => ({ ...e, _campaignName: nameMap[e.campaign_id] || e.campaign_id }))
          setLiveEvents(tagged)
          setTotalEvents(tagged.length)
          if (tagged[0]) setLastUpdate(tagged[0].recorded_at)
        }

        // 4. Load recent alerts
        const { data: alertData } = await supabase
          .from('alerts')
          .select('*')
          .eq('resolved', false)
          .order('created_at', { ascending: false })
          .limit(15)
        if (!cancelled && alertData) setAlerts(alertData)

        // 5. Build chart data
        const { data: chartRaw } = await supabase
          .from('ad_metrics')
          .select('recorded_at, impressions, clicks, spend')
          .order('recorded_at', { ascending: true })
          .limit(MAX_CHART_POINTS)
        if (!cancelled && chartRaw) {
          setChartData(chartRaw.map(r => ({
            time:        format(new Date(r.recorded_at), 'HH:mm:ss'),
            impressions: r.impressions,
            clicks:      r.clicks,
            spend:       parseFloat(r.spend),
          })))
        }

        // 6. Load latest pipeline log
        const { data: logs } = await supabase
          .from('pipeline_logs')
          .select('*')
          .order('run_at', { ascending: false })
          .limit(1)
        if (!cancelled && logs?.[0]) setPipelineRun(logs[0])

        setLoading(false)
      } catch (err) {
        console.error('Initial load error:', err)
        setLoading(false)
      }
    }

    loadInitialData()
    return () => { cancelled = true }
  }, [])

  // ── Recompute KPIs whenever campaigns change ─────────────────
  useEffect(() => {
    if (!campaigns.length) return
    const totSpend  = campaigns.reduce((s, c) => s + parseFloat(c.total_spend  || 0), 0)
    const totImpr   = campaigns.reduce((s, c) => s + parseInt(c.total_impressions || 0), 0)
    const totClicks = campaigns.reduce((s, c) => s + parseInt(c.total_clicks || 0), 0)
    const totConv   = campaigns.reduce((s, c) => s + parseInt(c.total_conversions || 0), 0)
    const avgCtr    = campaigns.reduce((s, c) => s + parseFloat(c.avg_ctr_pct || 0), 0) / campaigns.length
    const avgRoas   = campaigns.reduce((s, c) => s + parseFloat(c.avg_roas || 0), 0) / campaigns.length
    setKpis({ totalSpend: totSpend, totalImpressions: totImpr, totalClicks: totClicks,
              totalConversions: totConv, avgCtr, avgRoas })
  }, [campaigns])

  // ── Flash helpers ─────────────────────────────────────────────
  const flashCard = useCallback((key) => {
    setFlashedCards(prev => ({ ...prev, [key]: true }))
    setTimeout(() => setFlashedCards(prev => ({ ...prev, [key]: false })), 700)
  }, [])

  const flashRow = useCallback((id) => {
    setFlashedRows(prev => new Set([...prev, id]))
    setTimeout(() => setFlashedRows(prev => { const n = new Set(prev); n.delete(id); return n }), 1000)
  }, [])

  // ── Campaign name ref (avoids Realtime subscription loop) ─────
  const campaignMapRef = useRef({})
  useEffect(() => {
    campaignMapRef.current = Object.fromEntries(campaigns.map(c => [c.id, c.name]))
  }, [campaigns])

  // ── Supabase Realtime Subscriptions ─────────────────────────
  useEffect(() => {

    // ── ad_metrics subscription
    const metricsChannel = supabase
      .channel('ad_metrics_inserts')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'ad_metrics' },
        (payload) => {
          const newRow = payload.new
          setConnectionStatus('connected')

          // Tag with campaign name for display
          const tagged = { ...newRow, _campaignName: campaignMapRef.current[newRow.campaign_id] || newRow.campaign_id }

          // Update event feed
          setLiveEvents(prev => [tagged, ...prev].slice(0, MAX_FEED_ITEMS))
          setTotalEvents(prev => prev + 1)
          setLastUpdate(newRow.recorded_at)

          // Update chart
          setChartData(prev => [...prev, {
            time:        format(new Date(newRow.recorded_at), 'HH:mm:ss'),
            impressions: newRow.impressions,
            clicks:      newRow.clicks,
            spend:       parseFloat(newRow.spend || 0),
          }].slice(-MAX_CHART_POINTS))

          // Update campaign KPIs inline (optimistic update)
          setCampaigns(prev => prev.map(c => {
            if (c.id !== newRow.campaign_id) return c
            flashRow(c.id)
            const newClicks = parseInt(c.total_clicks || 0) + newRow.clicks
            const newImpr   = parseInt(c.total_impressions || 0) + newRow.impressions
            return {
              ...c,
              total_impressions: newImpr,
              total_clicks:      newClicks,
              total_conversions: parseInt(c.total_conversions || 0) + newRow.conversions,
              total_spend:       parseFloat(c.total_spend || 0) + parseFloat(newRow.spend || 0),
              total_events:      parseInt(c.total_events || 0) + 1,
              avg_ctr_pct:       newImpr > 0 ? (newClicks / newImpr * 100).toFixed(4) : 0,
            }
          }))

          // Flash KPI cards
          flashCard('spend');  flashCard('impressions')
          flashCard('clicks'); flashCard('conversions')

          // Refresh latest pipeline log
          supabase.from('pipeline_logs').select('*')
            .order('run_at', { ascending: false }).limit(1)
            .then(({ data }) => { if (data?.[0]) setPipelineRun(data[0]) })
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED')     setConnectionStatus('connected')
        if (status === 'CHANNEL_ERROR')  setConnectionStatus('disconnected')
        if (status === 'TIMED_OUT')      setConnectionStatus('disconnected')
      })

    // ── alerts subscription
    const alertChannel = supabase
      .channel('alerts_inserts')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'alerts' },
        (payload) => {
          setAlerts(prev => [payload.new, ...prev].slice(0, 15))
          flashCard('alerts')
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(metricsChannel)
      supabase.removeChannel(alertChannel)
    }
  }, [flashCard, flashRow])

  // ── Periodic campaign stats refresh (every 30s) ──────────────
  useEffect(() => {
    const interval = setInterval(async () => {
      const { data: campData } = await supabase.from('campaigns').select('id, name, budget, status').order('name')
      const { data: metricsAll } = await supabase.from('ad_metrics')
        .select('campaign_id, impressions, clicks, conversions, spend, roas').limit(2000)
      if (campData) {
        const statsMap = {}
        ;(metricsAll || []).forEach(m => {
          if (!statsMap[m.campaign_id]) statsMap[m.campaign_id] = { total_impressions:0, total_clicks:0, total_conversions:0, total_spend:0, total_events:0, roas_sum:0 }
          statsMap[m.campaign_id].total_impressions += m.impressions || 0
          statsMap[m.campaign_id].total_clicks      += m.clicks      || 0
          statsMap[m.campaign_id].total_conversions += m.conversions || 0
          statsMap[m.campaign_id].total_spend       += parseFloat(m.spend || 0)
          statsMap[m.campaign_id].roas_sum          += parseFloat(m.roas  || 0)
          statsMap[m.campaign_id].total_events      += 1
        })
        setCampaigns(campData.map(c => {
          const s = statsMap[c.id] || {}
          const ev = s.total_events || 1
          return { ...c,
            total_impressions: s.total_impressions || 0,
            total_clicks:      s.total_clicks      || 0,
            total_conversions: s.total_conversions || 0,
            total_spend:       s.total_spend       || 0,
            total_events:      s.total_events      || 0,
            avg_ctr_pct: s.total_impressions > 0 ? (s.total_clicks / s.total_impressions * 100).toFixed(4) : 0,
            avg_roas:    ev > 0 ? (s.roas_sum / ev).toFixed(4) : 0,
            avg_quality_score: 0,
          }
        }))
      }
    }, 30000)
    return () => clearInterval(interval)
  }, [])

  // ── Render ───────────────────────────────────────────────────
  if (MISSING_CONFIG) return <SetupScreen />
  if (loading) return (
    <div className="loading-screen">
      <div className="loader" />
      <div className="loading-text">Connecting to Supabase Realtime…</div>
    </div>
  )

  return (
    <div className="app">
      {/* Connection Banner */}
      <div className={`conn-banner ${connectionStatus}`}>
        {connectionStatus === 'connected'    && '⚡ Supabase Realtime connected — receiving live updates'}
        {connectionStatus === 'connecting'   && '🔄 Connecting to Supabase Realtime…'}
        {connectionStatus === 'disconnected' && '❌ Realtime disconnected — check your connection'}
      </div>

      {/* Navbar */}
      <nav className="navbar">
        <div className="navbar-brand">
          <div className="navbar-logo">◈</div>
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
            <span className="navbar-title">Meridian</span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 500 }}>Campaign Intelligence Platform</span>
          </div>
        </div>

        <div className="navbar-center">
          {['dashboard', 'campaigns', 'sre'].map(tab => (
            <button key={tab} id={`nav-${tab}`}
              className={`nav-tab ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab === 'dashboard' ? 'Overview' : tab === 'campaigns' ? 'Campaigns' : 'System Health'}
            </button>
          ))}
        </div>

        <div className="navbar-right">
          <div className={`live-badge ${connectionStatus !== 'connected' ? 'offline' : ''}`}>
            <div className="live-dot" />
            {connectionStatus === 'connected' ? 'LIVE' : 'OFFLINE'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
            {totalEvents.toLocaleString()} events
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="main-content">
        {/* KPI Cards Row */}
        <div className="kpi-grid">
          <KPICard icon="💰" label="Total Spend"
            value={`$${kpis.totalSpend.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
            sub="All campaigns" accentColor="var(--indigo)" flash={flashedCards['spend']} />
          <KPICard icon="👁" label="Impressions"
            value={kpis.totalImpressions.toLocaleString()}
            sub="Total served" accentColor="var(--cyan)" flash={flashedCards['impressions']} />
          <KPICard icon="🖱" label="Total Clicks"
            value={kpis.totalClicks.toLocaleString()}
            sub="Across all ads" accentColor="var(--green)" flash={flashedCards['clicks']} />
          <KPICard icon="🎯" label="Conversions"
            value={kpis.totalConversions.toLocaleString()}
            sub="Goal completions" accentColor="var(--purple)" flash={flashedCards['conversions']} />
          <KPICard icon="📊" label="Avg CTR"
            value={`${kpis.avgCtr.toFixed(2)}%`}
            sub="Click-through rate" accentColor="var(--amber)" />
          <KPICard icon="📈" label="Avg ROAS"
            value={`${kpis.avgRoas.toFixed(2)}x`}
            sub="Return on ad spend" accentColor="var(--pink)" />
        </div>

        {/* Dashboard Tab */}
        {activeTab === 'dashboard' && (
          <div className="dashboard-grid">
            {/* Left Column */}
            <div className="left-column">
              {/* Real-time Line Chart */}
              <div className="glass-card">
                <div className="card-header">
                  <div className="card-title"><span className="icon">📈</span> Live Impressions & Clicks</div>
                  <span className="card-badge">{chartData.length} points</span>
                </div>
                <div className="card-body">
                  <div className="chart-legend">
                    <div className="legend-item"><div className="legend-dot" style={{background:'#6366f1'}}/> Impressions</div>
                    <div className="legend-item"><div className="legend-dot" style={{background:'#10b981'}}/> Clicks</div>
                    <div className="legend-item"><div className="legend-dot" style={{background:'#f59e0b'}}/> Spend $</div>
                  </div>
                  <ResponsiveContainer width="100%" height={240}>
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="colorImp" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorClk" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                      <XAxis dataKey="time" tick={{ fill: '#475569', fontSize: 10, fontFamily: 'monospace' }}
                        interval="preserveStartEnd" tickLine={false} axisLine={false} />
                      <YAxis yAxisId="left" tick={{ fill: '#475569', fontSize: 10, fontFamily: 'monospace' }}
                        tickLine={false} axisLine={false} />
                      <YAxis yAxisId="right" orientation="right"
                        tick={{ fill: '#475569', fontSize: 10, fontFamily: 'monospace' }}
                        tickLine={false} axisLine={false} />
                      <Tooltip content={<CustomTooltip />} />
                      <Area yAxisId="left" type="monotone" dataKey="impressions" name="Impressions"
                        stroke="#6366f1" strokeWidth={2} fill="url(#colorImp)" dot={false} isAnimationActive={false} />
                      <Area yAxisId="left" type="monotone" dataKey="clicks" name="Clicks"
                        stroke="#10b981" strokeWidth={2} fill="url(#colorClk)" dot={false} isAnimationActive={false} />
                      <Area yAxisId="right" type="monotone" dataKey="spend" name="Spend $"
                        stroke="#f59e0b" strokeWidth={1.5} fill="none" dot={false} isAnimationActive={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Campaign bar chart */}
              <div className="glass-card">
                <div className="card-header">
                  <div className="card-title"><span className="icon">🎯</span> Campaign Spend Distribution</div>
                  <span className="card-badge">Live</span>
                </div>
                <div className="card-body">
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={campaigns.map(c => ({
                      name: c.name?.replace(/_/g, ' ').split(' ').slice(0,2).join(' '),
                      spend: parseFloat(c.total_spend || 0),
                      clicks: parseInt(c.total_clicks || 0),
                    }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                      <XAxis dataKey="name" tick={{ fill: '#475569', fontSize: 10 }}
                        tickLine={false} axisLine={false} />
                      <YAxis tick={{ fill: '#475569', fontSize: 10 }} tickLine={false} axisLine={false} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="spend" name="Spend $" fill="#6366f1" radius={[4,4,0,0]} maxBarSize={50} />
                      <Bar dataKey="clicks" name="Clicks" fill="#10b981" radius={[4,4,0,0]} maxBarSize={50} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Right Column */}
            <div className="right-column">
              {/* Live Event Feed */}
              <div className="glass-card" style={{flex:1}}>
                <div className="card-header">
                  <div className="card-title"><span className="icon">⚡</span> Live Event Stream</div>
                  <span className="card-badge">{liveEvents.length}</span>
                </div>
                <div style={{padding: '8px 0'}}>
                  <LiveFeed events={liveEvents} />
                </div>
              </div>

              {/* Alert Feed */}
              <div className="glass-card">
                <div className="card-header">
                  <div className="card-title"><span className="icon">🚨</span> Active Alerts</div>
                  <span className="card-badge" style={{
                    background: alerts.length > 0 ? 'rgba(239,68,68,0.15)' : 'rgba(99,102,241,0.15)',
                    color: alerts.length > 0 ? 'var(--red-l)' : 'var(--indigo-l)'
                  }}>{alerts.length}</span>
                </div>
                <div className="card-body">
                  <AlertFeed alerts={alerts} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Campaigns Tab */}
        {activeTab === 'campaigns' && (
          <div className="glass-card">
            <div className="card-header">
              <div className="card-title"><span className="icon">🎯</span> Campaign Performance Table</div>
              <span className="card-badge">Live updating</span>
            </div>
            <div style={{padding: '4px 0'}}>
              <CampaignTable campaigns={campaigns} flashedRows={flashedRows} />
            </div>
          </div>
        )}

        {/* SRE Monitor Tab */}
        {activeTab === 'sre' && (
          <div style={{display: 'flex', flexDirection: 'column', gap: 'var(--gap)'}}>
            <div className="glass-card">
              <div className="card-header">
                <div className="card-title"><span className="icon">🛡</span> System Health</div>
                <span className={`card-badge`} style={{
                  background: connectionStatus === 'connected' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                  color: connectionStatus === 'connected' ? 'var(--green-l)' : 'var(--red-l)'
                }}>
                  {connectionStatus.toUpperCase()}
                </span>
              </div>
              <div className="card-body">
                <SREHealth
                  pipelineRun={pipelineRun}
                  connectionStatus={connectionStatus}
                  totalEvents={totalEvents}
                  lastUpdate={lastUpdate}
                />
              </div>
            </div>

            {/* Pipeline Run History */}
            <div className="glass-card">
              <div className="card-header">
                <div className="card-title"><span className="icon">⚙️</span> Latest Pipeline Run</div>
              </div>
              <div className="card-body">
                {pipelineRun ? (
                  <div style={{display: 'flex', flexDirection: 'column', gap: 10}}>
                    {[
                      ['Run ID',  pipelineRun.id?.slice(0,16) + '…'],
                      ['Status',  pipelineRun.status?.toUpperCase()],
                      ['Run At',  pipelineRun.run_at ? format(new Date(pipelineRun.run_at), 'MMM dd, HH:mm:ss') : '—'],
                      ['Records Inserted', pipelineRun.records_inserted?.toLocaleString() || '—'],
                      ['Duration', pipelineRun.duration_ms ? `${pipelineRun.duration_ms}ms` : '—'],
                      ['Errors', pipelineRun.error_message || 'None'],
                    ].map(([label, value]) => (
                      <div key={label} style={{display:'flex', justifyContent:'space-between', alignItems:'center',
                        padding:'10px 14px', background:'rgba(255,255,255,0.03)', borderRadius:10,
                        border:'1px solid var(--border)'}}>
                        <span style={{fontSize:12, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.5px'}}>{label}</span>
                        <span style={{fontSize:13, fontFamily:'monospace', color:'var(--text-primary)', fontWeight:600}}>{value}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{textAlign:'center', color:'var(--text-muted)', padding:30, fontSize:13}}>
                    No pipeline runs yet. Start <code style={{color:'var(--cyan)'}}>python generator.py</code>
                  </div>
                )}
              </div>
            </div>

            {/* Alerts SRE view */}
            <div className="glass-card">
              <div className="card-header">
                <div className="card-title"><span className="icon">🚨</span> Alert Log</div>
                <span className="card-badge">{alerts.length} active</span>
              </div>
              <div className="card-body">
                <AlertFeed alerts={alerts} />
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
