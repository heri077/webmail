const { SMTPServer } = require('smtp-server');
const { simpleParser } = require('mailparser');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

// Ensure data directory exists
if (!fs.existsSync('./data')) {
    fs.mkdirSync('./data');
}

// Initialize database
const db = new sqlite3.Database('./data/tempmail.db');

// SMTP Server Configuration
const server = new SMTPServer({
    // Disable authentication
    secure: false,
    authOptional: true,
    allowInsecureAuth: true,
    hideSTARTTLS: true,
    
    // Handle incoming connections
    onConnect(session, callback) {
        console.log(`📧 New SMTP connection from ${session.remoteAddress}`);
        return callback(); // Accept connection
    },

    // Handle authentication (we'll skip it)
    onAuth(auth, session, callback) {
        return callback(null, { user: 'anonymous' });
    },

    // Handle mail from
    onMailFrom(address, session, callback) {
        console.log(`📤 Mail from: ${address.address}`);
        return callback(); // Accept sender
    },

    // Handle recipients
    onRcptTo(address, session, callback) {
        console.log(`📥 Mail to: ${address.address}`);
        
        // Check if the domain matches your tempmail domain
        const allowedDomains = [
            'ttoko-home-ai.fun', 
            'tempmail.local',
            'test.com'
        ];
        
        const domain = address.address.split('@')[1];
        if (allowedDomains.includes(domain)) {
            return callback(); // Accept recipient
        } else {
            return callback(new Error(`Domain ${domain} not allowed`));
        }
    },

    // Handle the actual email data
    onData(stream, session, callback) {
        let emailData = '';
        
        stream.on('data', (chunk) => {
            emailData += chunk;
        });
        
        stream.on('end', async () => {
            try {
                // Parse the email
                const parsed = await simpleParser(emailData);
                
                console.log(`📨 Received email: ${parsed.subject}`);
                console.log(`From: ${parsed.from?.text}`);
                console.log(`To: ${parsed.to?.text}`);
                
                // Extract recipients
                const recipients = [];
                if (parsed.to) {
                    if (Array.isArray(parsed.to)) {
                        recipients.push(...parsed.to.map(addr => addr.address));
                    } else {
                        recipients.push(parsed.to.address);
                    }
                }
                
                // Detect OTP in email content
                const content = parsed.text || parsed.html || '';
                const otpMatch = content.match(/\b\d{4,8}\b/);
                const isOTP = /otp|verification|code|verify|confirm/i.test(parsed.subject + ' ' + content);
                
                // Save each recipient's email
                for (const recipient of recipients) {
                    const emailType = isOTP ? 'otp' : 'normal';
                    const otpCode = isOTP && otpMatch ? otpMatch[0] : null;
                    
                    db.run(`
                        INSERT INTO emails (
                            to_address, from_address, subject, 
                            text_content, html_content, email_type, otp_code
                        ) VALUES (?, ?, ?, ?, ?, ?, ?)
                    `, [
                        recipient,
                        parsed.from?.address || 'unknown@sender.com',
                        parsed.subject || '(No Subject)',
                        parsed.text || '',
                        parsed.html || '',
                        emailType,
                        otpCode
                    ], function(err) {
                        if (err) {
                            console.error('❌ Database error:', err);
                        } else {
                            console.log(`✅ Email saved to database (ID: ${this.lastID})`);
                            if (isOTP) {
                                console.log(`🔐 OTP detected: ${otpCode}`);
                            }
                        }
                    });
                }
                
                callback();
            } catch (error) {
                console.error('❌ Error parsing email:', error);
                callback(error);
            }
        });
    }
});

// Error handling
server.on('error', (err) => {
    console.error('❌ SMTP Server error:', err);
});

// Start SMTP server
const SMTP_PORT = process.env.SMTP_PORT || 2525;
server.listen(SMTP_PORT, () => {
    console.log(`📧 SMTP Server listening on port ${SMTP_PORT}`);
    console.log(`🔗 Configure your MX record to point to this server`);
    console.log(`📝 Accepted domains: ttoko-home-ai.fun, tempmail.local, test.com`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down SMTP server...');
    server.close(() => {
        db.close();
        process.exit(0);
    });
});
