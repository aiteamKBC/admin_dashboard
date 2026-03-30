# Coach Accounts Setup

## Overview
Individual coach accounts have been created where each coach can only see and manage their own data.
Coaches can log in using either their **full name** or their **email address**.

## Account Credentials

**Password for all coaches:** `123456789`

**Login Options:** You can use either username (full name) OR email

### Coach Accounts

| Coach Name         | Coach ID | Username (for login)  | Email (for login)                        |
|--------------------|----------|-----------------------|------------------------------------------|
| Omar Elshafey      | 1        | Omar Elshafey         | Omar.Elshafey@kentbusinesscollege.com    |
| Radwa Samir        | 2        | Radwa Samir           | Radwa.Samir@kentbusinesscollege.com      |
| Omar Badr          | 3        | Omar Badr             | Omar.Badr@kentbusinesscollege.com        |
| Ahmed Maher        | 4        | Med Maher             | Med.Maher@kentbusinesscollege.com        |
| Femi Falodun       | 5        | Femi Falodun          | Femi.Falodun@kentbusinesscollege.com     |
| Nathan Shields     | 6        | Nathan Shields        | nathan.shields@kentbusinesscollege.com   |
| Hannen Mostafa     | 7        | Hannen Mostafa        | Hannen.Mostafa@kentbusinesscollege.com   |
| Nouran Abdalla     | 8        | Nouran Abdalla        | Nouran.Abdalla@kentbusinesscollege.com   |
| Afaan Khan         | 9        | Afaan Khan            | Afaan.khan@kentbusinesscollege.com       |
| Adeyemi Adeshina   | 10       | Adeyemi Adeshina      | adeyemi.adeshina@kentbusinesscollege.com |
| Marwa Mahmoud      | 11       | Marwa Mahmoud         | Marwa.Mahmoud@kentbusinesscollege.com    |
| Mahinor Hesham     | 12       | Mahinor Hesham        | Mahinor.Hesham@kentbusinesscollege.com   |
| Omar Ham           | 13       | Omar Ham              | Omar.Ham@kentbusinesscollege.com         |
| Aryan Harikumar    | 14       | Aryan Harikumar       | Aryan.Harikumar@kentbusinesscollege.com  |
| Elaf Mansour       | 15       | Elaf Mansour          | Elaf.Mansour@kentbusinesscollege.com     |
| Olivia Evans       | 16       | Olivia Evans          | Olivia.Evans@kentbusinesscollege.com     |
| Patryk Zajac       | 17       | Patryk Zajac          | Patryk.Zajac@kentbusinesscollege.com     |

## Login Examples

You can log in using either format:

**Option 1 - Using Full Name:**
- Username: `Olivia Evans`
- Password: `123456789`

**Option 2 - Using Email:**
- Username: `Olivia.Evans@kentbusinesscollege.com`
- Password: `123456789`

## How It Works

### Authentication
- Coaches can log in with either their **full name** or their **email address** and password `123456789`
- The login system checks:
  1. First, tries to authenticate with the provided username
  2. If that fails and the input looks like an email, it finds the user by email and authenticates
- The system authenticates them and returns their `coach_id` in the login response
- The JWT token contains their user information including their assigned coach_id

### Access Control (Backend)
- **Coach Role Permissions:** Coaches can only access data for their own coach_id
- The `_guard_coach_scope()` function in `tasks/views.py` enforces this restriction
- When a coach requests data, the system checks:
  - If user role is "coach" → Only allow access if `request.user.profile.coach_id == requested_coach_id`
  - If user role is "qa" → Allow access to any coach's data (admin/QA accounts)

### Data Filtering (Frontend)
- **Coach View:** Each coach only sees their own name in the coaches list
- **QA View:** QA users see all coaches in the list
- The filtering is applied in three main components:
  - `AnalyticsMeetings.tsx` - Dashboard page
  - `AttendancePage.tsx` - Attendance tracking page
  - `BookingsCalendarPage.tsx` - Calendar view page
- Filtering logic: `if (role === "coach") { filter by username }`
- The system automatically filters all coach lists based on the logged-in user's username

## Managing Coach Accounts

### Re-run Account Creation
If you need to reset passwords or create new accounts, run:
```bash
cd backend
python manage.py create_coach_accounts
```

**Important:** After creating new coach accounts, you must also create their CoachData records:
```bash
python manage.py shell --command="exec(open('create_coach_data.py').read())"
```

This ensures the tasks API works for the new coaches.

### Add New Coaches
1. Edit `backend/accounts/management/commands/create_coach_accounts.py`
2. Add the new coach to the `coaches` list with their name and email:
   ```python
   {"name": "New Coach", "email": "New.Coach@kentbusinesscollege.com"}
   ```
3. Run the command: `python manage.py create_coach_accounts`

### Change Password
To change the password for all coaches, edit the `password` variable in the management command and re-run it.

## Security Notes
- Each coach account has the "coach" role with restricted permissions
- Coaches cannot access other coaches' data
- Only QA role users can view all coaches' data
- The password `123456789` should be changed to something more secure in production

## Tasks API Setup

The tasks API requires CoachData records in the database for each coach. These have been created for all 17 coaches.

**If tasks API stops working:**
1. Check if CoachData records exist:
   ```bash
   python manage.py shell -c "from tasks.models import CoachData; print(f'Total CoachData records: {CoachData.objects.count()}')"
   ```

2. Recreate CoachData records if needed:
   ```bash
   python manage.py shell --command="exec(open('create_coach_data.py').read())"
   ```

**What this does:**
- Creates a `coaches_data` table record for each coach
- Maps their Profile.coach_id to CoachData.case_owner_id
- Initializes an empty tasks list for each coach
- Enables the tasks API endpoints to work correctly

## QA Accounts

QA accounts have full access to all coaches and students data.

| Name            | Username        | Email                                    | Password         | Role |
|-----------------|-----------------|------------------------------------------|------------------|------|
| Mahmoud Fouda   | mahmoud.fouda   | mahmoud.fouda@kentbusinesscollege.net    | 98971111         | qa   |
| Rewan Yasser    | Rewan.yasser    | Rewan.yasser@kentbusinesscollege.com     | Rewan@kent       | qa   |
| Ahmed Lotfi     | Ahmed.Lotfi     | Ahmed.Lotfi@kentbusinesscollege.com      | Lotfi@kent6      | qa   |
| Khaled Ashraf   | Khaled.Ashraf   | Khaled.Ashraf@kentbusinesscollege.com    | k.z22112000k.z16 | qa   |
| Office Admin    | office          | office@kentbusinesscollege.org           | KBCAi.123456     | qa   |

**QA Account Features:**
- Can view and manage data for ALL coaches
- Can switch between any coach in the dashboard
- Has full administrative access
- Can log in using either username or email
- Can access evidence marking and AI assessment features
