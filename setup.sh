#!/bin/bash
# Setup script for Admin Dashboard - Evidence Marking System

echo "=========================================="
echo "Admin Dashboard Setup Script"
echo "=========================================="
echo ""

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is not installed. Please install Python 3.14+ first."
    exit 1
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 20+ first."
    exit 1
fi

echo "✅ Python found: $(python3 --version)"
echo "✅ Node.js found: $(node --version)"
echo ""

# Backend setup
echo "=========================================="
echo "Setting up Backend..."
echo "=========================================="

cd backend

# Create virtual environment
echo "Creating virtual environment..."
python3 -m venv venv

# Activate virtual environment
echo "Activating virtual environment..."
source venv/bin/activate

# Install Python dependencies
echo "Installing Python dependencies..."
pip install --upgrade pip
pip install -r requirements.txt

echo "✅ Backend dependencies installed"

# Check for service account JSON
if [ ! -f "ai-marking-tool-480910-1f3c7a43f500.json" ]; then
    echo "⚠️  Warning: Service account JSON not found!"
    echo "   Please place 'ai-marking-tool-480910-1f3c7a43f500.json' in the backend directory"
fi

# Run migrations
echo "Running database migrations..."
python manage.py migrate

# Create coach accounts
echo "Creating coach accounts..."
python manage.py create_coach_accounts

# Create coach data
echo "Creating coach data records..."
python manage.py shell -c "exec(open('create_coach_data.py').read())"

# Create QA accounts
echo "Creating QA accounts..."
python -c "import os, django; os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'server.settings'); django.setup(); exec(open('create_new_qa_accounts.py').read())"

cd ..

# Frontend setup
echo ""
echo "=========================================="
echo "Setting up Frontend..."
echo "=========================================="

cd frontend

echo "Installing Node.js dependencies..."
npm install

echo "✅ Frontend dependencies installed"

cd ..

# Final instructions
echo ""
echo "=========================================="
echo "✅ Setup Complete!"
echo "=========================================="
echo ""
echo "To start the application:"
echo ""
echo "Terminal 1 (Backend):"
echo "  cd backend"
echo "  source venv/bin/activate  # On Windows: venv\\Scripts\\activate"
echo "  python manage.py runserver"
echo ""
echo "Terminal 2 (Frontend):"
echo "  cd frontend"
echo "  npm run dev"
echo ""
echo "Then open: http://localhost:5173"
echo ""
echo "Default QA Account:"
echo "  Email: mahmoud.fouda@kentbusinesscollege.net"
echo "  Password: 98971111"
echo ""
echo "See COACH_ACCOUNTS.md for all account credentials"
echo "=========================================="
