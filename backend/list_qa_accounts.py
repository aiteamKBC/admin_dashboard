from accounts.models import Profile

qa_users = Profile.objects.filter(role='qa').select_related('user')
print('QA Accounts in Database:')
print('=' * 80)
print(f"{'Username':<20} | {'Email':<45} | {'Role'}")
print('=' * 80)
for p in qa_users:
    print(f'{p.user.username:<20} | {p.user.email:<45} | {p.role.upper()}')
print('=' * 80)
print(f'\nTotal QA Accounts: {qa_users.count()}')
