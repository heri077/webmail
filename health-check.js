#!/usr/bin/env node

const http = require('http');
const net = require('net');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

console.log('🏥 RX TempMail Health Check');
console.log('===========================\n');

const checks = [];

// Check 1: Web Server
function checkWebServer() {
    return new Promise((resolve) => {
        const req = http.request({
            hostname: 'localhost',
            port: 3000,
            path: '/',
            method: 'GET',
            timeout: 5000
        }, (res) => {
            resolve({
                name: '🌐 Web Server (Port 3000)',
                status: res.statusCode === 200 ? 'HEALTHY' : 'UNHEALTHY',
                details: `HTTP ${res.statusCode}`,
                icon: res.statusCode === 200 ? '✅' : '❌'
            });
        });

        req.on('error', (err) => {
            resolve({
                name: '🌐 Web Server (Port 3000)',
                status: 'DOWN',
                details: err.message,
                icon: '❌'
            });
        });

        req.on('timeout', () => {
            resolve({
                name: '🌐 Web Server (Port 3000)',
                status: 'TIMEOUT',
                details: 'Request timeout after 5s',
                icon: '⏰'
            });
        });

        req.end();
    });
}

// Check 2: SMTP Server
function checkSMTPServer() {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(5000);

        socket.connect(2525, 'localhost', () => {
            resolve({
                name: '📧 SMTP Server (Port 2525)',
                status: 'HEALTHY',
                details: 'Connection successful',
                icon: '✅'
            });
            socket.destroy();
        });

        socket.on('error', (err) => {
            resolve({
                name: '📧 SMTP Server (Port 2525)',
                status: 'DOWN',
                details: err.message,
                icon: '❌'
            });
        });

        socket.on('timeout', () => {
            resolve({
                name: '📧 SMTP Server (Port 2525)',
                status: 'TIMEOUT',
                details: 'Connection timeout',
                icon: '⏰'
            });
            socket.destroy();
        });
    });
}

// Check 3: Database
function checkDatabase() {
    return new Promise((resolve) => {
        if (!fs.existsSync('./data/tempmail.db')) {
            return resolve({
                name: '🗄️  Database',
                status: 'MISSING',
                details: 'Database file not found',
                icon: '❌'
            });
        }

        const db = new sqlite3.Database('./data/tempmail.db');
        
        db.get("SELECT COUNT(*) as count FROM emails", (err, row) => {
            if (err) {
                resolve({
                    name: '🗄️  Database',
                    status: 'ERROR',
                    details: err.message,
                    icon: '❌'
                });
            } else {
                resolve({
                    name: '🗄️  Database',
                    status: 'HEALTHY',
                    details: `${row.count} emails stored`,
                    icon: '✅'
                });
            }
            db.close();
        });
    });
}

// Check 4: File System
function checkFileSystem() {
    return new Promise((resolve) => {
        const requiredFiles = ['server.js', 'email-receiver.js', 'package.json'];
        const missingFiles = requiredFiles.filter(file => !fs.existsSync(file));
        
        if (missingFiles.length > 0) {
            resolve({
                name: '📁 File System',
                status: 'INCOMPLETE',
                details: `Missing: ${missingFiles.join(', ')}`,
                icon: '⚠️'
            });
        } else {
            // Check data directory permissions
            try {
                if (!fs.existsSync('./data')) {
                    fs.mkdirSync('./data');
                }
                fs.accessSync('./data', fs.constants.W_OK);
                
                resolve({
                    name: '📁 File System',
                    status: 'HEALTHY',
                    details: 'All files present, data dir writable',
                    icon: '✅'
                });
            } catch (err) {
                resolve({
                    name: '📁 File System',
                    status: 'PERMISSION ERROR',
                    details: 'Data directory not writable',
                    icon: '❌'
                });
            }
        }
    });
}

// Check 5: Dependencies
function checkDependencies() {
    return new Promise((resolve) => {
        try {
            const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
            const dependencies = Object.keys(packageJson.dependencies || {});
            
            const missingDeps = dependencies.filter(dep => {
                try {
                    require.resolve(dep);
                    return false;
                } catch (err) {
                    return true;
                }
            });
            
            if (missingDeps.length > 0) {
                resolve({
                    name: '📦 Dependencies',
                    status: 'MISSING',
                    details: `Missing: ${missingDeps.join(', ')}`,
                    icon: '❌'
                });
            } else {
                resolve({
                    name: '📦 Dependencies',
                    status: 'HEALTHY',
                    details: `${dependencies.length} packages installed`,
                    icon: '✅'
                });
            }
        } catch (err) {
            resolve({
                name: '📦 Dependencies',
                status: 'ERROR',
                details: 'Cannot read package.json',
                icon: '❌'
            });
        }
    });
}

// Run all checks
async function runHealthCheck() {
    const startTime = Date.now();
    
    console.log('Running health checks...\n');
    
    const results = await Promise.all([
        checkWebServer(),
        checkSMTPServer(),
        checkDatabase(),
        checkFileSystem(),
        checkDependencies()
    ]);
    
    // Display results
    console.log('📊 HEALTH CHECK RESULTS');
    console.log('========================\n');
    
    let healthyCount = 0;
    let totalCount = results.length;
    
    results.forEach(result => {
        console.log(`${result.icon} ${result.name}`);
        console.log(`   Status: ${result.status}`);
        console.log(`   Details: ${result.details}\n`);
        
        if (result.status === 'HEALTHY') {
            healthyCount++;
        }
    });
    
    const healthPercentage = Math.round((healthyCount / totalCount) * 100);
    const duration = Date.now() - startTime;
    
    console.log('📋 SUMMARY');
    console.log('===========');
    console.log(`Overall Health: ${healthPercentage}% (${healthyCount}/${totalCount} checks passed)`);
    console.log(`Check Duration: ${duration}ms`);
    console.log(`Timestamp: ${new Date().toISOString()}\n`);
    
    // Health status
    if (healthPercentage === 100) {
        console.log('🎉 System is fully operational!');
        process.exit(0);
    } else if (healthPercentage >= 80) {
        console.log('⚠️  System is mostly operational with some issues.');
        process.exit(0);
    } else {
        console.log('❌ System has significant issues and may not function properly.');
        process.exit(1);
    }
}

// Handle command line arguments
if (process.argv.includes('--json')) {
    // JSON output for monitoring systems
    runHealthCheck().then(() => {}).catch(() => {});
} else {
    // Human readable output
    runHealthCheck();
}
