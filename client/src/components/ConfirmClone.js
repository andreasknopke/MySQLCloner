import React from 'react';
import './ConfirmClone.css';

function ConfirmClone({ source, target, structureOnly, onStructureOnlyChange, onConfirm, onCancel }) {
  const sourceDbName = source.database;
  const targetDbName = target.database;

  return (
    <div className="confirm-clone-overlay">
      <div className="confirm-clone-dialog">
        <div className="dialog-header">
          <h2>🔍 Bestätige Datenbank-Klon</h2>
          <p>Überprüfe die folgenden Details, bevor du fortfährst</p>
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

          <div className="clone-options">
            <h3>⚙️ Klon-Optionen:</h3>
            <label className="checkbox-option">
              <input 
                type="checkbox" 
                checked={structureOnly}
                onChange={(e) => onStructureOnlyChange(e.target.checked)}
              />
              <span>Nur Struktur klonen (keine Daten)</span>
            </label>
          </div>

          <div className="commands-section">
            <h3>🔧 Klon-Prozess:</h3>

            <div className="command-block">
              <div className="command-label">Der folgende Prozess wird ausgeführt:</div>
              <pre className="command-code">{structureOnly ? `1. Verbinde zu Quell-DB (READ-ONLY Modus)
2. Verbinde zu Ziel-DB
3. Erstelle Ziel-Datenbank falls nötig
4. Kopiere alle Tabellen-Strukturen (nur Schema)
5. Kopiere Views, Procedures, Functions
6. Schließe Verbindungen` : `1. Verbinde zu Quell-DB (READ-ONLY Modus)
2. Verbinde zu Ziel-DB
3. Erstelle Ziel-Datenbank falls nötig
4. Kopiere alle Tabellen (Schema + Daten)
5. Kopiere Views, Procedures, Functions
6. Schließe Verbindungen`}</pre>
            </div>

            <div className="security-note">
              <strong>🔒 Sicherheitshinweise:</strong>
              <ul>
                <li>✓ Quell-Datenbank wird auf READ-ONLY gesetzt</li>
                <li>✓ Pure Node.js - keine externen Tools benötigt</li>
                <li>✓ Daten werden batch-weise kopiert (1000 Zeilen)</li>
                <li>✓ Foreign Keys werden temporär deaktiviert</li>
                <li>✓ Views, Procedures & Functions werden kopiert</li>
                <li>✓ DEFINER wird für Portabilität entfernt</li>
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
