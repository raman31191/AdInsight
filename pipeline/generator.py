"""
AdInsight Live — Production Data Generator
============================================
Simulates a realistic Google Ads multi-campaign pipeline.
Based on industry benchmark CTR, CPC, and ROAS data (2024).

Campaign types mirror real Google Ads structures:
  Search (Brand, Generic, Competitor), Shopping,
  Display (Prospecting, Retargeting), Performance Max, YouTube.

Run: python generator.py
"""

import os
import time
import random
import logging
from datetime import datetime, timezone
from dotenv import load_dotenv
from supabase import create_client, Client
from colorama import Fore, Style, init

init(autoreset=True)
load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S"
)
log = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────
# SUPABASE CONNECTION
# ─────────────────────────────────────────────────────────────────
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    log.error("Missing SUPABASE_URL or SUPABASE_KEY in .env file")
    exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# ─────────────────────────────────────────────────────────────────
# CAMPAIGN PROFILES — Modelled on Google Ads industry benchmarks
#
# Sources: WordStream 2024, Google Ads Benchmarks Report Q1 2024
#
# Key design choices per campaign type:
#   Search/Brand   → Very high CTR (brand intent), low CPC, high conv
#   Search/Generic → Moderate CTR, higher CPC (competitive auctions)
#   Search/Comp    → Low CTR (cold audience), highest CPC
#   Shopping       → Moderate CTR, low CPC, high purchase intent
#   Display/Prosp  → Very low CTR (impression-based), low CPC, wide reach
#   Display/Retarg → Better CTR than prospecting, still low CPC
#   Perf Max       → Automated, mixed signals, highest budget
#   YouTube        → View-based, very low CTR, brand-oriented
# ─────────────────────────────────────────────────────────────────
CAMPAIGN_PROFILES = {

    "Search | Brand Terms": {
        # Brand searches: user already wants you → very high CTR, cheap clicks
        "impression_range":  (800,   4000),
        "ctr_range":         (0.08,  0.18),   # 8–18%
        "cpc_range":         (0.30,  1.20),   # cheap — you own brand auctions
        "conv_rate_range":   (0.10,  0.20),   # 10–20% — warm audience
        "avg_order_range":   (80,    250),
        "daily_budget":      900,
    },

    "Search | Generic High-Intent": {
        # e.g. "buy running shoes" — competitive but strong intent
        "impression_range":  (2000,  9000),
        "ctr_range":         (0.03,  0.07),   # 3–7%
        "cpc_range":         (2.50,  6.50),   # competitive auction
        "conv_rate_range":   (0.03,  0.08),
        "avg_order_range":   (100,   300),
        "daily_budget":      2800,
    },

    "Search | Competitor Conquest": {
        # Bidding on competitor brand names — expensive, low CTR
        "impression_range":  (1500,  6000),
        "ctr_range":         (0.01,  0.03),   # 1–3% — cold, unfamiliar brand
        "cpc_range":         (4.50,  10.00),  # competitors bid these up
        "conv_rate_range":   (0.01,  0.03),
        "avg_order_range":   (80,    200),
        "daily_budget":      1400,
    },

    "Shopping | All Products": {
        # Product listing ads — visually rich, moderate CTR, high purchase intent
        "impression_range":  (5000,  25000),
        "ctr_range":         (0.008, 0.025),  # 0.8–2.5%
        "cpc_range":         (0.40,  1.80),
        "conv_rate_range":   (0.02,  0.06),
        "avg_order_range":   (60,    180),
        "daily_budget":      3200,
    },

    "Display | Prospecting": {
        # Top-of-funnel awareness — massive reach, very low CTR
        "impression_range":  (40000, 200000),
        "ctr_range":         (0.0005, 0.002), # 0.05–0.2% — industry norm for display
        "cpc_range":         (0.10,  0.55),
        "conv_rate_range":   (0.005, 0.015),
        "avg_order_range":   (50,    150),
        "daily_budget":      1600,
    },

    "Display | Retargeting": {
        # Warmer audience — better CTR than prospecting, higher conv
        "impression_range":  (8000,  35000),
        "ctr_range":         (0.003, 0.010),  # 0.3–1%
        "cpc_range":         (0.20,  0.85),
        "conv_rate_range":   (0.02,  0.06),
        "avg_order_range":   (80,    220),
        "daily_budget":      950,
    },

    "Performance Max | ROAS Target": {
        # Google's fully automated campaign — mixed signal, highest budget
        "impression_range":  (6000,  30000),
        "ctr_range":         (0.02,  0.05),
        "cpc_range":         (1.50,  4.00),
        "conv_rate_range":   (0.04,  0.10),
        "avg_order_range":   (120,   400),
        "daily_budget":      4500,
    },

    "YouTube | Brand Awareness": {
        # Video ads — measured in views/impressions, not clicks. Very low CTR
        "impression_range":  (20000, 120000),
        "ctr_range":         (0.0003, 0.0015), # 0.03–0.15%
        "cpc_range":         (0.03,  0.18),    # CPV model — very cheap per view
        "conv_rate_range":   (0.001, 0.005),
        "avg_order_range":   (100,   300),
        "daily_budget":      2200,
    },
}

