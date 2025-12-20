# Pre-Deployment Checklist

Use this checklist before deploying to Railway to ensure everything is configured correctly.

## Code Preparation

- [ ] All changes committed to git
- [ ] Code pushed to GitHub repository
- [ ] `.gitignore` properly configured
- [ ] No sensitive credentials in code
- [ ] `package.json` has all dependencies listed
- [ ] Dockerfile builds successfully locally: `docker build .`
- [ ] React build works: `npm run build` in client folder

## Configuration Files

- [ ] `railway.json` exists in root
- [ ] `Dockerfile` is present and up-to-date
- [ ] `docker-compose.yml` exists for local testing
- [ ] `.env.railway.example` documents all required variables

## Code Quality

- [ ] No hardcoded API URLs (uses dynamic URL)
- [ ] No hardcoded database credentials
- [ ] CORS properly configured for production
- [ ] Static React build served by Express in production
- [ ] Error handling implemented for all API endpoints
- [ ] Logs are informative for debugging

## Database Configuration

- [ ] Source database credentials working
- [ ] Target database credentials working
- [ ] Source user has SELECT, SHOW VIEW, LOCK TABLES privileges
- [ ] Target user has CREATE, INSERT, UPDATE, DELETE privileges
- [ ] Source database publicly accessible OR connected via VPN
- [ ] Target database publicly accessible OR connected via VPN
- [ ] Strong passwords configured for both users
- [ ] Firewall rules allow Railway access to databases

## Documentation

- [ ] README.md updated with deployment info
- [ ] RAILWAY_DEPLOYMENT.md created and complete
- [ ] RAILWAY_QUICK_START.md available for quick reference
- [ ] SECURITY.md documents protection mechanisms
- [ ] Comments in code explain complex logic

## Pre-Deployment Testing

- [ ] Local development works: `npm run dev`
- [ ] Docker build succeeds: `docker build .`
- [ ] Docker compose works: `docker-compose up --build`
- [ ] All API endpoints tested locally
- [ ] Source database stays untouched (read-only enforced)
- [ ] Clone operation completes successfully
- [ ] Progress logs display correctly
- [ ] Error handling works (test with bad credentials)

## Railway Account Setup

- [ ] Railway account created
- [ ] GitHub connected to Railway
- [ ] Repository is public OR Railway has access to private repo
- [ ] No Railway projects exist yet (or you know which project to use)

## Deployment Steps

- [ ] Log in to Railway dashboard
- [ ] Create "New Project"
- [ ] Select "Deploy from GitHub repo"
- [ ] Select MySQLCloner repository
- [ ] Wait for build to complete (2-3 minutes)
- [ ] Verify no build errors in logs
- [ ] Check deployment logs for runtime errors
- [ ] Visit the generated URL to access the app

## Post-Deployment Testing

- [ ] App loads at Railway URL
- [ ] UI displays correctly
- [ ] Can test source connection
- [ ] Source database listing works
- [ ] Can test target connection
- [ ] Clone operation succeeds
- [ ] Source database remains unchanged
- [ ] Target database receives data correctly
- [ ] Progress logs update in real-time

## Monitoring Setup

- [ ] Check Railway logs regularly for errors
- [ ] Monitor deployment history
- [ ] Review metrics (CPU, memory, network)
- [ ] Set up alerts if available on your plan

## Production Ready

- [ ] All checklist items completed
- [ ] Tested clone with real databases
- [ ] Verified data integrity in target
- [ ] Documented custom domain (if applicable)
- [ ] Created backup of target database
- [ ] Shared Railway URL with team
- [ ] Monitored first 24 hours for issues

## Troubleshooting Items (if needed)

- [ ] Checked build logs for Docker errors
- [ ] Verified environment variables set correctly
- [ ] Confirmed database accessibility from Railway
- [ ] Tested API endpoints individually
- [ ] Checked browser console for JavaScript errors
- [ ] Cleared browser cache
- [ ] Reviewed Railway application logs

## Rollback Plan

- [ ] Know how to view previous deployments
- [ ] Understand how to redeploy previous version
- [ ] Have database backups available
- [ ] Documented rollback procedure

---

**Status**: Ready to deploy? Check all boxes above! ✅

**Questions?** See RAILWAY_DEPLOYMENT.md for detailed instructions.
