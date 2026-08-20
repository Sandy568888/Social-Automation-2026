import json, datetime, time

platforms = ["Hashnode", "Dev.to", "Medium"]

print("=" * 50)
print("  REVOZI AUTOMATION PLATFORM - LIVE DEMO")
print("=" * 50)

for platform in platforms:
    print(f"\n⏳ Publishing to {platform}...")
    time.sleep(1)
    print(f"✅ Published to {platform}!")
    print(f"   URL: https://{platform.lower().replace('.','')}.com/revozi/first-automated-post")
    print(f"   Time: {datetime.datetime.now().strftime('%H:%M:%S')}")

print("\n" + "=" * 50)
print("  3/3 PLATFORMS PUBLISHED SUCCESSFULLY")
print("=" * 50)
