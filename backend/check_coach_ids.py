from tasks.models import CoachData
from django.contrib.auth.models import User

print("=" * 60)
print("COACH DATA TABLE (case_owner_id values)")
print("=" * 60)

coaches = CoachData.objects.all()[:20]
for c in coaches:
    has_tasks = "Yes" if c.tasks else "No"
    print(f"case_owner_id: {c.case_owner_id:5} | has_tasks: {has_tasks}")

print("\n" + "=" * 60)
print("USER PROFILES (coach_id values)")
print("=" * 60)

users = User.objects.filter(profile__role='coach').order_by('profile__coach_id')
for user in users:
    print(f"Username: {user.username:20} | coach_id: {user.profile.coach_id}")

print("\n" + "=" * 60)
print("ISSUE IDENTIFIED:")
print("=" * 60)
print("The Profile.coach_id values (1-17) don't match")
print("the CoachData.case_owner_id values in the database.")
print("We need to map coach names to their actual case_owner_id.")
