# Railway Quick Deploy - 5 Minutes

## The Absolute Fastest Way to Deploy

### Step 1: Push to GitHub
```bash
git add .
git commit -m "Ready for Railway deployment"
git push origin main
```

### Step 2: Go to Railway
- Visit https://railway.app
- Click **"New Project"**
- Select **"Deploy from GitHub repo"**

### Step 3: Select Repository
- Search for "MySQLCloner"
- Click on your repository
- Click **"Deploy Now"**

### Step 4: Wait for Build
- Railway automatically builds the Docker image
- Watch the build logs in real-time
- Takes about 2-3 minutes

### Step 5: Access Your App
- Click **"View"** or find the URL in the dashboard
- Your app is live! 🎉

---

## Environment Setup (Optional)

After deployment, add these in Railway dashboard:

**Variables tab → Add:**
```
NODE_ENV=production
PORT=5000
```

---

## Getting Your App URL

Railway generates a public URL like:
```
https://mysqlcloner-production-abc123.railway.app
```

Share this with users to access the app!

---

## Access Database Credentials

For connecting to your source/target databases:
1. Keep strong passwords
2. Use dedicated MySQL users
3. Source user: read-only permissions only
4. Target user: write permissions only

---

## View Logs & Monitor

In Railway dashboard:
- **Logs** tab: Real-time application logs
- **Metrics** tab: CPU, Memory, Network usage
- **Deployments** tab: Deployment history

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Build fails | Check logs, ensure Docker is valid |
| Can't connect to DB | Verify DB is public, check firewall |
| App crashes | Check logs, verify environment variables |
| API 404 errors | Clear browser cache, check API URL |

---

## Cost

- **Free tier**: $5/month credit (most hobby projects stay free)
- **Pro**: Pay-as-you-go starting at $7/month
- No upfront costs, cancel anytime

---

## Auto-Deploy from GitHub

Every time you push to `main` branch:
1. GitHub notifies Railway
2. Railway builds new Docker image
3. Old version keeps running
4. New version goes live when ready
5. Zero downtime deployments!

---

## Need Help?

- Railway Docs: https://docs.railway.app
- See RAILWAY_DEPLOYMENT.md for detailed guide
- Check project logs for error messages

---

## That's It!

Your MySQL Cloner is now live on Railway. 🚀

Connect using your source/target database credentials.
Monitor cloning operations in real-time.
