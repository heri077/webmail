#!/bin/bash

# RX TempMail Auto Deploy Script
# For VPS: srv949855.hstgr.cloud (145.79.13.13)
# Domain: ttoko-home-ai.fun

set -e  # Exit on any error

echo "🚀 RX TempMail Auto Deploy Script"
echo "=================================="
echo "VPS: srv949855.hstgr.cloud"
echo "IP: 145.79.13.13"
echo "Domain: ttoko-home-ai.fun"
echo ""

# Configuration
VPS_IP="145.79.13.13"
DOMAIN="ttoko-home-ai.fun"
GITHUB_REPO_URL=""  # User will be prompted
PROJECT_DIR="/var/www/rx-tempmail"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_root() {
    if [ "$EUID" -ne 0 ]; then
        log_error "This script must be run as root"
        log_info "Please run: sudo $0"
        exit 1
    fi
}

check_connection() {
    log_info "Checking internet connection..."
    if ! ping -c 1 google.com &> /dev/null; then
        log_error "No internet connection"
        exit 1
    fi
    log_success "Internet connection OK"
}

get_github_repo() {
    if [ -z "$GITHUB_REPO_URL" ]; then
        echo -n "Enter your GitHub repository URL (https://github.com/username/repo.git): "
        read GITHUB_REPO_URL
        
        if [ -z "$GITHUB_REPO_URL" ]; then
            log_error "GitHub repository URL is required"
            exit 1
        fi
    fi
}

update_system() {
    log_info "Updating system packages..."
    apt update -qq
    apt upgrade -y -qq
    log_success "System updated"
}

install_dependencies() {
    log_info "Installing system dependencies..."
    
    # Install essential packages
    apt install -y curl wget git nginx ufw htop nano certbot python3-certbot-nginx fail2ban sqlite3 netcat-openbsd
    
    # Install Node.js 18 LTS
    log_info "Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash - > /dev/null 2>&1
    apt-get install -y nodejs
    
    # Install PM2
    npm install -g pm2
    
    log_success "Dependencies installed"
    log_info "Node.js version: $(node --version)"
    log_info "NPM version: $(npm --version)"
}

setup_firewall() {
    log_info "Configuring firewall..."
    
    ufw --force reset > /dev/null 2>&1
    ufw default deny incoming
    ufw default allow outgoing
    ufw allow ssh
    ufw allow 80/tcp
    ufw allow 443/tcp
    ufw allow 25/tcp
    ufw allow 2525/tcp
    ufw --force enable
    
    log_success "Firewall configured"
}

clone_repository() {
    log_info "Cloning repository..."
    
    # Remove existing directory if it exists
    if [ -d "$PROJECT_DIR" ]; then
        log_warning "Removing existing project directory..."
        rm -rf "$PROJECT_DIR"
    fi
    
    # Create directory and clone
    mkdir -p /var/www
    cd /var/www
    git clone "$GITHUB_REPO_URL" rx-tempmail
    
    if [ ! -d "$PROJECT_DIR" ]; then
        log_error "Failed to clone repository"
        exit 1
    fi
    
    cd "$PROJECT_DIR"
    log_success "Repository cloned"
}

setup_application() {
    log_info "Setting up application..."
    
    cd "$PROJECT_DIR"
    
    # Install NPM packages
    npm install --production
    
    # Create production environment
    log_info "Creating environment configuration..."
    cat > .env << EOL
PORT=3000
SMTP_PORT=25
SESSION_SECRET=$(openssl rand -base64 32)
NODE_ENV=production
ALLOWED_DOMAINS=${DOMAIN},mail.${DOMAIN},www.${DOMAIN}
EOL

    # Set permissions
    chown -R www-data:www-data "$PROJECT_DIR"
    chmod 755 "$PROJECT_DIR"
    
    log_success "Application setup completed"
}

configure_nginx() {
    log_info "Configuring Nginx..."
    
    # Create Nginx configuration
    cat > /etc/nginx/sites-available/$DOMAIN << EOL
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    
    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json;
    
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_cache_bypass \$http_upgrade;
        
        proxy_connect_timeout 30s;
        proxy_send_timeout 30s;
        proxy_read_timeout 30s;
    }
    
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)\$ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host \$host;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    
    location ~ /\. {
        deny all;
    }
}
EOL

    # Enable site
    ln -sf /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/
    rm -f /etc/nginx/sites-enabled/default
    
    # Test configuration
    if ! nginx -t; then
        log_error "Nginx configuration test failed"
        exit 1
    fi
    
    # Start Nginx
    systemctl restart nginx
    systemctl enable nginx
    
    log_success "Nginx configured and started"
}

setup_ssl() {
    log_info "Setting up SSL certificate..."
    
    # Get SSL certificate
    echo -n "Enter your email for SSL certificate: "
    read SSL_EMAIL
    
    if [ -z "$SSL_EMAIL" ]; then
        log_warning "No email provided, skipping SSL setup"
        return
    fi
    
    certbot --nginx -d $DOMAIN -d www.$DOMAIN --email $SSL_EMAIL --agree-tos --non-interactive
    
    if [ $? -eq 0 ]; then
        log_success "SSL certificate installed"
        
        # Test auto-renewal
        certbot renew --dry-run
        log_success "SSL auto-renewal configured"
    else
        log_warning "SSL certificate installation failed, continuing without SSL"
    fi
}

