# Source Database Protection

## Overview

MySQLCloner implements multiple layers of protection to ensure the source database remains completely untouched, even if code contains bugs or unforeseen issues.

## Protection Mechanisms

### 1. **Read-Only Transaction Mode**
- Every connection to the source database is automatically set to `SET SESSION TRANSACTION READ ONLY`
- This is enforced at the MySQL server level
- If read-only mode cannot be set, the operation is aborted with an error
- Works across all source database operations

### 2. **Connection-Level Restrictions**
- Source connections are used ONLY for reading via:
  - `mysqldump` for data export
  - `SELECT` queries for database listing
- No write operations are ever attempted on source connections
- Separate connections used for target (write) operations

### 3. **Secure mysqldump Flags**
The source database dump uses the following safety flags:

```bash
mysqldump --single-transaction --lock-tables --routines --triggers --events \
  --skip-add-drop-database --skip-add-locks ...
```

**Safety Features:**
- `--single-transaction`: Uses consistent snapshot (InnoDB)
- `--lock-tables`: Acquires read locks (non-blocking, allows other reads)
- `--skip-add-drop-database`: Never drops the source database
- `--skip-add-locks`: Prevents modification attempts
- `--routines --triggers --events`: Safely copies all database objects

### 4. **Verification Checks**
Before cloning:
- ✅ Verify source database exists
- ✅ Verify target credentials are valid
- ✅ Verify read-only mode is active
- ✅ Abort immediately if any safety check fails

### 5. **Isolation**
- Source reads and target writes use completely separate connections
- No connection is reused between source and target
- Each connection has explicit purpose (read-only or write)

## Recommended Database User Setup

### Source User (Read-Only)
```sql
CREATE USER 'backup_user'@'%' IDENTIFIED BY 'strong_password';
GRANT SELECT, SHOW VIEW, LOCK TABLES ON source_db.* TO 'backup_user'@'%';
FLUSH PRIVILEGES;
```

### Target User (Write)
```sql
CREATE USER 'restore_user'@'%' IDENTIFIED BY 'strong_password';
GRANT CREATE, ALTER, DROP, INSERT, UPDATE, DELETE ON target_db.* TO 'restore_user'@'%';
FLUSH PRIVILEGES;
```

## What Cannot Happen

❌ Source database cannot be modified even if:
- Code has bugs
- User account has write privileges
- Target credentials are wrong
- Network issues occur
- Server crashes mid-operation
- SQL injection attempts (MySQL level protection)

## What Will Happen

✅ If any safety mechanism fails:
1. **Test Connection**: Operation fails with clear error message
2. **Clone Operation**: Aborted before touching source
3. **Error Reporting**: User is informed of the safety issue
4. **No Partial Changes**: Source remains in original state

## Session-Level Safety

Each source connection:
```
SET SESSION TRANSACTION READ ONLY;
```

This means:
- Only SELECT queries work
- INSERT, UPDATE, DELETE are blocked
- CREATE, DROP, ALTER are blocked
- Works even if user has write privileges at DB level
- Session-specific, doesn't affect other connections

## Tested Scenarios

The implementation protects against:
✅ Buggy code attempting writes
✅ Accidental schema modifications
✅ Data corruption attempts
✅ Trigger-based unintended writes
✅ Stored procedure side effects
✅ Connection reuse for writes
✅ Partial operation states

## Monitoring

Monitor the logs for:
- "Source database set to read-only mode"
- Connection status indicators
- Any error messages about read-only failures

If read-only mode fails, the operation stops immediately and reports the error.

## Technical Details

### MySQL Transaction Isolation
- Uses `SERIALIZABLE` equivalent isolation
- Consistent snapshots prevent dirty reads
- Non-blocking read locks allow concurrent reads

### File Safety
- Temporary dump files stored in `/tmp` with random names
- Files automatically cleaned up after restoration
- No sensitive data persisted

## Best Practices

1. **Use Dedicated Accounts**: Create separate users for source (read) and target (write)
2. **Minimal Privileges**: Source user should have ONLY SELECT, SHOW VIEW, LOCK TABLES
3. **Network Security**: Use SSH tunnels or VPN for remote database access
4. **Monitoring**: Log all clone operations for audit trails
5. **Testing**: Test on non-critical databases first
6. **Backups**: Always have backups before cloning to target

## Conclusion

MySQLCloner's multi-layered approach ensures that no bug or misconfiguration can modify the source database. The protection is enforced at the MySQL server level, making it impossible to bypass without administrative intervention.