# ─────────────────────────────────────────────────────────────────
# ALERT COOLDOWN — prevents spam (one alert per campaign per type
# per cooldown window)
# ─────────────────────────────────────────────────────────────────
ALERT_COOLDOWN_SECONDS = 300   # 5 minutes between same alert type per campaign
_alert_last_fired = {}         # key: (campaign_name, alert_type) → timestamp

def _can_fire_alert(campaign_name: str, alert_type: str) -> bool:
    key = (campaign_name, alert_type)
    now = time.time()
    last = _alert_last_fired.get(key, 0)
    if now - last >= ALERT_COOLDOWN_SECONDS:
        _alert_last_fired[key] = now
        return True
    return False

# ─────────────────────────────────────────────────────────────────
# GLOBAL COUNTERS
# ─────────────────────────────────────────────────────────────────
CAMPAIGNS = [{"name": name, "id": None, **profile} for name, profile in CAMPAIGN_PROFILES.items()]
daily_spend   = {c["name"]: 0.0 for c in CAMPAIGNS}
total_records = 0
alert_count   = 0


# ─────────────────────────────────────────────────────────────────
# FETCH CAMPAIGN IDs FROM SUPABASE
# ─────────────────────────────────────────────────────────────────
def fetch_campaign_ids() -> bool:
    """Load campaign UUIDs from the campaigns table."""
    try:
        result = supabase.table("campaigns").select("id, name").execute()
        id_map = {row["name"]: row["id"] for row in result.data}
        for c in CAMPAIGNS:
            c["id"] = id_map.get(c["name"])
        found   = [c for c in CAMPAIGNS if c["id"]]
        missing = [c["name"] for c in CAMPAIGNS if not c["id"]]
        log.info(f"Loaded {len(found)}/{len(CAMPAIGNS)} campaigns from Supabase")
        if missing:
            log.warning(f"Campaigns not in DB (will skip): {missing}")
            log.warning("Run the seed SQL in database/seed_campaigns.sql to add them")
        return len(found) > 0
    except Exception as e:
        log.error(f"Failed to fetch campaigns: {e}")
        return False


