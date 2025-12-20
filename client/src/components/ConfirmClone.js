import React from 'react';
import './ConfirmClone.css';

function ConfirmClone({ source, target, onConfirm, onCancel }) {
  const sourceDbName = source.database;
  const targetDbName = target.database;

  // Generate mysqldump command (sanitized for display)
  const dumpCommand = `mysqldump -h ${source.host} -P ${source.port || 3306} -u ${source.user} \\
  --skip-ssl --single-transaction --lock-tables --routines --triggers --events \\
  --skip-add-drop-database --skip-add-locks ${sourceDbName} > /tmp/mysql_dump.sql`;

  // Generate mysql restore command (sanitized for display)
  const restoreCommand = `mysql -h ${target.host} -P ${target.port || 3306} -u ${target.user} \\
  --skip-ssl ${targetDbName} < /tmp/mysql_dump.sql`;

  return (
    <div className="confirm-clone-overlay">
      <div className="confirm-clone-dialog">
        <div className="dialog-header">
          <h2>🔍 Bestätige Datenbank-Klon</h2>
          <p>Überprüfe die folgenden Befehle, bevor du fortfährst</p>
        </div>

        <div className="dialog-content">
          <div className="clone-summary">
            <div className="summary-item">
              <span className="label">Quelle:</span>
              <span className="value">
                {source.user}@{source.host}:{source.port || 3306}/{sourceDbName}
              </span>
            </div>
            <div className="arrow-down">↓</div>
            <div className="summary-item">
              <span className="label">Ziel:</span>
              <span className="value">
                {target.user}@{target.host}:{target.port || 3306}/{targetDbName}
              </span>
            </div>
          </div>

          <div className="commands-section">
            <h3>🔧 Verwendete Befehle:</h3>

            <div className="command-block">
              <div className="command-label">1. Export aus Quell-Datenbank</div>
              <pre className="command-code">{dumpCommand}</pre>
            </div>

            <div className="command-block">
              <div className="command-label">2. Import in Ziel-Datenbank</div>
              <pre className="command-code">{restoreCommand}</pre>
            </div>

            <div className="security-note">
              <strong>🔒 Sicherheitshinweise:</strong>
              <ul>
                <li>✓ Quell-Datenbank wird auf READ-ONLY gesetzt</li>
                <li>✓ Keine DROP DATABASE - DB bleibt erhalten</li>
                <li>✓ Nutzt Single-Transaction für Konsistenz</li>
                <li>✓ Temporäre Datei wird nach Import gelöscht</li>
                <li>✓ Tabellen, Trigger, Routinen & Events werden kopiert</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="dialog-footer">
          <button className="btn-cancel" onClick={onCancel}>
            ✕ Abbrechen
          </button>
          <button className="btn-confirm" onClick={onConfirm}>
            ✓ Klon starten
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmClone;
