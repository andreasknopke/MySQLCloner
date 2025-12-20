#!/bin/bash
# Railway Deployment Verification Script
# Run this before deploying to ensure everything is configured

set -e

echo "=========================================="
echo "Railway Deployment Verification"
echo "=========================================="
echo ""

# Check files
echo "✓ Checking configuration files..."
files=(
  "railway.json"
  "Dockerfile"
  "docker-compose.yml"
  "package.json"
  "RAILWAY_QUICK_START.md"
  "RAILWAY_DEPLOYMENT.md"
  "DEPLOYMENT_CHECKLIST.md"
  "SECURITY.md"
  ".gitignore"
  "server/package.json"
  "client/package.json"
  "client/public/index.html"
  "server/index.js"
  "client/src/App.js"
)

missing=0
for file in "${files[@]}"; do
  if [ -f "$file" ]; then
    echo "  ✓ $file"
  else
    echo "  ✗ MISSING: $file"
    missing=$((missing+1))
  fi
done

echo ""
if [ $missing -eq 0 ]; then
  echo "✅ All configuration files present!"
else
  echo "❌ $missing files are missing!"
  exit 1
fi

echo ""
echo "✓ Checking package.json dependencies..."

# Check if mysql2 is in server dependencies
if grep -q "mysql2" server/package.json; then
  echo "  ✓ mysql2 dependency found"
else
  echo "  ✗ mysql2 dependency missing"
  exit 1
fi

# Check if express is in server dependencies
if grep -q "express" server/package.json; then
  echo "  ✓ express dependency found"
else
  echo "  ✗ express dependency missing"
  exit 1
fi

echo ""
echo "✓ Checking server configuration..."

# Check if read-only mode is implemented
if grep -q "SET SESSION TRANSACTION READ ONLY" server/index.js; then
  echo "  ✓ Read-only mode enforced for source"
else
  echo "  ✗ Read-only mode not found in server code"
  exit 1
fi

# Check if static file serving is configured
if grep -q "express.static" server/index.js; then
  echo "  ✓ Static file serving configured"
else
  echo "  ✗ Static file serving not configured"
  exit 1
fi

echo ""
echo "✓ Checking client configuration..."

# Check if dynamic API URL is used
if grep -q "REACT_APP_API_URL\|process.env.NODE_ENV" client/src/App.js; then
  echo "  ✓ Dynamic API URL configuration found"
else
  echo "  ✗ Dynamic API URL not configured"
  exit 1
fi

echo ""
echo "=========================================="
echo "✅ ALL CHECKS PASSED!"
echo "=========================================="
echo ""
echo "Your app is ready for Railway deployment!"
echo ""
echo "Next steps:"
echo "  1. Commit and push to GitHub:"
echo "     git add ."
echo "     git commit -m 'Ready for Railway'"
echo "     git push origin main"
echo ""
echo "  2. Go to railway.app"
echo "  3. Create new project from GitHub"
echo "  4. Select MySQLCloner repository"
echo "  5. Watch it deploy!"
echo ""
echo "See RAILWAY_QUICK_START.md for details"
