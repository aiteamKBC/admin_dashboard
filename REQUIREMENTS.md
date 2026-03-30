# Project Requirements

## Created: February 16, 2026

This document lists all dependencies for the Admin Dashboard - Evidence Marking System.

## Backend Requirements

### Installation
```bash
cd backend
pip install -r requirements.txt
```

### Core Dependencies

#### Django & Web Framework
- **Django==6.0.1** - Web framework
- **djangorestframework==3.16.1** - REST API framework
- **django-cors-headers==4.9.0** - CORS handling
- **django-filter==25.2** - API filtering
- **drf-spectacular==0.29.0** - API documentation

#### Authentication
- **djangorestframework_simplejwt==5.5.1** - JWT authentication
- **PyJWT==2.11.0** - JWT implementation
- **cryptography==46.0.5** - Cryptographic operations

#### Database
- **psycopg==3.3.2** - PostgreSQL adapter
- **psycopg-binary==3.3.2** - PostgreSQL binary package
- **dj-database-url==3.1.0** - Database URL parsing

#### Google APIs
- **google-api-python-client==2.149.0** - Google API client
- **google-auth==2.34.0** - Google authentication
- **google-auth-httplib2==0.2.0** - HTTP library for Google Auth
- **google-auth-oauthlib==1.2.1** - OAuth support
- **google-api-core==2.29.0** - Google API core functionality
- **googleapis-common-protos==1.72.0** - Common protocol buffers

#### Utilities
- **python-dotenv==1.2.1** - Environment variable loading
- **PyYAML==6.0.3** - YAML parsing
- **requests==2.32.5** - HTTP library
- **certifi==2026.1.4** - SSL certificates

#### Supporting Libraries
- asgiref==3.11.0
- attrs==25.4.0
- cachetools==5.5.2
- cffi==2.0.0
- charset-normalizer==3.4.4
- httplib2==0.31.2
- idna==3.11
- inflection==0.5.1
- jsonschema==4.26.0
- oauthlib==3.3.1
- protobuf==6.33.5
- pyasn1==0.6.2
- pyasn1_modules==0.4.2
- pycparser==3.0
- pyparsing==3.3.2
- requests-oauthlib==2.0.0
- rsa==4.9.1
- sqlparse==0.5.5
- tzdata==2025.3
- uritemplate==4.2.0
- urllib3==2.6.3

### Total Backend Packages: 49

## Frontend Requirements

### Installation
```bash
cd frontend
npm install
```

### Core Dependencies (Production)

#### React Framework
- **react==19.2.0** - UI library
- **react-dom==19.2.0** - React DOM rendering
- **react-router-dom==7.11.0** - Routing

#### UI & Visualization
- **recharts==3.6.0** - Charts and data visualization
- **@fortawesome/fontawesome-free==7.1.0** - Icon library

#### Document Generation
- **html2canvas==1.4.1** - HTML to canvas
- **jspdf==4.1.0** - PDF generation
- **file-saver==2.0.5** - File saving
- **xlsx==0.18.5** - Excel file handling

### Development Dependencies

#### TypeScript & Build Tools
- **typescript==5.9.3** - Type system
- **vite==7.2.4** - Build tool & dev server
- **@vitejs/plugin-react==5.1.1** - Vite React plugin

#### Code Quality
- **eslint==9.39.1** - Linting
- **@eslint/js==9.39.1** - ESLint JavaScript config
- **eslint-plugin-react-hooks==7.0.1** - React hooks linting
- **eslint-plugin-react-refresh==0.4.24** - React refresh linting
- **typescript-eslint==8.46.4** - TypeScript ESLint
- **globals==16.5.0** - Global variables

#### Styling
- **tailwindcss==3.4.19** - CSS framework
- **postcss==8.5.6** - CSS processing
- **autoprefixer==10.4.23** - CSS autoprefixer

#### React Compiler
- **babel-plugin-react-compiler==1.0.0** - React optimization

#### Type Definitions
- **@types/react==19.2.5**
- **@types/react-dom==19.2.3**
- **@types/file-saver==2.0.7**
- **@types/node==24.10.1**

### Total Frontend Packages: ~30

## System Requirements

### Minimum Versions
- **Python:** 3.14+
- **Node.js:** 20+
- **PostgreSQL:** 13+
- **npm:** 10+

### Platform Support
- ✅ Windows 10/11
- ✅ macOS 12+
- ✅ Linux (Ubuntu 20.04+, Debian 11+)

## Installation Commands

### Quick Setup (Windows)
```powershell
# Run automated setup
.\setup.ps1
```

### Quick Setup (Linux/Mac)
```bash
# Run automated setup
chmod +x setup.sh
./setup.sh
```

### Manual Setup

#### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
python manage.py migrate
python manage.py create_coach_accounts
```

#### Frontend
```bash
cd frontend
npm install
npm run dev
```

## External Services Required

### PostgreSQL Database
- Create database before running migrations
- Configure DATABASE_URL in .env file

### Google Service Account
- Required for Evidence Marking feature
- File: `ai-marking-tool-480910-1f3c7a43f500.json`
- Place in `backend/` directory
- Must have Sheets API access

## Security Notes

⚠️ **IMPORTANT:**
- Service account JSON file is **NOT** included in repository
- Add to `.gitignore` to prevent accidental commits
- Store credentials securely
- Use environment variables for sensitive data
- Change default passwords in production

## Package Management

### Update All Packages

#### Backend
```bash
cd backend
pip list --outdated
pip install --upgrade -r requirements.txt
pip freeze > requirements.txt
```

#### Frontend
```bash
cd frontend
npm outdated
npm update
npm audit fix
```

## Troubleshooting

### Common Issues

1. **PostgreSQL Connection Error**
   - Verify database is running
   - Check DATABASE_URL in .env
   - Ensure database exists

2. **Google Sheets API Error**
   - Verify service account JSON exists
   - Check file permissions
   - Verify spreadsheet access

3. **Port Already in Use**
   - Backend: Change from 8000 to another port
   - Frontend: Vite will auto-increment from 5173

4. **Module Not Found**
   - Backend: Reinstall requirements.txt
   - Frontend: Delete node_modules, run npm install

## Version History

- **February 16, 2026:** Initial requirements file created
  - Django 6.0.1
  - React 19.2.0
  - 49 backend packages
  - 30 frontend packages
  - Google Sheets API integration
  - JWT authentication
  - PostgreSQL support

## Documentation

- [README.md](README.md) - Project overview and setup
- [COACH_ACCOUNTS.md](COACH_ACCOUNTS.md) - Account credentials
- [backend/requirements.txt](backend/requirements.txt) - Exact Python versions
- [frontend/package.json](frontend/package.json) - Exact Node versions

---

**Last Updated:** February 16, 2026  
**Python Version:** 3.14  
**Node Version:** 20+  
**Database:** PostgreSQL 13+
