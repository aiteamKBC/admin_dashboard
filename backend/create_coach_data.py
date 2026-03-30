"""
Create CoachData records for all coach accounts.

This script ensures that every coach user account has a corresponding
CoachData record in the coaches_data table, which is required for the
tasks API to function correctly.

Usage:
    python manage.py shell --command="exec(open('create_coach_data.py').read())"
"""

from tasks.models import CoachData
from django.contrib.auth.models import User

print("=" * 80)
print("Creating CoachData records for coach accounts")
print("=" * 80)

# Get all coach users (exclude QA accounts and demo accounts)
coaches = User.objects.filter(profile__role='coach').exclude(
    username__in=['coach_demo', 'qa_demo']
)

created_count = 0
exists_count = 0
error_count = 0

for user in coaches:
    coach_id = user.profile.coach_id
    coach_name = user.username
    
    if not coach_id:
        print(f"⚠ Skipped {coach_name:20} (no coach_id set)")
        error_count += 1
        continue
    
    try:
        coach_id_int = int(coach_id)
        
        # Create or get CoachData record
        coach_data, created = CoachData.objects.get_or_create(
            case_owner_id=coach_id_int,
            defaults={'tasks': []}
        )
        
        if created:
            print(f"✓ Created: {coach_name:20} (coach_id: {coach_id})")
            created_count += 1
        else:
            print(f"  Exists:  {coach_name:20} (coach_id: {coach_id})")
            exists_count += 1
            
    except ValueError as e:
        print(f"✗ Error:   {coach_name:20} (invalid coach_id: {coach_id})")
        error_count += 1
    except Exception as e:
        print(f"✗ Error:   {coach_name:20} ({e})")
        error_count += 1

print("\n" + "=" * 80)
print(f"Summary:")
print(f"  ✓ Created: {created_count}")
print(f"    Exists:  {exists_count}")
if error_count > 0:
    print(f"  ✗ Errors:  {error_count}")
print("=" * 80)

if created_count > 0 or exists_count > 0:
    print("\n✓ Tasks API is now functional for all coach accounts!")
    print("  Coaches can log in and use the tasks feature.")

