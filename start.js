const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Starting RX TempMail System...\n');

// Start web server
const webServer = spawn('node', ['server.js'], {
    cwd: __dirname,
    stdio: 'inherit'
});

// Start SMTP server (optional)
const smtpServer = spawn('node', ['email-receiver.js'], {
    cwd: __dirname,
    stdio: 'inherit'
});

// Handle process termination
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down servers...');
    webServer.kill('SIGINT');
    smtpServer.kill('SIGINT');
    process.exit(0);
});

webServer.on('exit', (code) => {
    console.log(`❌ Web server exited with code ${code}`);
    if (code !== 0) {
        process.exit(1);
    }
});

smtpServer.on('exit', (code) => {
    console.log(`❌ SMTP server exited with code ${code}`);
    if (code !== 0) {
        process.exit(1);
    }
});

console.log('✅ Both servers started successfully!');
console.log('🌐 Web interface: http://localhost:3000');
console.log('📧 SMTP server: localhost:2525');
console.log('🔑 Default owner PIN: admin123');
console.log('\nPress Ctrl+C to stop all servers\n');