# ─────────────────────────────────────────────────────────────────
# METRIC GENERATION ENGINE
# ─────────────────────────────────────────────────────────────────
def generate_metric(campaign: dict) -> tuple[dict, bool]:
    """
    Generates one ad_metrics row per campaign event.
    Uses per-campaign-type benchmarks for realistic variance.
    ctr is a GENERATED ALWAYS column in DB — do not insert it.
    """
    # ── Time-of-day traffic pattern (UTC) ──────────────────────
    # Real ad traffic peaks: 9–11am, 12–2pm, 7–9pm (user timezone)
    hour = datetime.now(timezone.utc).hour
    if   6  <= hour <= 9:   time_mult = 1.1   # Morning ramp
    elif 9  <= hour <= 12:  time_mult = 1.4   # Morning peak
    elif 12 <= hour <= 14:  time_mult = 1.3   # Lunch peak
    elif 14 <= hour <= 18:  time_mult = 1.1   # Afternoon
    elif 18 <= hour <= 21:  time_mult = 1.5   # Evening peak (highest)
    elif 21 <= hour <= 23:  time_mult = 1.0   # Late evening
    else:                   time_mult = 0.5   # Overnight (low traffic)

    # ── Core metric calculation ─────────────────────────────────
    impressions = int(
        random.randint(*campaign["impression_range"]) * time_mult
        * random.uniform(0.85, 1.15)  # day-to-day variance
    )

    # CTR with Gaussian noise around the campaign baseline
    ctr_mid = sum(campaign["ctr_range"]) / 2
    ctr     = max(campaign["ctr_range"][0] * 0.5,
                  random.gauss(ctr_mid, ctr_mid * 0.20))

    clicks      = max(0, int(impressions * ctr))
    cpc         = round(random.uniform(*campaign["cpc_range"]), 4)
    spend       = round(clicks * cpc, 2)
    conv_rate   = random.uniform(*campaign["conv_rate_range"])
    conversions = max(0, int(clicks * conv_rate))

    # ROAS = total revenue ÷ spend
    avg_order = random.uniform(*campaign["avg_order_range"])
    revenue   = conversions * avg_order
    roas      = round(revenue / spend, 4) if spend > 0 else 0.0

    # ── Anomaly injection (0.5% of events — realistic fraud rate) ─
    is_anomaly = random.random() < 0.005
    if is_anomaly:
        # Simulate click fraud: impressions spike but spend also spikes
        impressions = int(impressions * random.uniform(8, 25))
        clicks      = int(clicks      * random.uniform(5, 15))
        spend       = round(spend     * random.uniform(4, 12), 2)
        roas        = round(revenue / spend, 4) if spend > 0 else 0.0

    return {
        "campaign_id": campaign["id"],
        "impressions": impressions,
        "clicks":      clicks,
        "cpc":         float(cpc),
        "conversions": conversions,
        "spend":       float(spend),
        "roas":        float(roas),
        "recorded_at": datetime.now(timezone.utc).isoformat(),
    }, is_anomaly


# ─────────────────────────────────────────────────────────────────
# ALERT ENGINE — business-rule based, with cooldown
# ─────────────────────────────────────────────────────────────────
def evaluate_alerts(campaign: dict, metric: dict, is_anomaly: bool):
    """
    Fires alerts only when real business thresholds are crossed.
    Uses a 5-minute cooldown per (campaign, alert_type) pair to avoid spam.
    """
    global alert_count
    name      = campaign["name"]
    ctr       = metric["clicks"] / metric["impressions"] if metric["impressions"] > 0 else 0
    min_ctr   = campaign["ctr_range"][0]   # campaign-specific lower bound

    # Rule 1: ROAS below break-even (2.0x is typical break-even for e-comm)
    if metric["roas"] > 0 and metric["roas"] < 2.0 and metric["conversions"] > 0:
        if _can_fire_alert(name, "low_roas"):
            _insert_alert(campaign, "anomaly",
                f"{name}: ROAS at {metric['roas']:.2f}x — below break-even threshold of 2.0x",
                "high")
            alert_count += 1

    # Rule 2: CTR dropped >40% below the campaign's expected baseline
    if ctr < min_ctr * 0.60 and metric["impressions"] > 5000:
        if _can_fire_alert(name, "ctr_drop"):
            _insert_alert(campaign, "ctr_drop",
                f"{name}: CTR at {ctr*100:.3f}% — significantly below expected {min_ctr*100:.2f}%",
                "medium")
            alert_count += 1

    # Rule 3: Daily budget >90% consumed (not 80% — that was too aggressive)
    if daily_spend[name] > campaign["daily_budget"] * 0.90:
        if _can_fire_alert(name, "budget_exceeded"):
            _insert_alert(campaign, "budget_exceeded",
                f"{name}: Daily spend ${daily_spend[name]:.2f} has consumed "
                f"90%+ of ${campaign['daily_budget']} budget",
                "high")
            alert_count += 1

    # Rule 4: Anomaly / click fraud detected
    if is_anomaly:
        if _can_fire_alert(name, "anomaly"):
            _insert_alert(campaign, "anomaly",
                f"{name}: Unusual traffic pattern detected — possible click fraud "
                f"(spend spiked to ${metric['spend']:.2f})",
                "high")
            alert_count += 1


