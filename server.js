const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const crypto = require('crypto');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));
app.use(session({
    store: new SQLiteStore({
        db: 'sessions.db',
        dir: './data'
    }),
    secret: process.env.SESSION_SECRET || 'your-secret-key-change-this',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false, // Set to true if using HTTPS
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Ensure data directory exists
if (!fs.existsSync('./data')) {
    fs.mkdirSync('./data');
}

// Initialize SQLite database
const db = new sqlite3.Database('./data/tempmail.db');

// Create tables
db.serialize(() => {
    // Emails table
    db.run(`CREATE TABLE IF NOT EXISTS emails (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        to_address TEXT NOT NULL,
        from_address TEXT NOT NULL,
        subject TEXT,
        text_content TEXT,
        html_content TEXT,
        received_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        email_type TEXT DEFAULT 'normal',
        otp_code TEXT,
        has_pin BOOLEAN DEFAULT 0,
        pin_hash TEXT
    )`);

    // Settings table
    db.run(`CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Insert default settings
    db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES 
            ('site_title', 'RX TempMail - OTP Ready'),
            ('owner_pin', '$2b$10$defaulthash'),
            ('subscription_expires', '2030-12-31')`);
});

// Helper functions
function generateOTP(length = 6) {
    return Math.floor(Math.random() * Math.pow(10, length)).toString().padStart(length, '0');
}

function hashPin(pin) {
    return crypto.createHash('sha256').update(pin).digest('hex');
}

function checkSubscription() {
    return new Promise((resolve, reject) => {
        db.get("SELECT value FROM settings WHERE key = 'subscription_expires'", (err, row) => {
            if (err) {
                reject(err);
                return;
            }
            
            if (!row) {
                resolve(false);
                return;
            }

            const expiryDate = new Date(row.value);
            const now = new Date();
            resolve(now <= expiryDate);
        });
    });
}

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// API Routes
app.get('/api/settings/title', async (req, res) => {
    try {
        const isActive = await checkSubscription();
        if (!isActive) {
            return res.json({ expired: true });
        }

        db.get("SELECT value FROM settings WHERE key = 'site_title'", (err, row) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ error: 'Database error' });
            }
            
            res.json({ 
                title: row ? row.value : 'RX TempMail - OTP Ready' 
            });
        });
    } catch (error) {
        console.error('Subscription check error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/check-pin-required', async (req, res) => {
    try {
        const isActive = await checkSubscription();
        if (!isActive) {
            return res.json({ expired: true });
        }

        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }

        // Check if any email for this address has PIN protection
        db.get(
            "SELECT has_pin FROM emails WHERE to_address = ? AND has_pin = 1 LIMIT 1",
            [email],
            (err, row) => {
                if (err) {
                    console.error('Database error:', err);
                    return res.status(500).json({ error: 'Database error' });
                }
                
                res.json({ 
                    requiresPin: !!row 
                });
            }
        );
    } catch (error) {
        console.error('Subscription check error:', error);
        res.json({ expired: true });
    }
});

app.post('/api/verify-pin', async (req, res) => {
    try {
        const isActive = await checkSubscription();
        if (!isActive) {
            return res.json({ expired: true });
        }

        const { email, pin } = req.body;
        
        if (!email || !pin) {
            return res.status(400).json({ error: 'Email and PIN are required' });
        }

        const pinHash = hashPin(pin);
        
        db.get(
            "SELECT id FROM emails WHERE to_address = ? AND pin_hash = ? LIMIT 1",
            [email, pinHash],
            (err, row) => {
                if (err) {
                    console.error('Database error:', err);
                    return res.status(500).json({ error: 'Database error' });
                }
                
                if (!row) {
                    return res.status(403).json({ error: 'Invalid PIN' });
                }

                // Store verified email in session
                req.session.verifiedEmails = req.session.verifiedEmails || [];
                if (!req.session.verifiedEmails.includes(email)) {
                    req.session.verifiedEmails.push(email);
                }

                res.json({ success: true });
            }
        );
    } catch (error) {
        console.error('Subscription check error:', error);
        res.json({ expired: true });
    }
});

app.get('/api/session/status', (req, res) => {
    const { email } = req.query;
    
    if (!email) {
        return res.status(400).json({ error: 'Email is required' });
    }

    const isVerified = req.session.verifiedEmails && 
                      req.session.verifiedEmails.includes(email);
    
    res.json({ isVerified });
});

app.post('/api/emails', async (req, res) => {
    try {
        const isActive = await checkSubscription();
        if (!isActive) {
            return res.json({ expired: true });
        }

        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }

        // Check if PIN is required and not verified
        db.get(
            "SELECT has_pin FROM emails WHERE to_address = ? AND has_pin = 1 LIMIT 1",
            [email],
            (err, pinRow) => {
                if (err) {
                    console.error('Database error:', err);
                    return res.status(500).json({ error: 'Database error' });
                }
                
                const requiresPin = !!pinRow;
                const isVerified = req.session.verifiedEmails && 
                                  req.session.verifiedEmails.includes(email);

                if (requiresPin && !isVerified) {
                    return res.status(403).json({ 
                        error: 'PIN verification required',
                        requiresPin: true 
                    });
                }

                // Fetch emails
                db.all(
                    `SELECT id, to_address, from_address, subject, 
                            received_at, email_type, has_pin,
                            CASE WHEN html_content IS NOT NULL AND html_content != '' 
                                 THEN 1 ELSE 0 END as html_content
                     FROM emails 
                     WHERE to_address = ? 
                     ORDER BY 
                         CASE WHEN email_type = 'otp' THEN 0 ELSE 1 END,
                         received_at DESC`,
                    [email],
                    (err, rows) => {
                        if (err) {
                            console.error('Database error:', err);
                            return res.status(500).json({ error: 'Database error' });
                        }
                        
                        res.json(rows);
                    }
                );
            }
        );
    } catch (error) {
        console.error('Subscription check error:', error);
        res.json({ expired: true });
    }
});

