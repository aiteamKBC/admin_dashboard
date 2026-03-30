# Email Login Test Guide

## Testing Email Login

You can now log in using either the coach's full name OR their email address.

### Test Case 1: Login with Email

**API Request:**
```bash
POST /accounts-api/login/
Content-Type: application/json

{
  "username": "Olivia.Evans@kentbusinesscollege.com",
  "password": "123456789"
}
```

**Expected Response:**
```json
{
  "access": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "refresh": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "role": "coach",
  "coach_id": "16",
  "username": "Olivia Evans"
}
```

### Test Case 2: Login with Full Name

**API Request:**
```bash
POST /accounts-api/login/
Content-Type: application/json

{
  "username": "Olivia Evans",
  "password": "123456789"
}
```

**Expected Response:**
```json
{
  "access": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "refresh": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "role": "coach",
  "coach_id": "16",
  "username": "Olivia Evans"
}
```

## Frontend Login

In the login form, users can now enter either:
- **Full Name:** `Olivia Evans`
- **Email:** `Olivia.Evans@kentbusinesscollege.com`

Both will work with the same password: `123456789`

## Implementation Details

### Backend Changes

1. **Management Command** ([create_coach_accounts.py](backend/accounts/management/commands/create_coach_accounts.py))
   - Updated to include email addresses for all coaches
   - Emails follow the pattern: `Firstname.Lastname@kentbusinesscollege.com`

2. **Login View** ([views.py](backend/accounts/views.py))
   - Enhanced to support email-based authentication
   - Process:
     1. First tries to authenticate with the provided username
     2. If authentication fails, checks if the input might be an email
     3. Looks up user by email and authenticates with their username
     4. Returns the same JWT token response

### All Coach Emails

| Coach Name         | Email Address                              |
|--------------------|--------------------------------------------|
| Omar Elshafey      | Omar.Elshafey@kentbusinesscollege.com      |
| Radwa Samir        | Radwa.Samir@kentbusinesscollege.com        |
| Omar Badr          | Omar.Badr@kentbusinesscollege.com          |
| Ahmed Maher        | Ahmed.Maher@kentbusinesscollege.com        |
| Femi Falodun       | Femi.Falodun@kentbusinesscollege.com       |
| Nathan Shields     | nathan.shields@kentbusinesscollege.com     |
| Hannen Mostafa     | Hannen.Mostafa@kentbusinesscollege.com     |
| Nouran Abdalla     | Nouran.Abdalla@kentbusinesscollege.com     |
| Afaan Khan         | Afaan.khan@kentbusinesscollege.com         |
| Adeyemi Adeshina   | adeyemi.adeshina@kentbusinesscollege.com   |
| Marwa Mahmoud      | Marwa.Mahmoud@kentbusinesscollege.com      |
| Mahinor Hesham     | Mahinor.Hesham@kentbusinesscollege.com     |
| Omar Ham           | Omar.Ham@kentbusinesscollege.com           |
| Aryan Harikumar    | Aryan.Harikumar@kentbusinesscollege.com    |
| Elaf Mansour       | Elaf.Mansour@kentbusinesscollege.com       |
| Olivia Evans       | Olivia.Evans@kentbusinesscollege.com       |
| Patryk Zajac       | Patryk.Zajac@kentbusinesscollege.com       |
