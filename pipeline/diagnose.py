"""
AdInsight Live — Connection Diagnostic
Run this to verify your Supabase setup before starting the dashboard.

Usage:
    cd C:\Users\raman\Downloads\antigravity\adinsight-live\pipeline
    python diagnose.py
"""

import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

URL = os.getenv("SUPABASE_URL")
KEY = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_KEY")

print("\n" + "="*55)
print("  AdInsight Live — Supabase Diagnostic")
print("="*55)

# Step 1: Check credentials
print("\n[1] Checking credentials...")
if not URL or not KEY:
    print("  ❌  SUPABASE_URL or SUPABASE_SERVICE_KEY missing in .env")
    exit(1)
print(f"  ✅  URL:  {URL[:45]}...")
print(f"  ✅  KEY:  {KEY[:30]}...")

# Step 2: Connect
print("\n[2] Connecting to Supabase...")
try:
    client = create_client(URL, KEY)
    print("  ✅  Client created successfully")
except Exception as e:
    print(f"  ❌  Failed to create client: {e}")
    exit(1)

# Step 3: Check each required table
REQUIRED_TABLES = ["campaigns", "live_metrics", "system_alerts", "pipeline_runs"]

print("\n[3] Checking required tables...")
all_good = True
for table in REQUIRED_TABLES:
    try:
        result = client.table(table).select("id").limit(1).execute()
        count = len(result.data)
        print(f"  ✅  '{table}' exists  ({count} row(s) visible)")
    except Exception as e:
        print(f"  ❌  '{table}' NOT FOUND — run database/schema.sql in Supabase SQL Editor")
        all_good = False

# Step 4: Check campaign_summary view
print("\n[4] Checking 'campaign_summary' view...")
try:
    result = client.from_("campaign_summary").select("name").execute()
    print(f"  ✅  View exists — {len(result.data)} campaign(s) found:")
    for row in result.data:
        print(f"      → {row['name']}")
except Exception as e:
    print(f"  ❌  'campaign_summary' view NOT FOUND — run database/schema.sql")
    all_good = False

# Step 5: Try inserting a test row
print("\n[5] Testing write access to live_metrics...")
if all_good:
    try:
        # First get a campaign id
        camps = client.table("campaigns").select("id, name").limit(1).execute()
        if camps.data:
            from datetime import datetime, timezone
            test_row = {
                "campaign_id":   camps.data[0]["id"],
                "campaign_name": camps.data[0]["name"],
                "impressions":   999,
                "clicks":        10,
                "conversions":   1,
                "spend":         5.00,
                "roas":          2.0,
                "quality_score": 8,
                "region":        "TEST",
                "device":        "Desktop",
                "is_anomaly":    False,
                "created_at":    datetime.now(timezone.utc).isoformat(),
            }
            client.table("live_metrics").insert(test_row).execute()
            print("  ✅  Test row inserted into live_metrics successfully!")
            print("      (If the dashboard is open, you should see it update NOW)")
        else:
            print("  ⚠️   No campaigns seeded yet — run database/schema.sql")
    except Exception as e:
        print(f"  ❌  Write failed: {e}")
else:
    print("  ⏭️   Skipped (fix table issues first)")

# Summary
print("\n" + "="*55)
if all_good:
    print("  ✅  ALL CHECKS PASSED — your setup is ready!")
    print("  → Start the generator:  python generator.py")
    print("  → Restart the frontend: npm run dev (in frontend/)")
else:
    print("  ❌  SETUP INCOMPLETE")
    print("  → Go to supabase.com → SQL Editor")
    print("  → Paste contents of database/schema.sql → Run")
    print("  → Then run this script again")
print("="*55 + "\n")
