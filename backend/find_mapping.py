from tasks.models import CoachData
import json

print("=" * 80)
print("Looking for coach name to case_owner_id mapping...")
print("=" * 80)

# We need to check if there's a coaches table or view that has both
# Check if we can find coach names in the analytics data
try:
    from django.db import connection
    
    with connection.cursor() as cursor:
        # Try to find a table with coach names
        cursor.execute("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_type = 'BASE TABLE'
            ORDER BY table_name
        """)
        
        tables = cursor.fetchall()
        print("\nAvailable tables:")
        for table in tables[:20]:
            print(f"  - {table[0]}")
            
        print("\n" + "=" * 80)
        print("Checking for coach/case_owner mapping...")
        print("=" * 80)
        
        # Check if there's a coaches or case_owners table
        cursor.execute("""
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'coaches_data'
            ORDER BY ordinal_position
        """)
        
        columns = cursor.fetchall()
        print("\ncoaches_data table columns:")
        for col in columns:
            print(f"  - {col[0]}: {col[1]}")
            
except Exception as e:
    print(f"Error querying database: {e}")

# Let's also check the API response format
print("\n" + "=" * 80)
print("We need to match coach names from analytics API to case_owner_id")
print("=" * 80)
print("\nThe analytics API returns coach data with:")
print("  - id or case_owner_id (the actual database ID)")
print("  - case_owner (the coach name)")
print("\nSolution: Update Profile.coach_id to match the actual case_owner_id")
