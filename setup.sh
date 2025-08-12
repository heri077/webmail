#!/bin/bash

# RX TempMail Setup Script
echo "🚀 RX TempMail - OTP Ready Setup"
echo "================================"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed!"
    echo "Please install Node.js first: https://nodejs.org/"
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 14 ]; then
    echo "❌ Node.js version must be 14 or higher (current: $(node -v))"
    exit 1
fi

echo "✅ Node.js version: $(node -v)"

# Create data directory
if [ ! -d "data" ]; then
    mkdir data
    echo "✅ Created data directory"
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    echo "Trying alternative installation..."
    
    npm install express express-session sqlite3 connect-sqlite3
    npm install smtp-server mailparser
    npm install nodemon --save-dev
fi

# Create .env file if not exists
if [ ! -f ".env" ]; then
    echo "📝 Creating .env file..."
    cat > .env << EOL
# RX TempMail Configuration
PORT=3000
SMTP_PORT=2525
SESSION_SECRET=change-this-secret-key-$(date +%s)
NODE_ENV=development
EOL
    echo "✅ Created .env file"
fi

# Make scripts executable
chmod +x setup.sh
chmod +x start.js

# Test database connection
echo "🗄️  Testing database..."
node -e "
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
if (!fs.existsSync('./data')) fs.mkdirSync('./data');
const db = new sqlite3.Database('./data/test.db');
db.run('CREATE TABLE test (id INTEGER)', (err) => {
    if (err) {
        console.log('❌ Database test failed');
        process.exit(1);
    } else {
        console.log('✅ Database test passed');
        db.close();
        fs.unlinkSync('./data/test.db');
    }
});
"

echo ""
echo "🎉 Setup completed successfully!"
echo ""
echo "📋 Next steps:"
echo "1. Run: node start.js"
echo "2. Open: http://localhost:3000"
echo "3. Test OTP generation"
echo "4. Access dashboard with PIN: admin123"
echo ""
echo "🔧 Configuration:"
echo "- Web server: http://localhost:3000"
echo "- SMTP server: localhost:2525"
echo "- Database: ./data/tempmail.db"
echo "- Sessions: ./data/sessions.db"
echo ""
echo "📚 Read README.md for detailed instructions"
echo ""

# Ask if user wants to start servers now
read -p "🚀 Start servers now? (y/N): " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Starting servers..."
    node start.js
fi
