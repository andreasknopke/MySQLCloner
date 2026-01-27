#!/bin/bash
cd /workspaces/MySQLCloner
echo "=== LOCAL COMMITS ===" 
git log --oneline -5
echo ""
echo "=== UNPUSHED COMMITS ==="
git log origin/main..HEAD --oneline
echo ""
echo "=== LOCAL HEAD ==="
git rev-parse HEAD | cut -c1-7
echo ""
echo "=== REMOTE HEAD ==="
git rev-parse origin/main | cut -c1-7
echo ""
echo "=== PUSHING NOW ==="
git push origin main 2>&1
echo ""
echo "=== DONE ==="
