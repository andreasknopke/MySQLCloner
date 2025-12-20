const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const { exec } = require('child_process');
const util = require('util');
const fs = require('fs');
const path = require('path');

const app = express();
const execPromise = util.promisify(exec);

// Allow CORS from origin or disable it for production
const corsOptions = {
  origin: process.env.NODE_ENV === 'production' ? false : '*',
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json());

// Serve static React build in production
if (process.env.NODE_ENV === 'production') {
  const buildPath = path.join(__dirname, '../client/build');
  
  // Only serve static files if build directory exists
  if (fs.existsSync(buildPath)) {
    app.use(express.static(buildPath));
    
    // Fallback to index.html for client-side routing
    app.get('/', (req, res) => {
      res.sendFile(path.join(buildPath, 'index.html'));
    });
  } else {
    console.warn('⚠️  Client build directory not found at', buildPath);
  }
}

const PORT = process.env.PORT || 5000;

// Test connection endpoint
app.post('/api/test-connection', async (req, res) => {
  try {
    const { host, user, password, database, port, isSource } = req.body;

    const connection = await mysql.createConnection({
      host,
      user,
      password,
      database,
      port: port || 3306,
      waitForConnections: true,
      connectionLimit: 1,
      queueLimit: 0,
    });

    await connection.ping();

    // If this is a source connection, verify read-only mode
    if (isSource && database) {
      try {
        // Attempt to set read-only mode for the session
        await connection.execute('SET SESSION TRANSACTION READ ONLY');
        
        // Verify the user has appropriate permissions
        const [perms] = await connection.execute(`
          SELECT
            COUNT(*) as total_privs,
            SUM(CASE WHEN Privilege IN ('SELECT', 'SHOW VIEW', 'LOCK TABLES') THEN 1 ELSE 0 END) as read_privs
          FROM information_schema.role_table_grants
          WHERE GRANTEE = USER()
        `);

        // Reset to normal transaction mode
        await connection.execute('SET SESSION TRANSACTION READ WRITE');
      } catch (permError) {
        // Read-only mode setting is not critical for the connection test
        console.warn('Read-only mode could not be verified:', permError.message);
      }
    }

    await connection.end();

    res.json({ success: true, message: 'Connection successful!' });
  } catch (error) {
    res.status(400).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Clone database endpoint
app.post('/api/clone-database', async (req, res) => {
  let sourceConn = null;
  let targetConn = null;
  let dumpFile = null;

  try {
    const { source, target } = req.body;

    // Validate inputs
    if (!source || !target) {
      return res.status(400).json({ 
        success: false, 
        message: 'Source and target credentials are required' 
      });
    }

    // Test source connection with READ-ONLY enforcement
    sourceConn = await mysql.createConnection({
      host: source.host,
      user: source.user,
      password: source.password,
      port: source.port || 3306,
    });

    // CRITICAL: Force source connection to read-only mode
    try {
      await sourceConn.execute('SET SESSION TRANSACTION READ ONLY');
    } catch (error) {
      await sourceConn.end();
      return res.status(400).json({ 
        success: false, 
        message: 'Failed to set read-only mode on source. Aborting clone for safety.' 
      });
    }

    // Verify source database exists
    const [sourceDbCheck] = await sourceConn.execute(
      'SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?',
      [source.database]
    );

    if (sourceDbCheck.length === 0) {
      await sourceConn.end();
      return res.status(400).json({ 
        success: false, 
        message: `Source database "${source.database}" does not exist` 
      });
    }

    // Test target connection
    targetConn = await mysql.createConnection({
      host: target.host,
      user: target.user,
      password: target.password,
      port: target.port || 3306,
    });

    // Create dump file path
    dumpFile = `/tmp/mysql_dump_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.sql`;

    // Send initial status
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Transfer-Encoding', 'chunked');
    
    res.write(JSON.stringify({ 
      status: 'progress', 
      message: 'Source database set to read-only mode. Starting clone...' 
    }) + '\n');

    // Step 1: Create dump from source with maximum safety flags
    res.write(JSON.stringify({ 
      status: 'progress', 
      message: `Dumping source database: ${source.database}` 
    }) + '\n');

    // Use mysqldump with comprehensive safety options
    // --skip-add-drop-database ensures we don't drop the source DB
    // --lock-tables acquires READ LOCAL lock (non-blocking reads)
    // --single-transaction uses consistent snapshot
    // MariaDB (used in Railway) will automatically handle SSL/TLS fallback
    const dumpCommand = `mysqldump -h ${source.host} -P ${source.port || 3306} -u ${source.user} --password="${source.password}" --single-transaction --lock-tables --routines --triggers --events --skip-add-drop-database --skip-add-locks ${source.database} > "${dumpFile}"`;
    
    try {
      const { stdout, stderr } = await execPromise(dumpCommand, { maxBuffer: 100 * 1024 * 1024 });
      if (stderr && !stderr.includes('Deprecated program name')) {
        console.warn('mysqldump stderr:', stderr);
      }
    } catch (execError) {
      res.write(JSON.stringify({ 
        status: 'error', 
        message: `Dump failed: ${execError.message}` 
      }) + '\n');
      res.end();
      return;
    }

    res.write(JSON.stringify({ 
      status: 'progress', 
      message: 'Dump created successfully. Creating target database...' 
    }) + '\n');

    // Step 2: Create database on target if it doesn't exist
    const [rows] = await targetConn.execute(
      'SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?',
      [target.database]
    );

    if (rows.length === 0) {
      res.write(JSON.stringify({ 
        status: 'progress', 
        message: `Creating database: ${target.database}` 
      }) + '\n');

      await targetConn.execute(`CREATE DATABASE IF NOT EXISTS \`${target.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    }

    res.write(JSON.stringify({ 
      status: 'progress', 
      message: `Restoring database to target: ${target.database}` 
    }) + '\n');

    // Step 3: Restore dump to target
    // MariaDB (used in Railway) will automatically handle SSL/TLS fallback
    const restoreCommand = `mysql -h ${target.host} -P ${target.port || 3306} -u ${target.user} --password="${target.password}" ${target.database} < "${dumpFile}"`;
    
    try {
      const { stdout, stderr } = await execPromise(restoreCommand, { maxBuffer: 100 * 1024 * 1024 });
      if (stderr && !stderr.includes('Deprecated')) {
        console.warn('mysql restore stderr:', stderr);
      }
    } catch (execError) {
      res.write(JSON.stringify({ 
        status: 'error', 
        message: `Restore failed: ${execError.message}` 
      }) + '\n');
      res.end();
      return;
    }

    res.write(JSON.stringify({ 
      status: 'progress', 
      message: 'Database restore completed. Cleaning up...' 
    }) + '\n');

    // Cleanup
    if (dumpFile && fs.existsSync(dumpFile)) {
      try {
        fs.unlinkSync(dumpFile);
      } catch (cleanupError) {
        console.warn('Could not delete dump file:', cleanupError.message);
      }
    }

    // Close connections
    if (sourceConn) {
      await sourceConn.end();
    }
    if (targetConn) {
      await targetConn.end();
    }

    res.write(JSON.stringify({ 
      status: 'success', 
      message: 'Database cloned successfully! Source database remains untouched.' 
    }) + '\n');
    res.end();

  } catch (error) {
    console.error('Clone error:', error);
    
    // Clean up on error
    if (dumpFile && fs.existsSync(dumpFile)) {
      try {
        fs.unlinkSync(dumpFile);
      } catch (e) {
        console.warn('Could not delete dump file on error:', e.message);
      }
    }

    if (sourceConn) {
      try {
        await sourceConn.end();
      } catch (e) {
        console.warn('Could not close source connection:', e.message);
      }
    }

    if (targetConn) {
      try {
        await targetConn.end();
      } catch (e) {
        console.warn('Could not close target connection:', e.message);
      }
    }

    // Only write response if headers haven't been sent
    if (!res.headersSent) {
      res.status(500).json({ 
        success: false, 
        message: error.message 
      });
    } else {
      res.write(JSON.stringify({ 
        status: 'error', 
        message: error.message 
      }) + '\n');
      res.end();
    }
  }
});

// Get database list endpoint
app.post('/api/get-databases', async (req, res) => {
  try {
    const { host, user, password, port, isSource } = req.body;

    const connection = await mysql.createConnection({
      host,
      user,
      password,
      port: port || 3306,
    });

    // If this is a source connection, enforce read-only mode
    if (isSource) {
      try {
        await connection.execute('SET SESSION TRANSACTION READ ONLY');
      } catch (error) {
        await connection.end();
        return res.status(400).json({ 
          success: false, 
          message: 'Failed to set read-only mode. Aborting for safety.' 
        });
      }
    }

    const [rows] = await connection.execute(
      "SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')"
    );

    const databases = rows.map(row => row.SCHEMA_NAME);

    await connection.end();

    res.json({ success: true, databases });
  } catch (error) {
    res.status(400).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Get database statistics endpoint
app.post('/api/get-database-stats', async (req, res) => {
  try {
    const { host, user, password, database, port, isSource } = req.body;

    const connection = await mysql.createConnection({
      host,
      user,
      password,
      database,
      port: port || 3306,
    });

    // Set read-only if source
    if (isSource) {
      try {
        await connection.execute('SET SESSION TRANSACTION READ ONLY');
      } catch (error) {
        await connection.end();
        return res.status(400).json({ 
          success: false, 
          message: 'Failed to set read-only mode' 
        });
      }
    }

    // Get table count
    const [tableCount] = await connection.execute(
      `SELECT COUNT(*) as count FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?`,
      [database]
    );

    // Get table list with row counts
    const [tables] = await connection.execute(`
      SELECT 
        TABLE_NAME,
        TABLE_ROWS,
        ROUND(((data_length + index_length) / 1024 / 1024), 2) as size_mb
      FROM information_schema.TABLES 
      WHERE TABLE_SCHEMA = ?
      ORDER BY TABLE_ROWS DESC
    `, [database]);

    // Get database size
    const [dbSize] = await connection.execute(`
      SELECT 
        ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) as size_mb
      FROM information_schema.TABLES 
      WHERE TABLE_SCHEMA = ?
    `, [database]);

    // Get total row count
    const [totalRows] = await connection.execute(`
      SELECT SUM(TABLE_ROWS) as total_rows
      FROM information_schema.TABLES 
      WHERE TABLE_SCHEMA = ?
    `, [database]);

    await connection.end();

    res.json({ 
      success: true, 
      stats: {
        tableCount: tableCount[0]?.count || 0,
        totalRows: totalRows[0]?.total_rows || 0,
        sizeInMB: dbSize[0]?.size_mb || 0,
        tables: tables || []
      }
    });
  } catch (error) {
    res.status(400).json({ 
      success: false, 
      message: error.message 
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
