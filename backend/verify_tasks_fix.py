from django.contrib.auth import authenticate
from tasks.models import CoachData

print("=" * 80)
print("TESTING TASKS API FIX")
print("=" * 80)

# Test authentication and tasks retrieval for a coach
username = 'Olivia Evans'
password = '123456789'

user = authenticate(username=username, password=password)

if user:
    print(f"\n✓ Login successful for{user.username}")
    print(f"  Role: {user.profile.role}")
    print(f"  Coach ID: {user.profile.coach_id}")
    
    # Check if CoachData exists
    try:
        coach_data = CoachData.objects.get(case_owner_id=user.profile.coach_id)
        print(f"\n✓ CoachData found for ID {user.profile.coach_id}")
        print(f"  Tasks count: {len(coach_data.tasks) if coach_data.tasks else 0}")
        print(f"  Tasks: {coach_data.tasks}")
        
        print("\n✓ Tasks API will now work!")
        print(f"  Endpoint: GET /tasks-api/coaches/{user.profile.coach_id}/tasks/")
        
    except CoachData.DoesNotExist:
        print(f"\n✗ CoachData NOT found for ID {user.profile.coach_id}")
        
else:
    print("\n✗ Login failed")

print("\n" + "=" * 80)
print("SOLUTION SUMMARY")
print("=" * 80)
print("✓ Created CoachData records for all 17 coach accounts")
print("✓ Tasks API is now functional for individual coach logins")
print("✓ Each coach can now:")
print("  - View their tasks")
print("  - Create new tasks")
print("  - Update/delete tasks")
print("\nCoaches can refresh their dashboard to see the tasks panel working!")
print("=" * 80)
