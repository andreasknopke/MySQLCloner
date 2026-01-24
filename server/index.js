const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const { exec } = require('child_process');
const util = require('util');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');

const app = express();
const execPromise = util.promisify(exec);

// Store scheduled jobs in memory (could be persisted to file/DB later)
const scheduledJobs = new Map();
const jobHistory = [];

// Persistent logging system - use persistent storage in production
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const LOGS_DIR = path.join(DATA_DIR, 'logs');
const JOBS_FILE = path.join(DATA_DIR, 'scheduled-jobs.json');
const LOGS_FILE = path.join(LOGS_DIR, 'cron-logs.json');

// Ensure data directories exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  console.log(`Created data directory: ${DATA_DIR}`);
}
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
  console.log(`Created logs directory: ${LOGS_DIR}`);
}

// Log entry structure: { id, jobId, jobName, timestamp, level, message, metadata }
const cronLogs = [];

// Load saved logs from file on startup
const loadSavedLogs = () => {
  try {
    if (fs.existsSync(LOGS_FILE)) {
      const data = JSON.parse(fs.readFileSync(LOGS_FILE, 'utf8'));
      return data.logs || [];
    }
  } catch (error) {
    console.error('Failed to load saved logs:', error.message);
  }
  return [];
};

// Save logs to file (keep last 1000 entries)
const saveLogsToFile = () => {
  try {
    const logsToSave = cronLogs.slice(-1000);
    fs.writeFileSync(LOGS_FILE, JSON.stringify({ logs: logsToSave }, null, 2));
  } catch (error) {
    console.error('Failed to save logs:', error.message);
  }
};

// Add a log entry
const addLog = (jobId, jobName, level, message, metadata = {}) => {
  const logEntry = {
    id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    jobId,
    jobName,
    timestamp: new Date().toISOString(),
    level, // 'info', 'success', 'warning', 'error'
    message,
    metadata
  };
  
  cronLogs.push(logEntry);
  console.log(`[${level.toUpperCase()}] [${jobName}] ${message}`);
  
  // Save periodically (every 10 logs) or on error
  if (cronLogs.length % 10 === 0 || level === 'error') {
    saveLogsToFile();
  }
  
  return logEntry;
};

// Load saved jobs from file on startup
const loadSavedJobs = () => {
  try {
    if (fs.existsSync(JOBS_FILE)) {
      const data = JSON.parse(fs.readFileSync(JOBS_FILE, 'utf8'));
      return data.jobs || [];
    }
  } catch (error) {
    console.error('Failed to load saved jobs:', error.message);
  }
  return [];
};

