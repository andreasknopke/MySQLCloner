# MySQL Cloner

A sleek, modern web application for cloning MySQL databases across networks.

## Features

✨ **Modern Web Interface**
- Clean, responsive UI built with React
- Real-time progress monitoring
- Live connection status indicators
- Structure-only clone option

🔌 **Connection Management**
- Test connections before cloning
- Support for remote databases
- Automatic database listing

🚀 **Database Cloning**
- Clone entire databases with a single click
- Includes tables, triggers, routines, and views
- Real-time progress logs
- Supports public network transfers

🛡️ **Security Features**
- Direct MySQL protocol (no PHP required)
- Credentials not stored
- Works across firewalls

## Prerequisites

- Node.js 18+ (for development)
- Docker & Docker Compose (for deployment)
- MySQL client tools (mysqldump, mysql)
- Source and target MySQL databases with credentials

## Quick Start

### Deploy on Railway (Easiest - 2 minutes)

```bash
# 1. Push repository to GitHub
# 2. Go to railway.app and sign up
# 3. Click "New Project" → "Deploy from GitHub"
# 4. Select MySQLCloner repository
# 5. Done! Your app is live

# See RAILWAY_DEPLOYMENT.md for detailed instructions
```

### Using Docker Compose

```bash
# Clone the repository
git clone https://github.com/andreasknopke/MySQLCloner.git
cd MySQLCloner

# Build and start the application
docker-compose up --build

# Access the app at http://localhost:3000
```

### Production Deployment

For production deployments, see these guides:
- **Railway** (Recommended): [RAILWAY_DEPLOYMENT.md](RAILWAY_DEPLOYMENT.md)
- **Docker**: Use provided Dockerfile and docker-compose.yml
- **Manual**: Follow Development Setup below

### Development Setup

```bash
# Install server dependencies
cd server
npm install
npm run dev

# In another terminal, install client dependencies
cd client
npm install
npm start

# The app will open at http://localhost:3000
```

## Usage

1. **Source Database**
   - Enter source database credentials
   - Click "Test Connection"
   - Select the database to clone

2. **Target Database**
   - Enter target database credentials
   - Click "Test Connection"
   - Enter the target database name (or select existing)

3. **Clone**
   - Click "Clone Database"
   - Monitor progress in the logs
   - Wait for completion confirmation

## How It Works

The application uses:
- **Frontend**: React with axios for HTTP requests
- **Backend**: Node.js/Express with mysql2 for database connections
- **Cloning**: mysqldump for exporting, mysql CLI for importing

The clone process:
1. Connects to source database
2. Creates SQL dump with tables, triggers, routines
3. Creates target database if needed
4. Restores dump to target database
5. Cleans up temporary files

## API Endpoints

- `POST /api/test-connection` - Test database connection
- `POST /api/get-databases` - Get list of databases
- `POST /api/clone-database` - Start database cloning process

## Requirements

### For Development
- Node.js 18+
- npm

### For Docker
- Docker 20+
- Docker Compose 2.0+

### For Operation
- Network access to source and target databases
- MySQL credentials with appropriate permissions
- Source user needs: SELECT, LOCK TABLES, SHOW VIEW permissions
- Target user needs: CREATE, INSERT, UPDATE, DELETE permissions

## Environment Variables

Create a `.env` file in the server directory:

```
PORT=5000
NODE_ENV=development
```

## Troubleshooting

**Connection Failed**
- Verify credentials and network connectivity
- Check firewall rules allow database access
- Ensure MySQL service is running

**Clone Fails**
- Check user permissions on source database
- Ensure target user can create databases
- Verify sufficient disk space on target server
- Check network stability for large databases

**UI Not Loading**
- Ensure React development server is running
- Check browser console for errors
- Verify API server is accessible

## License

MIT

## Support

For issues and feature requests, please open a GitHub issue.
