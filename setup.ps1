# Setup script for Admin Dashboard - Evidence Marking System (Windows)

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Admin Dashboard Setup Script" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Check if Python is installed
try {
    $pythonVersion = python --version 2>&1
    Write-Host "✅ Python found: $pythonVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Python is not installed. Please install Python 3.14+ first." -ForegroundColor Red
    exit 1
}

# Check if Node.js is installed
try {
    $nodeVersion = node --version
    Write-Host "✅ Node.js found: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Node.js is not installed. Please install Node.js 20+ first." -ForegroundColor Red
    exit 1
}

Write-Host ""

# Backend setup
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Setting up Backend..." -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

Set-Location backend

# Create virtual environment
Write-Host "Creating virtual environment..."
python -m venv venv

# Activate virtual environment
Write-Host "Activating virtual environment..."
.\venv\Scripts\Activate.ps1

# Install Python dependencies
Write-Host "Installing Python dependencies..."
python -m pip install --upgrade pip
pip install -r requirements.txt

Write-Host "✅ Backend dependencies installed" -ForegroundColor Green

# Check for service account JSON
if (-not (Test-Path "ai-marking-tool-480910-1f3c7a43f500.json")) {
    Write-Host "⚠️  Warning: Service account JSON not found!" -ForegroundColor Yellow
    Write-Host "   Please place 'ai-marking-tool-480910-1f3c7a43f500.json' in the backend directory" -ForegroundColor Yellow
}

# Run migrations
Write-Host "Running database migrations..."
python manage.py migrate

# Create coach accounts
Write-Host "Creating coach accounts..."
python manage.py create_coach_accounts

# Create coach data
Write-Host "Creating coach data records..."
python -c "import os, django; os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'server.settings'); django.setup(); exec(open('create_coach_data.py').read())"

# Create QA accounts
Write-Host "Creating QA accounts..."
python -c "import os, django; os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'server.settings'); django.setup(); exec(open('create_new_qa_accounts.py').read())"

Set-Location ..

# Frontend setup
Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Setting up Frontend..." -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

Set-Location frontend

Write-Host "Installing Node.js dependencies..."
npm install

Write-Host "✅ Frontend dependencies installed" -ForegroundColor Green

Set-Location ..

# Final instructions
Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "✅ Setup Complete!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""
Write-Host "To start the application:" -ForegroundColor Yellow
Write-Host ""
Write-Host "Terminal 1 (Backend):" -ForegroundColor White
Write-Host "  cd backend" -ForegroundColor Gray
Write-Host "  .\venv\Scripts\Activate.ps1" -ForegroundColor Gray
Write-Host "  python manage.py runserver" -ForegroundColor Gray
Write-Host ""
Write-Host "Terminal 2 (Frontend):" -ForegroundColor White
Write-Host "  cd frontend" -ForegroundColor Gray
Write-Host "  npm run dev" -ForegroundColor Gray
Write-Host ""
Write-Host "Then open: http://localhost:5173" -ForegroundColor Cyan
Write-Host ""
Write-Host "Default QA Account:" -ForegroundColor Yellow
Write-Host "  Email: mahmoud.fouda@kentbusinesscollege.net" -ForegroundColor Gray
Write-Host "  Password: 98971111" -ForegroundColor Gray
Write-Host ""
Write-Host "See COACH_ACCOUNTS.md for all account credentials" -ForegroundColor Gray
Write-Host "==========================================" -ForegroundColor Cyan