start_application() {
    log_info "Starting application with PM2..."
    
    cd "$PROJECT_DIR"
    
    # Stop existing PM2 processes
    pm2 delete rx-tempmail 2>/dev/null || true
    
    # Start application
    pm2 start start.js --name "rx-tempmail"
    pm2 save
    
    # Setup PM2 startup
    pm2 startup systemd -u root --hp /root > /tmp/pm2_startup.sh
    bash /tmp/pm2_startup.sh
    
    log_success "Application started with PM2"
}

setup_monitoring() {
    log_info "Setting up monitoring..."
    
    # Create monitoring script
    cat > "$PROJECT_DIR/monitor.sh" << 'EOL'
#!/bin/bash
LOG_FILE="/var/log/rx-tempmail-monitor.log"
DATE=$(date '+%Y-%m-%d %H:%M:%S')

# Check if PM2 process is running
if ! pm2 describe rx-tempmail | grep -q "online"; then
    echo "[$DATE] ERROR: rx-tempmail is not running, restarting..." >> $LOG_FILE
    pm2 restart rx-tempmail
fi

# Check if website responds
if ! curl -f -s http://localhost:3000 > /dev/null; then
    echo "[$DATE] ERROR: Website not responding" >> $LOG_FILE
    pm2 restart rx-tempmail
fi

# Check SMTP port
if ! nc -z localhost 25; then
    echo "[$DATE] ERROR: SMTP server not responding" >> $LOG_FILE
    pm2 restart rx-tempmail
fi

echo "[$DATE] OK: All services running" >> $LOG_FILE
EOL

    chmod +x "$PROJECT_DIR/monitor.sh"
    
    # Add to crontab
    (crontab -l 2>/dev/null; echo "*/5 * * * * $PROJECT_DIR/monitor.sh") | crontab -
    
    # Setup backup script
    cat > "$PROJECT_DIR/backup.sh" << 'EOL'
#!/bin/bash
BACKUP_DIR="/var/backups/rx-tempmail"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR
cp /var/www/rx-tempmail/data/tempmail.db $BACKUP_DIR/tempmail_$DATE.db
find $BACKUP_DIR -name "tempmail_*.db" -mtime +7 -delete
echo "Backup completed: tempmail_$DATE.db"
EOL

    chmod +x "$PROJECT_DIR/backup.sh"
    
    # Add backup to crontab
    (crontab -l 2>/dev/null; echo "0 2 * * * $PROJECT_DIR/backup.sh") | crontab -
    
    log_success "Monitoring and backup configured"
}

setup_security() {
    log_info "Configuring security..."
    
    # Configure fail2ban
    cat > /etc/fail2ban/jail.local << 'EOL'
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 3

[sshd]
enabled = true

[nginx-http-auth]
enabled = true

[nginx-noscript]
enabled = true

[nginx-badbots]
enabled = true
EOL

    systemctl restart fail2ban
    systemctl enable fail2ban
    
    log_success "Security configured"
}

test_deployment() {
    log_info "Testing deployment..."
    
    # Wait for application to start
    sleep 10
    
    # Test local connection
    if curl -f -s http://localhost:3000 > /dev/null; then
        log_success "Local website test passed"
    else
        log_error "Local website test failed"
        return 1
    fi
    
    # Test SMTP server
    if nc -z localhost 25; then
        log_success "SMTP server test passed"
    else
        log_warning "SMTP server test failed (may need time to start)"
    fi
    
    # Test external connection
    if curl -f -s http://$DOMAIN > /dev/null; then
        log_success "External website test passed"
    else
        log_warning "External website test failed (DNS may need time to propagate)"
    fi
    
    log_success "Deployment tests completed"
}

print_summary() {
    echo ""
    echo "🎉 DEPLOYMENT COMPLETED SUCCESSFULLY!"
    echo "====================================="
    echo ""
    echo "📋 Deployment Summary:"
    echo "• Website: https://$DOMAIN"
    echo "• Dashboard: https://$DOMAIN/dashboard"
    echo "• Default Owner PIN: admin123 (CHANGE THIS!)"
    echo "• Project Directory: $PROJECT_DIR"
    echo "• Database: $PROJECT_DIR/data/tempmail.db"
    echo ""
    echo "🔧 Management Commands:"
    echo "• Check status: pm2 status"
    echo "• View logs: pm2 logs rx-tempmail"
    echo "• Restart app: pm2 restart rx-tempmail"
    echo "• Check health: cd $PROJECT_DIR && node health-check.js"
    echo ""
    echo "📧 Email Testing:"
    echo "• Generate OTP at: https://$DOMAIN"
    echo "• Test email: test@$DOMAIN"
    echo ""
    echo "🔒 Next Steps:"
    echo "1. Configure DNS records (A, MX) to point to $VPS_IP"
    echo "2. Change default owner PIN at https://$DOMAIN/dashboard"
    echo "3. Test OTP generation and email functionality"
    echo ""
    echo "📊 Monitoring:"
    echo "• Health checks run every 5 minutes"
    echo "• Database backup runs daily at 2 AM"
    echo "• Logs: /var/log/rx-tempmail-monitor.log"
    echo ""
}

# Main deployment process
main() {
    log_info "Starting RX TempMail deployment process..."
    
    check_root
    check_connection
    get_github_repo
    
    log_info "Deploying to $VPS_IP ($DOMAIN)..."
    
    update_system
    install_dependencies
    setup_firewall
    clone_repository
    setup_application
    configure_nginx
    setup_ssl
    start_application
    setup_monitoring
    setup_security
    test_deployment
    
    print_summary
    
    log_success "Deployment completed! 🚀"
}

# Run main function
main "$@"
