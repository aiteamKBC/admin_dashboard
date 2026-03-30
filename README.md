# Admin Dashboard - Evidence Marking System

A full-stack web application for managing coach activities, student analytics, and AI-powered evidence assessment.

## Project Structure

```
admin_dashboard-main2.0/
├── backend/                 # Django REST API
│   ├── accounts/           # Authentication & user management
│   ├── tasks/              # Task management
│   ├── server/             # Django settings
│   ├── manage.py
│   └── requirements.txt    # Python dependencies
├── frontend/               # React + TypeScript
│   ├── src/
│   ├── public/
│   ├── package.json       # Node dependencies
│   └── vite.config.ts
└── COACH_ACCOUNTS.md      # Account credentials documentation
```

## Tech Stack

### Backend
- **Django 6.0.1** - Web framework
- **Django REST Framework** - API development
- **PostgreSQL** - Database (psycopg 3.3.2)
- **JWT Authentication** - djangorestframework-simplejwt
- **Google Sheets API** - Evidence data integration
- **CORS Headers** - Cross-origin support

### Frontend
- **React 19.2.0** - UI framework
- **TypeScript** - Type safety
- **Vite 7.2.4** - Build tool
- **Tailwind CSS** - Styling
- **React Router** - Navigation
- **Recharts** - Data visualization

## Prerequisites

- Python 3.14+
- Node.js 20+
- PostgreSQL database
- Google Service Account JSON (for Sheets API)

## Installation

### 1. Backend Setup

```bash
# Navigate to backend directory
cd backend

# Create virtual environment (recommended)
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Set up environment variables
# Create .env file with:
# - DATABASE_URL
# - SECRET_KEY
# - DEBUG
# - ALLOWED_HOSTS

# Run migrations
python manage.py migrate

# Create coach accounts
python manage.py create_coach_accounts

# Create coach data records
python manage.py shell -c "exec(open('create_coach_data.py').read())"

# Create QA accounts
python -c "import os, django; os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'server.settings'); django.setup(); exec(open('create_new_qa_accounts.py').read())"

# Start development server
python manage.py runserver
```

### 2. Frontend Setup

```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

### 3. Google Sheets API Setup

1. Place your service account JSON file in `backend/` directory
2. File should be named: `ai-marking-tool-480910-1f3c7a43f500.json`
3. Ensure the service account has access to your spreadsheet
4. Update `SPREADSHEET_ID` in `backend/accounts/evidence_views.py` if needed

## Running the Application

### Development Mode

1. **Terminal 1 - Backend:**
   ```bash
   cd backend
   python manage.py runserver
   ```
   Backend runs on: http://127.0.0.1:8000

2. **Terminal 2 - Frontend:**
   ```bash
   cd frontend
   npm run dev
   ```
   Frontend runs on: http://localhost:5173

## Account Management

### Coach Accounts (17 total)
- **Role:** Limited to their own data
- **Password:** `123456789` (all coaches)
- **Login:** Use full name or email
- See `COACH_ACCOUNTS.md` for complete list

### QA Accounts (5 total)
- **Role:** Full administrative access
- **Accounts:**
  - mahmoud.fouda@kentbusinesscollege.net (Password: 98971111)
  - Rewan.yasser@kentbusinesscollege.com (Password: Rewan@kent)
  - Ahmed.Lotfi@kentbusinesscollege.com (Password: Lotfi@kent6)
  - Khaled.Ashraf@kentbusinesscollege.com (Password: k.z22112000k.z16)
  - office@kentbusinesscollege.org (Password: KBCAi.123456)

## Features

### 1. Dashboard Analytics
- Student session tracking
- Coach performance metrics
- Evidence submission monitoring
- Monthly statistics and charts

### 2. Evidence Marking System
- **Load Evidence:** Fetch student evidence from Google Sheets
- **Mark Evidence:** Submit to processing sheet
- **AI Assessment:** Automated marking with feedback
- **Result Display:** Beautiful modal with detailed feedback

### 3. Attendance Management
- Monthly session tracking
- Student attendance records
- QA-only editing permissions

### 4. Calendar Bookings
- Week/Month view
- Coach-specific filtering
- Meeting management

### 5. Task Management
- Coach-specific task lists
- Priority levels
- Status tracking

## API Endpoints

### Authentication
- `POST /api/accounts/login/` - Login with username/email

### Evidence
- `GET /api/accounts/student-components/` - Fetch student evidence
- `POST /api/accounts/mark-evidence/` - Submit for marking

### Tasks
- `GET /api/tasks/` - List tasks
- `POST /api/tasks/` - Create task
- `GET /api/tasks/coach/{id}/` - Coach-specific tasks

## Environment Variables

### Backend (.env)
```env
DATABASE_URL=postgresql://user:password@localhost:5432/dbname
SECRET_KEY=your-secret-key
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1
```

### Frontend (vite.config.ts)
Proxy configuration already set up for `/api/*` requests.

## Database Schema

### Key Models
- **User** - Django auth user
- **Profile** - Extended user data (role, coach_id)
- **CoachData** - Unmanaged table for task integration

### Roles
- `coach` - Limited access to own data
- `qa` - Full administrative access

## Google Sheets Integration

### Sheet Mapping
- **Groups:** A, B, C, D, E, PCP, ME, PDF
- **Processing Sheets:** `{group} processing sheet`
- **Output Sheets:** `{group} Output`

### Evidence Flow
1. Student evidence loaded from group-specific sheet
2. User clicks "Mark" → Data sent to processing sheet
3. AI processes evidence (external system)
4. Results appear in output sheet
5. Backend polls output sheet and displays results

## Troubleshooting

### Backend Issues
```bash
# Check for errors
python manage.py check

# Reset database
python manage.py migrate --run-syncdb

# Recreate coach data
python manage.py shell -c "exec(open('create_coach_data.py').read())"
```

### Frontend Issues
```bash
# Clear node modules
rm -rf node_modules package-lock.json
npm install

# Check for TypeScript errors
npx tsc --noEmit
```

### Google Sheets API
- Verify service account JSON is in correct location
- Check spreadsheet permissions
- Verify SPREADSHEET_ID in evidence_views.py
- Test with: `python manage.py shell` → `from accounts.evidence_views import get_sheets_service`

## Development Notes

### Adding New Coach Accounts
1. Edit `backend/accounts/management/commands/create_coach_accounts.py`
2. Add to coaches list
3. Run: `python manage.py create_coach_accounts`
4. Create CoachData: `python manage.py shell -c "exec(open('create_coach_data.py').read())"`

### Adding New QA Accounts
1. Edit `backend/create_new_qa_accounts.py`
2. Add to qa_accounts list
3. Run: `python -c "import os, django; os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'server.settings'); django.setup(); exec(open('create_new_qa_accounts.py').read())"`

### Deploying to Production
1. Set `DEBUG=False` in settings
2. Configure proper `ALLOWED_HOSTS`
3. Use production database
4. Set up proper CORS origins
5. Use environment-specific service account
6. Build frontend: `npm run build`
7. Serve static files with nginx/Apache

## Security Notes

⚠️ **Important:** Change default passwords before production deployment!

- Coach passwords: Currently `123456789` (all coaches)
- Update in: `backend/accounts/management/commands/create_coach_accounts.py`
- Service account JSON should not be committed to git
- Use environment variables for sensitive data

## License

Proprietary - Kent Business College

## Support

For issues or questions, contact:
- Technical: office@kentbusinesscollege.org
- QA Team: See COACH_ACCOUNTS.md for QA contact emails
