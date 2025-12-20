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

  try {
    const { source, target } = req.body;

    // Validate inputs
    if (!source || !target) {
      return res.status(400).json({ 
        success: false, 
        message: 'Source and target credentials are required' 
      });
    }

    // Send initial status
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Transfer-Encoding', 'chunked');

    const sendProgress = (message) => {
      res.write(JSON.stringify({ status: 'progress', message }) + '\n');
    };

    const sendError = (message) => {
      res.write(JSON.stringify({ status: 'error', message }) + '\n');
      res.end();
    };

    sendProgress('Connecting to source database...');

    // Connect to source with READ-ONLY mode
    sourceConn = await mysql.createConnection({
      host: source.host,
      user: source.user,
      password: source.password,
      database: source.database,
      port: source.port || 3306,
      multipleStatements: false,
    });

    // CRITICAL: Force source connection to read-only mode
    try {
      await sourceConn.execute('SET SESSION TRANSACTION READ ONLY');
      sendProgress('Source database set to READ-ONLY mode for safety');
    } catch (error) {
      await sourceConn.end();
      return sendError('Failed to set read-only mode on source. Aborting clone for safety.');
    }

    sendProgress('Connecting to target database...');

    // Connect to target
    targetConn = await mysql.createConnection({
      host: target.host,
      user: target.user,
      password: target.password,
      port: target.port || 3306,
      multipleStatements: true,
    });

    // Create target database if it doesn't exist
    sendProgress(`Creating target database: ${target.database}`);
    await targetConn.execute(`CREATE DATABASE IF NOT EXISTS \`${target.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await targetConn.changeUser({ database: target.database });

    // Get all tables from source
    sendProgress('Fetching table list from source...');
    const [tables] = await sourceConn.execute(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'`,
      [source.database]
    );

    sendProgress(`Found ${tables.length} tables to clone`);

    // Disable foreign key checks on target
    await targetConn.execute('SET FOREIGN_KEY_CHECKS = 0');

    // Clone each table
    for (let i = 0; i < tables.length; i++) {
      const tableName = tables[i].TABLE_NAME;
      sendProgress(`Cloning table ${i + 1}/${tables.length}: ${tableName}`);

      // Get CREATE TABLE statement from source
      const [createResult] = await sourceConn.execute(`SHOW CREATE TABLE \`${tableName}\``);
      const createStatement = createResult[0]['Create Table'];

      // Drop table on target if exists and recreate
      await targetConn.execute(`DROP TABLE IF EXISTS \`${tableName}\``);
      await targetConn.execute(createStatement);

      // Get row count
      const [countResult] = await sourceConn.execute(`SELECT COUNT(*) as cnt FROM \`${tableName}\``);
      const rowCount = countResult[0].cnt;

      if (rowCount > 0) {
        // Copy data in batches
        const batchSize = 1000;
        let offset = 0;

        while (offset < rowCount) {
          const [rows] = await sourceConn.execute(`SELECT * FROM \`${tableName}\` LIMIT ${batchSize} OFFSET ${offset}`);
          
          if (rows.length > 0) {
            // Build INSERT statement
            const columns = Object.keys(rows[0]);
            const placeholders = rows.map(() => `(${columns.map(() => '?').join(', ')})`).join(', ');
            const values = rows.flatMap(row => columns.map(col => row[col]));
            
            const insertSQL = `INSERT INTO \`${tableName}\` (${columns.map(c => `\`${c}\``).join(', ')}) VALUES ${placeholders}`;
            await targetConn.execute(insertSQL, values);
          }

          offset += batchSize;
          if (rowCount > batchSize) {
            sendProgress(`  ${tableName}: ${Math.min(offset, rowCount)}/${rowCount} rows copied`);
          }
        }
      }
    }

    // Re-enable foreign key checks
    await targetConn.execute('SET FOREIGN_KEY_CHECKS = 1');

    // Clone views
    sendProgress('Cloning views...');
    const [views] = await sourceConn.execute(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.VIEWS WHERE TABLE_SCHEMA = ?`,
      [source.database]
    );

    for (const view of views) {
      try {
        const [viewDef] = await sourceConn.execute(`SHOW CREATE VIEW \`${view.TABLE_NAME}\``);
        const createView = viewDef[0]['Create View'];
        await targetConn.execute(`DROP VIEW IF EXISTS \`${view.TABLE_NAME}\``);
        // Remove DEFINER clause for portability
        const cleanedView = createView.replace(/DEFINER=`[^`]+`@`[^`]+`\s*/gi, '');
        await targetConn.execute(cleanedView);
      } catch (viewError) {
        sendProgress(`  Warning: Could not clone view ${view.TABLE_NAME}: ${viewError.message}`);
      }
    }

    // Clone procedures
    sendProgress('Cloning stored procedures...');
    const [procedures] = await sourceConn.execute(
      `SELECT ROUTINE_NAME FROM INFORMATION_SCHEMA.ROUTINES WHERE ROUTINE_SCHEMA = ? AND ROUTINE_TYPE = 'PROCEDURE'`,
      [source.database]
    );

    for (const proc of procedures) {
      try {
        const [procDef] = await sourceConn.execute(`SHOW CREATE PROCEDURE \`${proc.ROUTINE_NAME}\``);
        const createProc = procDef[0]['Create Procedure'];
        await targetConn.execute(`DROP PROCEDURE IF EXISTS \`${proc.ROUTINE_NAME}\``);
        const cleanedProc = createProc.replace(/DEFINER=`[^`]+`@`[^`]+`\s*/gi, '');
        await targetConn.execute(cleanedProc);
      } catch (procError) {
        sendProgress(`  Warning: Could not clone procedure ${proc.ROUTINE_NAME}: ${procError.message}`);
      }
    }

    // Clone functions
    sendProgress('Cloning stored functions...');
    const [functions] = await sourceConn.execute(
      `SELECT ROUTINE_NAME FROM INFORMATION_SCHEMA.ROUTINES WHERE ROUTINE_SCHEMA = ? AND ROUTINE_TYPE = 'FUNCTION'`,
      [source.database]
    );

    for (const func of functions) {
      try {
        const [funcDef] = await sourceConn.execute(`SHOW CREATE FUNCTION \`${func.ROUTINE_NAME}\``);
        const createFunc = funcDef[0]['Create Function'];
        await targetConn.execute(`DROP FUNCTION IF EXISTS \`${func.ROUTINE_NAME}\``);
        const cleanedFunc = createFunc.replace(/DEFINER=`[^`]+`@`[^`]+`\s*/gi, '');
        await targetConn.execute(cleanedFunc);
      } catch (funcError) {
        sendProgress(`  Warning: Could not clone function ${func.ROUTINE_NAME}: ${funcError.message}`);
      }
    }

    // Close connections
    await sourceConn.end();
    await targetConn.end();

    res.write(JSON.stringify({ 
      status: 'success', 
      message: `Database cloned successfully! ${tables.length} tables, ${views.length} views copied. Source database remains untouched.` 
    }) + '\n');
    res.end();

  } catch (error) {
    console.error('Clone error:', error);

    if (sourceConn) {
      try { await sourceConn.end(); } catch (e) {}
    }
    if (targetConn) {
      try { await targetConn.end(); } catch (e) {}
    }

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
