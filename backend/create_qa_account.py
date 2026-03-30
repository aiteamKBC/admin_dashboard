from django.contrib.auth.models import User
from accounts.models import Profile

# Create QA account for Mahmoud Fouda
email = "mahmoud.fouda@kentbusinesscollege.net"
password = "98971111"
username = "mahmoud.fouda"

# Check if user already exists
try:
    user = User.objects.get(email=email)
    print(f"User with email {email} already exists. Updating...")
    user.set_password(password)
    user.save()
    created = False
except User.DoesNotExist:
    # Create new user
    user = User.objects.create_user(
        username=username,
        email=email,
        password=password,
        first_name="Mahmoud",
        last_name="Fouda"
    )
    created = True
    print(f"✓ Created new user: {username}")

# Create or update profile with QA role
profile, profile_created = Profile.objects.get_or_create(
    user=user,
    defaults={
        'role': 'qa',
        'coach_id': None,
    }
)

if not profile_created:
    profile.role = 'qa'
    profile.coach_id = None
    profile.save()
    print(f"✓ Updated profile for {username}")
else:
    print(f"✓ Created profile for {username}")

print("\n" + "=" * 60)
print("QA Account Details:")
print("=" * 60)
print(f"Username: {user.username}")
print(f"Email: {user.email}")
print(f"Password: {password}")
print(f"Role: {profile.role}")
print(f"Coach ID: {profile.coach_id}")
print("=" * 60)
print("\nThis account has QA permissions and can view all coaches.")
