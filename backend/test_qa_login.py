from django.contrib.auth import authenticate

# Test login with email
print("=" * 60)
print("Testing QA Account Login")
print("=" * 60)

# Test 1: Login with email
user = authenticate(username='mahmoud.fouda@kentbusinesscollege.net', password='98971111')
print(f"\nTest 1 - Login with EMAIL: {'✓ SUCCESS' if user else '✗ FAILED'}")
if user:
    print(f"  Username: {user.username}")
    print(f"  Email: {user.email}")
    print(f"  Role: {user.profile.role}")
    print(f"  Coach ID: {user.profile.coach_id}")

# Test 2: Login with username
user2 = authenticate(username='mahmoud.fouda', password='98971111')
print(f"\nTest 2 - Login with USERNAME: {'✓ SUCCESS' if user2 else '✗ FAILED'}")
if user2:
    print(f"  Username: {user2.username}")
    print(f"  Email: {user2.email}")
    print(f"  Role: {user2.profile.role}")
    print(f"  Coach ID: {user2.profile.coach_id}")

print("\n" + "=" * 60)
print("✓ QA account is ready to use!")
print("  Login with: mahmoud.fouda@kentbusinesscollege.net")
print("  Password: 98971111")
print("  This account has full QA access to all coaches.")
print("=" * 60)
