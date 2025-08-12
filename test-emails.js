// Test script untuk menambahkan sample emails ke database
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

// Ensure data directory exists
if (!fs.existsSync('./data')) {
    fs.mkdirSync('./data');
}

const db = new sqlite3.Database('./data/tempmail.db');

function addSampleEmails() {
    console.log('🧪 Adding sample emails for testing...\n');

    const sampleEmails = [
        {
            to: 'john@ttoko-home-ai.fun',
            from: 'welcome@github.com',
            subject: 'Welcome to GitHub!',
            text: 'Welcome to GitHub! Your account has been created successfully.',
            html: '<h1>Welcome to GitHub!</h1><p>Your account has been created successfully.</p>',
            type: 'normal'
        },
        {
            to: 'john@ttoko-home-ai.fun',
            from: 'noreply@google.com',
            subject: 'Google Account Verification',
            text: 'Your verification code is: 123456\n\nThis code will expire in 10 minutes.',
            html: '<div style="font-family: Arial;"><h2>Google Account Verification</h2><p>Your verification code is:</p><div style="font-size: 24px; font-weight: bold; color: #1a73e8; margin: 20px 0;">123456</div><p>This code will expire in 10 minutes.</p></div>',
            type: 'otp',
            otp: '123456'
        },
        {
            to: 'test@ttoko-home-ai.fun',
            from: 'security@facebook.com',
            subject: 'Facebook Login Code',
            text: 'Someone tried to log in to your Facebook account.\n\nLogin code: 789012\n\nIf this wasn\'t you, please secure your account.',
            html: '<div><h2>Facebook Security</h2><p>Someone tried to log in to your Facebook account.</p><div style="background: #f0f2f5; padding: 15px; margin: 15px 0; border-radius: 8px;"><div style="font-size: 28px; font-weight: bold; color: #1877f2;">789012</div></div><p>If this wasn\'t you, please secure your account.</p></div>',
            type: 'otp',
            otp: '789012'
        },
        {
            to: 'user@ttoko-home-ai.fun',
            from: 'noreply@amazon.com',
            subject: 'Your Amazon order has been shipped',
            text: 'Great news! Your Amazon order #123-4567890 has been shipped and is on its way to you.',
            html: '<div style="font-family: Arial;"><h2>Order Shipped!</h2><p>Great news! Your Amazon order <strong>#123-4567890</strong> has been shipped and is on its way to you.</p><p>Track your package: <a href="#">Click here</a></p></div>',
            type: 'normal'
        },
        {
            to: 'admin@ttoko-home-ai.fun',
            from: 'alerts@discord.com',
            subject: 'Discord Login Verification Required',
            text: 'We detected a new login to your Discord account.\n\nVerification code: 456789\n\nEnter this code to continue.',
            html: '<div style="background: #5865f2; color: white; padding: 20px;"><h1>Discord</h1></div><div style="padding: 20px;"><h2>Login Verification Required</h2><p>We detected a new login to your Discord account.</p><div style="background: #f3f4f6; padding: 20px; text-align: center; margin: 20px 0; border-radius: 8px;"><span style="font-size: 32px; font-weight: bold; color: #5865f2; letter-spacing: 8px;">456789</span></div><p>Enter this code to continue.</p></div>',
            type: 'otp',
            otp: '456789'
        }
    ];

    let completed = 0;
    const total = sampleEmails.length;

    sampleEmails.forEach((email, index) => {
        db.run(`
            INSERT INTO emails (
                to_address, from_address, subject, 
                text_content, html_content, email_type, otp_code,
                received_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', '-' || ? || ' minutes'))
        `, [
            email.to,
            email.from,
            email.subject,
            email.text,
            email.html,
            email.type,
            email.otp || null,
            index * 5  // Stagger the received times
        ], function(err) {
            if (err) {
                console.error(`❌ Error inserting email ${index + 1}:`, err.message);
            } else {
                console.log(`✅ Added: ${email.subject} (ID: ${this.lastID})`);
            }
            
            completed++;
            if (completed === total) {
                console.log(`\n🎉 Successfully added ${total} sample emails!`);
                console.log('\n📧 Test emails:');
                console.log('- john@ttoko-home-ai.fun (2 emails, 1 OTP)');
                console.log('- test@ttoko-home-ai.fun (1 OTP email)');
                console.log('- user@ttoko-home-ai.fun (1 regular email)');
                console.log('- admin@ttoko-home-ai.fun (1 OTP email)');
                console.log('\n🚀 Start your server and test these emails!');
                db.close();
            }
        });
    });
}

// Initialize database tables first
db.serialize(() => {
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
    )`, (err) => {
        if (err) {
            console.error('❌ Error creating table:', err.message);
            process.exit(1);
        } else {
            addSampleEmails();
        }
    });
});

module.exports = { addSampleEmails };
