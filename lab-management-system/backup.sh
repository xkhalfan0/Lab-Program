#!/bin/bash

# Smart Backup Script for Lab Management System
# Usage: ./backup.sh [optional-label]

# Navigate to script directory
cd "$(dirname "$0")"

# Configuration
BACKUP_BASE_DIR="/c/Users/Hp/Desktop/Lab-Program/backups"
LABEL="${1:-backup}"
TIMESTAMP=$(date +%Y-%m-%d-%H%M%S)
BACKUP_NAME="lab-${LABEL}-${TIMESTAMP}"
BACKUP_PATH="${BACKUP_BASE_DIR}/${BACKUP_NAME}"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo "════════════════════════════════════════════════════════"
echo "  ��� Smart Backup"
echo "════════════════════════════════════════════════════════"
echo ""

# Create backup directory
mkdir -p "$BACKUP_PATH"

# Copy source code
echo -e "${BLUE}��� Copying source code...${NC}"
cp -r client server drizzle "$BACKUP_PATH/" 2>/dev/null

# Copy configs
echo -e "${BLUE}⚙️  Copying configurations...${NC}"
cp package.json package-lock.json pnpm-lock.yaml tsconfig*.json vite.config.ts "$BACKUP_PATH/" 2>/dev/null

# Copy other important files
cp *.md *.js docker-compose.yml .env* .gitignore "$BACKUP_PATH/" 2>/dev/null

# Copy node_modules if exists
if [ -d "node_modules" ]; then
    echo -e "${BLUE}��� Copying node_modules...${NC}"
    cp -r node_modules "$BACKUP_PATH/" 2>/dev/null
    echo -e "${GREEN}   ✓ Included${NC}"
else
    echo -e "${YELLOW}   ⚠ node_modules not found${NC}"
fi

# Copy public if exists
[ -d "public" ] && cp -r public "$BACKUP_PATH/" 2>/dev/null

# Get size
BACKUP_SIZE=$(du -sh "$BACKUP_PATH" | cut -f1)

echo ""
echo "════════════════════════════════════════════════════════"
echo -e "${GREEN}✅ Backup Complete!${NC}"
echo "════════════════════════════════════════════════════════"
echo ""
echo "  ��� Name: $BACKUP_NAME"
echo "  ��� Path: $BACKUP_PATH"
echo "  ��� Size: $BACKUP_SIZE"
echo ""
echo "Recent backups:"
ls -t "$BACKUP_BASE_DIR" | head -5 | awk '{print "  • " $0}'
echo ""
