from django.contrib.auth import authenticate
from django.contrib.auth.models import User

# Test 1: Login with email
email = 'Olivia.Evans@kentbusinesscollege.com'
password = '123456789'

print("=" * 60)
print("Test 1: Login with EMAIL")
print("=" * 60)

try:
    user_obj = User.objects.get(email=email)
    print(f"✓ Found user by email: {user_obj.username}")
    
    user = authenticate(username=user_obj.username, password=password)
    if user:
        print(f'✓ Login successful with email!')
        print(f'  Username: {user.username}')
        print(f'  Email: {user.email}')
        print(f'  Role: {user.profile.role}')
        print(f'  Coach ID: {user.profile.coach_id}')
    else:
        print('✗ Authentication failed')
except User.DoesNotExist:
    print(f'✗ No user found with email: {email}')

print("\n" + "=" * 60)
print("Test 2: Login with USERNAME")
print("=" * 60)

# Test 2: Login with username
username = 'Olivia Evans'
user = authenticate(username=username, password=password)

if user:
    print(f'✓ Login successful with username!')
    print(f'  Username: {user.username}')
    print(f'  Email: {user.email}')
    print(f'  Role: {user.profile.role}')
    print(f'  Coach ID: {user.profile.coach_id}')
else:
    print('✗ Login failed')

print("\n" + "=" * 60)
print("Test 3: Check all coach emails")
print("=" * 60)

coaches = User.objects.filter(profile__role='coach').order_by('profile__coach_id')
for coach in coaches:
    print(f'{coach.profile.coach_id}. {coach.username:20} | {coach.email}')