def _insert_alert(campaign: dict, alert_type: str, message: str, severity: str):
    try:
        supabase.table("alerts").insert({
            "campaign_id": campaign["id"],
            "alert_type":  alert_type,
            "message":     message,
            "severity":    severity,
        }).execute()
        color = Fore.RED if severity == "high" else Fore.YELLOW
        log.warning(color + f"  ALERT [{severity.upper()}] {message}")
    except Exception as e:
        log.error(f"Alert insert failed: {e}")


# ─────────────────────────────────────────────────────────────────
# PIPELINE HEALTH LOGGER
# ─────────────────────────────────────────────────────────────────
def log_pipeline_run(status: str, records: int, duration_ms: int, error: str = None):
    try:
        supabase.table("pipeline_logs").insert({
            "status":           status,
            "records_inserted": records,
            "error_message":    error,
            "duration_ms":      duration_ms,
            "run_at":           datetime.now(timezone.utc).isoformat(),
        }).execute()
    except Exception as e:
        log.warning(f"Pipeline log insert failed: {e}")


# ─────────────────────────────────────────────────────────────────
# MAIN LOOP
# ─────────────────────────────────────────────────────────────────
def main():
    global total_records

    print(Fore.CYAN + Style.BRIGHT + """
╔══════════════════════════════════════════════════════════════╗
║         AdInsight Live — Production Data Generator           ║
║         Simulating 8 Google Ads campaign types               ║
╚══════════════════════════════════════════════════════════════╝""")
    print(Fore.WHITE  + f"  Supabase : {SUPABASE_URL[:50]}...")
    print(Fore.WHITE  + f"  Tables   : ad_metrics → alerts → pipeline_logs")
    print(Fore.YELLOW + f"  Interval : 2–4 seconds per event")
    print(Fore.YELLOW + f"  Press CTRL+C to stop\n")
    print("─" * 64)

    if not fetch_campaign_ids():
        log.error("No campaigns loaded. Exiting.")
        return

    # Only run campaigns that exist in the DB
    active = [c for c in CAMPAIGNS if c["id"]]
    log.info(f"Running with {len(active)} active campaigns\n")

    try:
        while True:
            start = time.time()
            campaign = random.choice(active)

            metric, is_anomaly = generate_metric(campaign)
            supabase.table("ad_metrics").insert(metric).execute()
            total_records += 1
            daily_spend[campaign["name"]] += metric["spend"]

            # Evaluate business-rule alerts
            evaluate_alerts(campaign, metric, is_anomaly)

            duration_ms = int((time.time() - start) * 1000)
            log_pipeline_run("success", 1, duration_ms)

            # Terminal log — clean, professional
            ctr_pct = metric["clicks"] / metric["impressions"] * 100 if metric["impressions"] > 0 else 0
            fraud_tag = Fore.RED + "  [ANOMALY]" if is_anomaly else ""
            print(
                Fore.GREEN  + f"[{datetime.now().strftime('%H:%M:%S')}]  "
                + Fore.CYAN  + f"{campaign['name']:<35}"
                + Fore.WHITE + f"  {metric['impressions']:>8,} imp"
                + Fore.WHITE + f"  {metric['clicks']:>5} clicks"
                + Fore.WHITE + f"  CTR {ctr_pct:>6.3f}%"
                + Fore.WHITE + f"  ${metric['spend']:>8.2f} spend"
                + Fore.WHITE + f"  ROAS {metric['roas']:>5.2f}x"
                + fraud_tag
            )

            if total_records % 50 == 0:
                log.info(f"Milestone: {total_records} records inserted | {alert_count} alerts fired")

            time.sleep(random.uniform(2.0, 4.0))

    except KeyboardInterrupt:
        log.info(f"\nStopped by user.")
        log.info(f"Session summary: {total_records} records | {alert_count} alerts")
        log_pipeline_run("success", total_records, 0)

    except Exception as e:
        log.error(f"Generator error: {e}")
        log_pipeline_run("failure", total_records, 0, error=str(e))
        raise


if __name__ == "__main__":
    main()