const saveJobsToFile = () => {
  try {
    const jobs = Array.from(scheduledJobs.values()).map(job => ({
      id: job.id,
      name: job.name,
      schedule: job.schedule,
      source: job.source,
      target: job.target,
      enabled: job.enabled,
      createdAt: job.createdAt
    }));
    fs.writeFileSync(JOBS_FILE, JSON.stringify({ jobs }, null, 2));
  } catch (error) {
    console.error('Failed to save jobs:', error.message);
  }
};

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

    // Connect to source - ENFORCED READ-ONLY for safety
    sourceConn = await mysql.createConnection({
      host: source.host,
      user: source.user,
      password: source.password,
      database: source.database,
      port: source.port || 3306,
      multipleStatements: false,
    });

    // CRITICAL: Enforce read-only mode on source connection
    await sourceConn.execute('SET SESSION TRANSACTION READ ONLY');
    sendProgress('Source database connected (READ-ONLY mode enforced)');

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

    // Set SQL mode to allow exact data copying (including zero dates, etc.)
    await targetConn.execute("SET SESSION sql_mode = 'NO_ENGINE_SUBSTITUTION'");
    
    // Disable foreign key checks on target
    await targetConn.execute('SET FOREIGN_KEY_CHECKS = 0');

    // IMPORTANT: Drop ALL existing tables, views, procedures, functions in target first
    sendProgress('Cleaning target database (dropping all existing objects)...');
    
    // Drop all views first
    const [existingViews] = await targetConn.execute(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.VIEWS WHERE TABLE_SCHEMA = ?`,
      [target.database]
    );
    for (const view of existingViews) {
      await targetConn.execute(`DROP VIEW IF EXISTS \`${view.TABLE_NAME}\``);
    }
    
    // Drop all tables
    const [existingTables] = await targetConn.execute(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'`,
      [target.database]
    );
    for (const table of existingTables) {
      await targetConn.execute(`DROP TABLE IF EXISTS \`${table.TABLE_NAME}\``);
    }
    
    // Drop all procedures
    const [existingProcs] = await targetConn.execute(
      `SELECT ROUTINE_NAME FROM INFORMATION_SCHEMA.ROUTINES WHERE ROUTINE_SCHEMA = ? AND ROUTINE_TYPE = 'PROCEDURE'`,
      [target.database]
    );
    for (const proc of existingProcs) {
      await targetConn.execute(`DROP PROCEDURE IF EXISTS \`${proc.ROUTINE_NAME}\``);
    }
    
    // Drop all functions
    const [existingFuncs] = await targetConn.execute(
      `SELECT ROUTINE_NAME FROM INFORMATION_SCHEMA.ROUTINES WHERE ROUTINE_SCHEMA = ? AND ROUTINE_TYPE = 'FUNCTION'`,
      [target.database]
    );
    for (const func of existingFuncs) {
      await targetConn.execute(`DROP FUNCTION IF EXISTS \`${func.ROUTINE_NAME}\``);
    }
    
    sendProgress(`Cleaned target database: removed ${existingTables.length} tables, ${existingViews.length} views`);
    
    // Get all tables from source
    sendProgress('Fetching table list from source...');
    const [tables] = await sourceConn.execute(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'`,
      [source.database]
    );

    sendProgress(`Found ${tables.length} tables to clone`);

    // Clone each table
    for (let i = 0; i < tables.length; i++) {
      const tableName = tables[i].TABLE_NAME;
      sendProgress(`Cloning table ${i + 1}/${tables.length}: ${tableName}`);

      // Get CREATE TABLE statement from source
      const [createResult] = await sourceConn.execute(`SHOW CREATE TABLE \`${tableName}\``);
      let createStatement = createResult[0]['Create Table'];

      // Replace unsupported collations with compatible ones
      createStatement = createStatement
        .replace(/utf8mb4_uca1400_ai_ci/g, 'utf8mb4_unicode_ci')
        .replace(/utf8mb4_0900_ai_ci/g, 'utf8mb4_unicode_ci')
        .replace(/utf8_uca1400_ai_ci/g, 'utf8_unicode_ci');

      // Create table on target
      await targetConn.execute(createStatement);

      // Get first column as fallback for ordering
      const [colInfo] = await sourceConn.execute(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? 
         ORDER BY ORDINAL_POSITION LIMIT 1`,
        [source.database, tableName]
      );
      
      // Get ALL primary key columns for unique ordering
      const [allKeyInfo] = await sourceConn.execute(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = 'PRIMARY' 
         ORDER BY ORDINAL_POSITION`,
        [source.database, tableName]
      );
      
      // Build ORDER BY with all PK columns, or fallback to first column
      let orderByClause;
      if (allKeyInfo.length > 0) {
        orderByClause = allKeyInfo.map(k => `\`${k.COLUMN_NAME}\``).join(', ');
      } else {
        orderByClause = `\`${colInfo[0].COLUMN_NAME}\``;
      }
      
      // First, count rows in source to verify later
      const [initialCount] = await sourceConn.execute(`SELECT COUNT(*) as cnt FROM \`${tableName}\``);
      const expectedRows = parseInt(initialCount[0].cnt);
      sendProgress(`  ${tableName}: ${expectedRows} rows to copy`);
      
      // Use simple pagination - read ALL data from source first to avoid any issues
      const batchSize = 500;
      let offset = 0;
      let totalCopied = 0;
      let failedRows = 0;
      
      // Read and insert in batches
      while (offset < expectedRows || offset === 0) {
        const [rows] = await sourceConn.execute(
          `SELECT * FROM \`${tableName}\` ORDER BY ${orderByClause} LIMIT ${batchSize} OFFSET ${offset}`
        );
        
        if (rows.length === 0) {
          break;
        }
        
        // Try batch insert first
        const columns = Object.keys(rows[0]);
        
        // Helper function to safely serialize values for MySQL
        const serializeValue = (value) => {
          if (value === null || value === undefined) {
            return null;
          }
          // Convert JSON objects/arrays to strings
          if (typeof value === 'object' && !Buffer.isBuffer(value) && !(value instanceof Date)) {
            return JSON.stringify(value);
          }
          // Convert Buffers to strings for JSON columns
          if (Buffer.isBuffer(value)) {
            try {
              return value.toString('utf8');
            } catch {
              return value;
            }
          }
          return value;
        };
        
        try {
          const placeholders = rows.map(() => `(${columns.map(() => '?').join(', ')})`).join(', ');
          const values = rows.flatMap(row => columns.map(col => serializeValue(row[col])));
          
          const insertSQL = `INSERT INTO \`${tableName}\` (${columns.map(c => `\`${c}\``).join(', ')}) VALUES ${placeholders}`;
          await targetConn.execute(insertSQL, values);
          totalCopied += rows.length;
        } catch (batchError) {
          // Batch failed - try row by row
          sendProgress(`  ${tableName}: Batch insert failed, trying row by row...`);
          sendProgress(`  Error: ${batchError.message.substring(0, 150)}`);
          
          for (const row of rows) {
            try {
              const singlePlaceholder = `(${columns.map(() => '?').join(', ')})`;
              const singleValues = columns.map(col => serializeValue(row[col]));
              const singleInsertSQL = `INSERT INTO \`${tableName}\` (${columns.map(c => `\`${c}\``).join(', ')}) VALUES ${singlePlaceholder}`;
              await targetConn.execute(singleInsertSQL, singleValues);
              totalCopied++;
            } catch (rowError) {
              failedRows++;
              sendProgress(`  ⚠️ Row ${offset + failedRows} failed: ${rowError.message.substring(0, 100)}`);
            }
          }
        }
        
        offset += rows.length;
        
        if (offset % 1000 === 0 || offset === expectedRows) {
          sendProgress(`  ${tableName}: ${offset}/${expectedRows} rows processed...`);
        }
        
        // Safety: if we got less than batchSize, there's no more data
        if (rows.length < batchSize) {
          break;
        }
      }
      
      if (failedRows > 0) {
        sendProgress(`  ⚠️ ${tableName}: ${failedRows} rows failed to copy!`);
      }
      
      // Verify by counting both sides
      const [sourceCount] = await sourceConn.execute(`SELECT COUNT(*) as cnt FROM \`${tableName}\``);
      const [targetCount] = await targetConn.execute(`SELECT COUNT(*) as cnt FROM \`${tableName}\``);
      const srcRows = parseInt(sourceCount[0].cnt);
      const tgtRows = parseInt(targetCount[0].cnt);
      
      if (srcRows !== tgtRows) {
        sendProgress(`  ⚠️ WARNING: ${tableName} mismatch! Source: ${srcRows}, Target: ${tgtRows}, Copied: ${totalCopied}`);
      } else {
        sendProgress(`  ✓ ${tableName}: ${tgtRows} rows copied successfully`);
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
// Clear target database endpoint - truncates all tables
app.post('/api/clear-database', async (req, res) => {
  try {
    const { host, user, password, database, port } = req.body;

    const connection = await mysql.createConnection({
      host,
      user,
      password,
      database,
      port: port || 3306,
    });

    // Disable foreign key checks
    await connection.execute('SET FOREIGN_KEY_CHECKS = 0');

    // Get all tables (only BASE TABLE, not views)
    const [tables] = await connection.execute(
      `SELECT TABLE_NAME FROM information_schema.TABLES 
       WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'`,
      [database]
    );

    // Truncate each table
    let clearedCount = 0;
    for (const table of tables) {
      try {
        await connection.execute(`TRUNCATE TABLE \`${table.TABLE_NAME}\``);
        clearedCount++;
      } catch (error) {
        console.log(`Could not truncate ${table.TABLE_NAME}:`, error.message);
      }
    }

    // Re-enable foreign key checks
    await connection.execute('SET FOREIGN_KEY_CHECKS = 1');

    await connection.end();

    res.json({ 
      success: true, 
      message: `Successfully cleared ${clearedCount} tables`,
      clearedCount
    });
  } catch (error) {
    res.status(400).json({ 
      success: false, 
      message: error.message 
    });
  }
});

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

    // Get base tables and views
    const [tableList] = await connection.execute(
      `SELECT TABLE_NAME, TABLE_TYPE, ROUND(((data_length + index_length) / 1024 / 1024), 2) as size_mb
       FROM information_schema.TABLES 
       WHERE TABLE_SCHEMA = ? AND TABLE_TYPE IN ('BASE TABLE', 'VIEW')
       ORDER BY TABLE_TYPE, TABLE_NAME`,
      [database]
    );

    // Get EXACT row counts using COUNT(*) for each table/view
    const tables = [];
    let totalRows = 0;
    let baseTableCount = 0;
    let viewCount = 0;
    
    for (const table of tableList) {
      try {
        const [countResult] = await connection.execute(
          `SELECT COUNT(*) as cnt FROM \`${table.TABLE_NAME}\``
        );
        const rowCount = parseInt(countResult[0].cnt);
        tables.push({
          TABLE_NAME: table.TABLE_NAME,
          TABLE_TYPE: table.TABLE_TYPE,
          TABLE_ROWS: rowCount,
          size_mb: table.size_mb
        });
        totalRows += rowCount;
        
        if (table.TABLE_TYPE === 'BASE TABLE') {
          baseTableCount++;
        } else {
          viewCount++;
        }
      } catch (error) {
        // Some views might not be countable, skip them
        console.log(`Could not count rows for ${table.TABLE_NAME}:`, error.message);
      }
    }
    
    // Sort by row count descending
    tables.sort((a, b) => b.TABLE_ROWS - a.TABLE_ROWS);

    // Get database size
    const [dbSize] = await connection.execute(`
      SELECT 
        ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) as size_mb
      FROM information_schema.TABLES 
      WHERE TABLE_SCHEMA = ?
    `, [database]);

    await connection.end();

    res.json({ 
      success: true, 
      stats: {
        tableCount: baseTableCount,
        viewCount: viewCount,
        totalCount: tableList.length,
        totalRows: totalRows,
        sizeInMB: dbSize[0]?.size_mb || 0,
        tables: tables
      }
    });
  } catch (error) {
    res.status(400).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// ============== CRON JOB MANAGEMENT ==============

// Helper function to perform the actual clone (reusable for cron jobs)
async function performClone(source, target, logCallback, jobId = null, jobName = null) {
  let sourceConn = null;
  let targetConn = null;
  
  const log = logCallback || console.log;
  const logWithPersist = (level, message, metadata = {}) => {
    log(message);
    if (jobId && jobName) {
      addLog(jobId, jobName, level, message, metadata);
    }
  };

  try {
    logWithPersist('info', 'Connecting to source database...');
    
    sourceConn = await mysql.createConnection({
      host: source.host,
      user: source.user,
      password: source.password,
      database: source.database,
      port: source.port || 3306,
      multipleStatements: false,
    });

    await sourceConn.execute('SET SESSION TRANSACTION READ ONLY');
    logWithPersist('success', 'Source database connected (READ-ONLY mode enforced)');

    logWithPersist('info', 'Connecting to target database...');
    
    targetConn = await mysql.createConnection({
      host: target.host,
      user: target.user,
      password: target.password,
      port: target.port || 3306,
      multipleStatements: true,
    });

    logWithPersist('info', `Creating target database: ${target.database}`);
    await targetConn.execute(`CREATE DATABASE IF NOT EXISTS \`${target.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await targetConn.changeUser({ database: target.database });
    await targetConn.execute("SET SESSION sql_mode = 'NO_ENGINE_SUBSTITUTION'");
    await targetConn.execute('SET FOREIGN_KEY_CHECKS = 0');

    // Drop all existing tables
    logWithPersist('info', 'Cleaning target database...');
    const [existingViews] = await targetConn.execute(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.VIEWS WHERE TABLE_SCHEMA = ?`,
      [target.database]
    );
    for (const view of existingViews) {
      await targetConn.execute(`DROP VIEW IF EXISTS \`${view.TABLE_NAME}\``);
    }
    
    const [existingTables] = await targetConn.execute(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'`,
      [target.database]
    );
    for (const table of existingTables) {
      await targetConn.execute(`DROP TABLE IF EXISTS \`${table.TABLE_NAME}\``);
    }

    logWithPersist('info', `Cleaned ${existingTables.length} tables, ${existingViews.length} views`);

    // Get all tables from source
    const [tables] = await sourceConn.execute(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'`,
      [source.database]
    );

    logWithPersist('info', `Found ${tables.length} tables to clone`);

    // Clone each table
    for (let i = 0; i < tables.length; i++) {
      const tableName = tables[i].TABLE_NAME;
      logWithPersist('info', `Cloning table ${i + 1}/${tables.length}: ${tableName}`);

      const [createResult] = await sourceConn.execute(`SHOW CREATE TABLE \`${tableName}\``);
      const createStatement = createResult[0]['Create Table'];
      await targetConn.execute(createStatement);

      // Get first column for ordering
      const [colInfo] = await sourceConn.execute(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? 
         ORDER BY ORDINAL_POSITION LIMIT 1`,
        [source.database, tableName]
      );

      // Get all PK columns
      const [allKeyInfo] = await sourceConn.execute(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = 'PRIMARY' 
         ORDER BY ORDINAL_POSITION`,
        [source.database, tableName]
      );
      
      let orderByClause = allKeyInfo.length > 0 
        ? allKeyInfo.map(k => `\`${k.COLUMN_NAME}\``).join(', ')
        : `\`${colInfo[0].COLUMN_NAME}\``;

      const [initialCount] = await sourceConn.execute(`SELECT COUNT(*) as cnt FROM \`${tableName}\``);
      const expectedRows = parseInt(initialCount[0].cnt);

      const batchSize = 500;
      let offset = 0;
      let totalCopied = 0;

      while (offset < expectedRows || offset === 0) {
        const [rows] = await sourceConn.execute(
          `SELECT * FROM \`${tableName}\` ORDER BY ${orderByClause} LIMIT ${batchSize} OFFSET ${offset}`
        );
        
        if (rows.length === 0) break;
        
        const columns = Object.keys(rows[0]);
        const placeholders = rows.map(() => `(${columns.map(() => '?').join(', ')})`).join(', ');
        const values = rows.flatMap(row => columns.map(col => row[col]));
        
        const insertSQL = `INSERT INTO \`${tableName}\` (${columns.map(c => `\`${c}\``).join(', ')}) VALUES ${placeholders}`;
        await targetConn.execute(insertSQL, values);
        totalCopied += rows.length;
        offset += rows.length;
        
        if (rows.length < batchSize) break;
      }

      logWithPersist('success', `✓ ${tableName}: ${totalCopied} rows copied`, { table: tableName, rows: totalCopied });
    }

    await targetConn.execute('SET FOREIGN_KEY_CHECKS = 1');

    // Clone views
    logWithPersist('info', 'Cloning views...');
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
        logWithPersist('success', `✓ View cloned: ${view.TABLE_NAME}`);
      } catch (viewError) {
        logWithPersist('warning', `Could not clone view ${view.TABLE_NAME}: ${viewError.message}`);
      }
    }

    // Clone stored procedures
    logWithPersist('info', 'Cloning stored procedures...');
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
        logWithPersist('success', `✓ Procedure cloned: ${proc.ROUTINE_NAME}`);
      } catch (procError) {
        logWithPersist('warning', `Could not clone procedure ${proc.ROUTINE_NAME}: ${procError.message}`);
      }
    }

    // Clone stored functions
    logWithPersist('info', 'Cloning stored functions...');
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
        logWithPersist('success', `✓ Function cloned: ${func.ROUTINE_NAME}`);
      } catch (funcError) {
        logWithPersist('warning', `Could not clone function ${func.ROUTINE_NAME}: ${funcError.message}`);
      }
    }

    logWithPersist('success', `Clone completed successfully! ${tables.length} tables, ${views.length} views, ${procedures.length} procedures, ${functions.length} functions copied.`, { 
      tablesCloned: tables.length,
      viewsCloned: views.length,
      proceduresCloned: procedures.length,
      functionsCloned: functions.length
    });
    
    return { 
      success: true, 
      tablesCloned: tables.length,
      viewsCloned: views.length,
      proceduresCloned: procedures.length,
      functionsCloned: functions.length
    };
  } catch (error) {
    logWithPersist('error', `Clone failed: ${error.message}`, { error: error.message, stack: error.stack });
    return { success: false, error: error.message };
  } finally {
    if (sourceConn) await sourceConn.end().catch(() => {});
    if (targetConn) await targetConn.end().catch(() => {});
  }
}

// Schedule a new cron job
function scheduleJob(jobConfig) {
  const { id, name, schedule, source, target, enabled } = jobConfig;
  
  // Validate cron expression
  if (!cron.validate(schedule)) {
    throw new Error(`Invalid cron expression: ${schedule}`);
  }
  
  // Stop existing job if exists
  if (scheduledJobs.has(id)) {
    scheduledJobs.get(id).task.stop();
  }
  
  // Create the cron task
  const task = cron.schedule(schedule, async () => {
    const startTime = new Date();
    addLog(id, name, 'info', `Cron job triggered: ${schedule}`);
    
    const result = await performClone(source, target, (msg) => {
      console.log(`[CRON ${name}] ${msg}`);
    }, id, name);
    
    const endTime = new Date();
    const duration = (endTime - startTime) / 1000;
    
    if (result.success) {
      addLog(id, name, 'success', `Job completed in ${duration.toFixed(1)}s`, { 
        duration: `${duration.toFixed(1)}s`,
        tablesCloned: result.tablesCloned 
      });
    } else {
      addLog(id, name, 'error', `Job failed: ${result.error}`, { 
        duration: `${duration.toFixed(1)}s`,
        error: result.error 
      });
    }
    
    jobHistory.push({
      jobId: id,
      jobName: name,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      duration: `${duration.toFixed(1)}s`,
      success: result.success,
      error: result.error || null
    });
    
    // Keep only last 100 history entries
    if (jobHistory.length > 100) {
      jobHistory.shift();
    }
    
    saveLogsToFile();
  }, {
    scheduled: enabled !== false
  });
  
  scheduledJobs.set(id, {
    id,
    name,
    schedule,
    source,
    target,
    enabled: enabled !== false,
    task,
    createdAt: jobConfig.createdAt || new Date().toISOString()
  });
  
  saveJobsToFile();
  return id;
}

// API: Create a new scheduled job
app.post('/api/cron-jobs', async (req, res) => {
  try {
    const { name, schedule, source, target } = req.body;
    
    if (!name || !schedule || !source || !target) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }
    
    if (!cron.validate(schedule)) {
      return res.status(400).json({ success: false, message: `Invalid cron expression: ${schedule}` });
    }
    
    const id = `job_${Date.now()}`;
    scheduleJob({ id, name, schedule, source, target, enabled: true });
    
    res.json({ 
      success: true, 
      message: 'Scheduled job created',
      job: { id, name, schedule, enabled: true }
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// API: Get all scheduled jobs
app.get('/api/cron-jobs', (req, res) => {
  const jobs = Array.from(scheduledJobs.values()).map(job => ({
    id: job.id,
    name: job.name,
    schedule: job.schedule,
    enabled: job.enabled,
    createdAt: job.createdAt,
    source: { host: job.source.host, database: job.source.database },
    target: { host: job.target.host, database: job.target.database }
  }));
  
  res.json({ success: true, jobs });
});

// API: Delete a scheduled job
app.delete('/api/cron-jobs/:id', (req, res) => {
  const { id } = req.params;
  
  if (!scheduledJobs.has(id)) {
    return res.status(404).json({ success: false, message: 'Job not found' });
  }
  
  scheduledJobs.get(id).task.stop();
  scheduledJobs.delete(id);
  saveJobsToFile();
  
  res.json({ success: true, message: 'Job deleted' });
});

// API: Toggle job enabled/disabled
app.patch('/api/cron-jobs/:id', (req, res) => {
  const { id } = req.params;
  const { enabled } = req.body;
  
  if (!scheduledJobs.has(id)) {
    return res.status(404).json({ success: false, message: 'Job not found' });
  }
  
  const job = scheduledJobs.get(id);
  job.enabled = enabled;
  
  if (enabled) {
    job.task.start();
  } else {
    job.task.stop();
  }
  
  saveJobsToFile();
  res.json({ success: true, message: `Job ${enabled ? 'enabled' : 'disabled'}` });
});

// API: Get job history
app.get('/api/cron-jobs/history', (req, res) => {
  res.json({ success: true, history: jobHistory.slice(-50).reverse() });
});

// API: Run a job immediately (for testing)
app.post('/api/cron-jobs/:id/run', async (req, res) => {
  const { id } = req.params;
  
  if (!scheduledJobs.has(id)) {
    return res.status(404).json({ success: false, message: 'Job not found' });
  }
  
  const job = scheduledJobs.get(id);
  res.json({ success: true, message: 'Job started' });
  
  // Run asynchronously
  const startTime = new Date();
  addLog(id, job.name, 'info', 'Manual job execution triggered');
  
  performClone(job.source, job.target, console.log, id, job.name).then(result => {
    const endTime = new Date();
    const duration = (endTime - startTime) / 1000;
    
    if (result.success) {
      addLog(id, job.name, 'success', `Manual execution completed in ${duration.toFixed(1)}s`, { 
        duration: `${duration.toFixed(1)}s`,
        tablesCloned: result.tablesCloned 
      });
    } else {
      addLog(id, job.name, 'error', `Manual execution failed: ${result.error}`, { 
        duration: `${duration.toFixed(1)}s`,
        error: result.error 
      });
    }
    
    saveLogsToFile();
  });
});

// API: Get logs with optional filtering
app.get('/api/logs', (req, res) => {
  const { jobId, level, limit = 100, offset = 0 } = req.query;
  
  let filteredLogs = [...cronLogs];
  
  // Filter by jobId
  if (jobId && jobId !== 'all') {
    filteredLogs = filteredLogs.filter(log => log.jobId === jobId);
  }
  
  // Filter by level
  if (level && level !== 'all') {
    filteredLogs = filteredLogs.filter(log => log.level === level);
  }
  
  // Sort by timestamp descending (newest first)
  filteredLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  
  // Pagination
  const total = filteredLogs.length;
  const paginatedLogs = filteredLogs.slice(parseInt(offset), parseInt(offset) + parseInt(limit));
  
  res.json({ 
    success: true, 
    logs: paginatedLogs,
    total,
    offset: parseInt(offset),
    limit: parseInt(limit)
  });
});

// API: Clear all logs (with optional filtering)
app.delete('/api/logs', (req, res) => {
  const { jobId } = req.query;
  
  if (jobId && jobId !== 'all') {
    const beforeCount = cronLogs.length;
    const index = cronLogs.length;
    for (let i = index - 1; i >= 0; i--) {
      if (cronLogs[i].jobId === jobId) {
        cronLogs.splice(i, 1);
      }
    }
    const deletedCount = beforeCount - cronLogs.length;
    saveLogsToFile();
    return res.json({ success: true, message: `Deleted ${deletedCount} logs for job ${jobId}` });
  }
  
  // Clear all logs
  const count = cronLogs.length;
  cronLogs.length = 0;
  saveLogsToFile();
  res.json({ success: true, message: `Deleted all ${count} logs` });
});

// API: Get log statistics
app.get('/api/logs/stats', (req, res) => {
  const stats = {
    total: cronLogs.length,
    byLevel: {
      info: cronLogs.filter(l => l.level === 'info').length,
      success: cronLogs.filter(l => l.level === 'success').length,
      warning: cronLogs.filter(l => l.level === 'warning').length,
      error: cronLogs.filter(l => l.level === 'error').length
    },
    byJob: {}
  };
  
  // Count logs per job
  cronLogs.forEach(log => {
    if (!stats.byJob[log.jobId]) {
      stats.byJob[log.jobId] = {
        jobName: log.jobName,
        count: 0,
        lastActivity: log.timestamp
      };
    }
    stats.byJob[log.jobId].count++;
    if (new Date(log.timestamp) > new Date(stats.byJob[log.jobId].lastActivity)) {
      stats.byJob[log.jobId].lastActivity = log.timestamp;
    }
  });
  
  res.json({ success: true, stats });
});

// Restore saved jobs on startup
const initializeJobs = () => {
  // Load saved logs first
  const savedLogs = loadSavedLogs();
  cronLogs.push(...savedLogs);
  console.log(`Loaded ${savedLogs.length} saved log entries`);
  
  const savedJobs = loadSavedJobs();
  console.log(`Loading ${savedJobs.length} saved cron jobs...`);
  
  for (const job of savedJobs) {
    try {
      scheduleJob(job);
      console.log(`  ✓ Restored job: ${job.name} (${job.schedule})`);
      addLog(job.id, job.name, 'info', `Job restored on server startup`);
    } catch (error) {
      console.error(`  ✗ Failed to restore job ${job.name}: ${error.message}`);
    }
  }
  
  saveLogsToFile();
};

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  initializeJobs();
});