app.get('/api/email/:id', (req, res) => {
    const { id } = req.params;
    
    db.get(
        `SELECT * FROM emails WHERE id = ?`,
        [id],
        (err, row) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ error: 'Database error' });
            }
            
            if (!row) {
                return res.status(404).json({ error: 'Email not found' });
            }

            res.json(row);
        }
    );
});

app.post('/api/generate-otp', async (req, res) => {
    try {
        const isActive = await checkSubscription();
        if (!isActive) {
            return res.json({ expired: true });
        }

        const { email, type = 'verification' } = req.body;
        
        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }

        const otpCode = generateOTP(6);
        const subjects = {
            verification: 'Email Verification Code',
            login: 'Login Verification Code',
            password_reset: 'Password Reset Code'
        };

        const subject = subjects[type] || 'Verification Code';
        
        const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                         color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
                .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
                .otp-code { font-size: 36px; font-weight: bold; text-align: center; 
                           background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                           -webkit-background-clip: text; -webkit-text-fill-color: transparent;
                           background-clip: text; padding: 20px; letter-spacing: 8px; }
                .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🔐 Verification Code</h1>
                </div>
                <div class="content">
                    <h2>Your verification code is:</h2>
                    <div class="otp-code">${otpCode}</div>
                    <p>This code will expire in 10 minutes. Do not share this code with anyone.</p>
                    <p>If you didn't request this code, please ignore this email.</p>
                </div>
                <div class="footer">
                    <p>This is an automated message from RX TempMail System</p>
                </div>
            </div>
        </body>
        </html>`;

        const textContent = `
Verification Code: ${otpCode}

This code will expire in 10 minutes.
Do not share this code with anyone.

If you didn't request this code, please ignore this email.
        `;

        db.run(
            `INSERT INTO emails (to_address, from_address, subject, text_content, html_content, email_type, otp_code)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [email, 'noreply@tempmail-system.com', subject, textContent, htmlContent, 'otp', otpCode],
            function(err) {
                if (err) {
                    console.error('Database error:', err);
                    return res.status(500).json({ error: 'Failed to generate OTP email' });
                }

                console.log(`OTP email generated for ${email}: ${otpCode}`);
                res.json({ 
                    success: true, 
                    otp: otpCode,
                    emailId: this.lastID
                });
            }
        );
    } catch (error) {
        console.error('Subscription check error:', error);
        res.json({ expired: true });
    }
});

