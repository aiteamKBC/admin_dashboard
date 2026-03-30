from django.db import connection
from django.contrib.auth.models import User

print("=" * 80)
print("Searching for coach name to case_owner_id mapping in database...")
print("=" * 80)

try:
    with connection.cursor() as cursor:
        # Try to find a view or table with coach analytics
        cursor.execute("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
            AND (table_name LIKE '%coach%' OR table_name LIKE '%analytics%' OR table_name LIKE '%case%')
            ORDER BY table_name
        """)
        
        tables = cursor.fetchall()
        print("\nTables with coach/analytics/case in name:")
        for table in tables:
            print(f"  - {table[0]}")
        
        # Try the most likely view/table
        for table_name in ['coaches_all_analytics', 'v_coaches_analytics', 'coach_analytics', 'coaches_view']:
            try:
                cursor.execute(f"""
                    SELECT case_owner_id, case_owner 
                    FROM {table_name}
                    LIMIT 5
                """)
                
                rows = cursor.fetchall()
                if rows:
                    print(f"\n✓ Found data in {table_name}:")
                    for row in rows:
                        print(f"  {row[0]}: {row[1]}")
                    break
            except:
                continue
                
except Exception as e:
    print(f"Error: {e}")

print("\n" + "=" * 80)
print("Manual mapping based on typical coach names:")
print("=" * 80)

# Based on the existing coach_demo account, we know at least one mapping
# coach_demo -> coach_id: 3557

# Let's check if we can manually create mappings for common coaches
manual_mapping = {
    # We'll need to map these manually or get them from the running API
}

print("\nSuggestion: Start the Django server and API, then run:")
print("  python manage.py sync_coach_ids")
print("\nOr manually set coach_id values for each coach user.")
