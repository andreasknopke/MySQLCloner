# Railway Deployment Guide

A complete step-by-step guide to deploy MySQL Cloner on Railway.

## What is Railway?

Railway is a modern infrastructure platform that makes it easy to deploy applications. It handles infrastructure, scaling, and monitoring automatically.

**Benefits:**
- Easy GitHub integration
- Automatic deployments on push
- Built-in monitoring and logs
- Simple environment variable management
- Free tier available (limited resources)
- Supports Docker-based deployments

## Prerequisites

- GitHub account with this repository
- Railway account (sign up at [railway.app](https://railway.app))
- The MySQL Cloner repository pushed to GitHub

## Step-by-Step Deployment

### Step 1: Sign Up for Railway

1. Go to [railway.app](https://railway.app)
2. Click "Sign up"
3. Choose GitHub authentication (easiest option)
4. Authorize Railway to access your GitHub account

### Step 2: Create a New Project

1. Click **"New Project"** in your Railway dashboard
2. Select **"Deploy from GitHub repo"**
3. Search for `MySQLCloner` repository
4. Click to select it
5. Railway will automatically detect it's a Node.js project with Docker

### Step 3: Configure Environment

After the initial setup, Railway will build and deploy. Now configure environment variables:

1. Go to your Railway project dashboard
2. Click the **Variables** tab
3. Add the following environment variables:

```
NODE_ENV=production
PORT=5000
```

**Optional variables:**
```
REACT_APP_API_URL=/api
```

(The app automatically uses `/api` for production if not set)

### Step 4: Review Railway Configuration

Railway automatically detects the Dockerfile. The app is configured to:

- **Port**: 5000 (automatically exposed by Railway)
- **Build**: Multi-stage Docker build (optimized for size)
- **Start Command**: `node server/index.js`

### Step 5: Deploy

Option A: **Automatic Deployment (Recommended)**
- Every push to `main` branch automatically triggers deployment
- Railway shows build and deployment logs in real-time
- Rollback to previous versions if needed

Option B: **Manual Deployment**
1. Click **Redeploy** button in Railway dashboard
2. Select the latest commit
3. Watch the build logs in real-time

### Step 6: Access Your App

Once deployed:

1. Railway assigns a public URL (e.g., `https://mysqlcloner-production.up.railway.app`)
2. Click **"Visit"** in the Railway dashboard
3. Your app loads with the full UI
4. Use your source and target database credentials

## Environment Variables Reference

| Variable | Value | Required | Notes |
|----------|-------|----------|-------|
| `NODE_ENV` | `production` | Yes | Enables React build serving |
| `PORT` | `5000` | No | Railway defaults to 5000 |
| `REACT_APP_API_URL` | `/api` | No | Uses relative URL in production |

## Accessing Logs

Real-time monitoring and debugging:

1. Go to your Railway project
2. Click **"Logs"** tab
3. Select the service
4. View real-time logs as users interact with the app
5. Useful for debugging connection issues

## Network Access

⚠️ **Important for Database Access**

Your source and target MySQL databases must be:
- **Publicly accessible** on their respective hosts, OR
- **Connected via VPN/SSH tunnel**

**Never expose databases directly to the internet without authentication!**

### Recommended Setup for Remote Databases:

Option 1: **SSH Tunnel via Railway**
```bash
# Local setup creates SSH tunnel through Railway
ssh -L 3306:source-db.local:3306 bastion@your-server.com
```

Option 2: **Database with Firewall Rules**
- Configure MySQL user with strong passwords
- Use firewall to restrict access to Railway IP
- Get Railway's IP from dashboard

Option 3: **VPN Connection**
- Use VPN service to connect Railway to your network
- All database traffic encrypted
- Most secure option

## Monitoring & Troubleshooting

### Check App Status
```
Railway Dashboard → Project → Status Tab
```

### View Build Logs
```
Railway Dashboard → Project → Deployments → View Build
```

### View Runtime Logs
```
Railway Dashboard → Project → Logs
```

### Common Issues

**Issue: Build Fails**
- Check logs for errors
- Ensure Docker can build in your environment
- Verify all dependencies are in package.json files

**Issue: Connection Timeout**
- Verify database is publicly accessible from Railway
- Check firewall allows Railway's IP
- Verify credentials are correct
- Test locally first before deploying

**Issue: App Crashes After Deploy**
- Check logs for error messages
- Verify environment variables are set correctly
- Ensure source/target databases are accessible

**Issue: API Returns 404**
- Verify API URL is correct (`/api` for production)
- Check server logs for errors
- Clear browser cache and retry

## Scaling on Railway

### For Hobby/Free Tier:
- Limited to 10GB storage
- 1 service instance
- Good for testing and small workloads

### For Pro Plan:
- Unlimited storage
- Multiple replicas
- Custom domains
- Advanced monitoring

To upgrade:
1. Go to Railway account settings
2. Switch to Pro plan
3. Services automatically scale up

## Custom Domain

To use your own domain (Railway Pro only):

1. Go to **Project Settings**
2. Click **Domains**
3. Add your custom domain
4. Update DNS records to point to Railway
5. SSL certificate auto-generated by Railway

Example:
```
mysqlcloner.example.com → railway.app URL
```

## Cost Estimation

**Free Tier:**
- $5 monthly credit
- Small projects run free
- Perfect for testing

**Pro Plan:**
- Pay-as-you-go
- Typical production app: $5-20/month
- Scales automatically

See [railway.app/pricing](https://railway.app/pricing) for details.

## Automatic Deployments

Railway watches your GitHub repository:

1. **On Every Push:**
   - GitHub webhook triggers Railway
   - New build starts automatically
   - Old version stays running during build
   - New version goes live when ready (zero downtime)

2. **Enable/Disable Auto-Deploy:**
   - Railway Dashboard → Deployments → Settings
   - Toggle "Auto-deploy on push"

3. **Manual Deployment:**
   - If auto-deploy disabled
   - Click "Redeploy" to manually trigger

## Security Best Practices

✅ **Do's:**
- Use strong database passwords
- Keep source credentials private
- Monitor Railway logs for suspicious activity
- Use dedicated database accounts (read-only for source)
- Enable database firewall rules

❌ **Don'ts:**
- Don't commit credentials to GitHub
- Don't use weak passwords
- Don't expose databases without authentication
- Don't share database credentials via email

## Health Checks

Railway automatically monitors:
- Application is running
- No memory leaks
- Restart policy active

To view health:
1. Railway Dashboard → Project → Health
2. Check CPU, Memory, Network usage
3. View restart events

## Rollback to Previous Version

If something breaks:

1. Railway Dashboard → Deployments
2. Find previous working deployment
3. Click the three-dot menu
4. Select "Redeploy"
5. Confirm rollback
6. App reverts to previous version

## Next Steps

After successful deployment:

1. **Test Everything:**
   - Connect to source database
   - Clone to target database
   - Verify data integrity

2. **Monitor Performance:**
   - Check Railway logs regularly
   - Monitor database connection issues
   - Track clone operation duration

3. **Optimize:**
   - Add database indexes if needed
   - Consider Railway Pro for better resources
   - Set up alerts for failures

4. **Backup Strategy:**
   - Always backup target before cloning
   - Test restore procedures
   - Keep audit logs of clone operations

## Support & Resources

- **Railway Docs:** https://docs.railway.app
- **GitHub:** https://github.com/andreasknopke/MySQLCloner
- **Issue Tracker:** GitHub Issues for bug reports

## Summary

You now have a production-ready MySQL Cloner deployed on Railway! The app:
- ✅ Automatically builds on code changes
- ✅ Serves the React UI from the same server
- ✅ Protects source database from modification
- ✅ Provides real-time monitoring
- ✅ Scales automatically
- ✅ Free tier available for testing