// Owner login routes
app.post('/owner/login', (req, res) => {
    const { pin } = req.body;
    
    if (!pin) {
        return res.status(400).json({ error: 'PIN is required' });
    }

    db.get("SELECT value FROM settings WHERE key = 'owner_pin'", (err, row) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        
        const storedPin = row ? row.value : 'admin123';
        
        if (pin === storedPin) {
            req.session.isOwner = true;
            res.json({ success: true });
        } else {
            res.status(401).json({ error: 'Invalid PIN' });
        }
    });
});

app.get('/dashboard', (req, res) => {
    if (!req.session.isOwner) {
        return res.redirect('/');
    }
    
    // Serve dashboard HTML
    res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>Dashboard - RX TempMail</title>
        <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
    </head>
    <body class="bg-gray-900 text-white">
        <div class="container mx-auto px-4 py-8">
            <h1 class="text-3xl font-bold mb-8">Owner Dashboard</h1>
            
            <div class="grid md:grid-cols-2 gap-6">
                <div class="bg-gray-800 p-6 rounded-lg">
                    <h2 class="text-xl font-semibold mb-4">Email Statistics</h2>
                    <div id="stats">Loading...</div>
                </div>
                
                <div class="bg-gray-800 p-6 rounded-lg">
                    <h2 class="text-xl font-semibold mb-4">Recent Emails</h2>
                    <div id="recent-emails">Loading...</div>
                </div>
            </div>
            
            <div class="mt-8">
                <a href="/" class="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded">Back to Main</a>
                <button onclick="logout()" class="bg-red-600 hover:bg-red-700 px-4 py-2 rounded ml-4">Logout</button>
            </div>
        </div>
        
        <script>
            async function loadStats() {
                try {
                    const response = await fetch('/api/admin/stats');
                    const data = await response.json();
                    document.getElementById('stats').innerHTML = \`
                        <p>Total Emails: \${data.total}</p>
                        <p>OTP Emails: \${data.otp}</p>
                        <p>Today: \${data.today}</p>
                    \`;
                } catch (error) {
                    document.getElementById('stats').innerHTML = 'Error loading stats';
                }
            }
            
            async function loadRecentEmails() {
                try {
                    const response = await fetch('/api/admin/recent');
                    const data = await response.json();
                    const html = data.map(email => \`
                        <div class="border-b border-gray-600 py-2">
                            <p class="text-sm">\${email.to_address}</p>
                            <p class="text-xs text-gray-400">\${email.subject} - \${new Date(email.received_at).toLocaleString()}</p>
                        </div>
                    \`).join('');
                    document.getElementById('recent-emails').innerHTML = html || 'No recent emails';
                } catch (error) {
                    document.getElementById('recent-emails').innerHTML = 'Error loading emails';
                }
            }
            
            function logout() {
                fetch('/owner/logout', { method: 'POST' })
                    .then(() => window.location.href = '/');
            }
            
            loadStats();
            loadRecentEmails();
        </script>
    </body>
    </html>
    `);
});

app.post('/owner/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// Admin API routes
app.get('/api/admin/stats', (req, res) => {
    if (!req.session.isOwner) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    db.all(`
        SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN email_type = 'otp' THEN 1 ELSE 0 END) as otp,
            SUM(CASE WHEN DATE(received_at) = DATE('now') THEN 1 ELSE 0 END) as today
        FROM emails
    `, (err, rows) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        
        res.json(rows[0]);
    });
});

app.get('/api/admin/recent', (req, res) => {
    if (!req.session.isOwner) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    db.all(`
        SELECT to_address, subject, received_at, email_type 
        FROM emails 
        ORDER BY received_at DESC 
        LIMIT 10
    `, (err, rows) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        
        res.json(rows);
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 TempMail server running on http://localhost:${PORT}`);
    console.log(`📧 OTP system ready!`);
    console.log(`🔑 Default owner PIN: admin123`);
});

module.exports = app;
