import React from 'react';
import './DatabaseStats.css';

function DatabaseStats({ stats, onRefresh }) {
  if (!stats) return null;

  // Ensure sizeInMB is a number
  const totalSize = parseFloat(stats.sizeInMB) || 0;
  const totalRows = parseInt(stats.totalRows) || 0;

  return (
    <div className="database-stats">
      <div className="stats-header">
        <h3>📊 Datenbankstatistiken</h3>
        {onRefresh && (
          <button className="btn-refresh-stats" onClick={onRefresh} title="Statistiken aktualisieren">
            🔄
          </button>
        )}
      </div>
      
      <div className="stats-overview">
        <div className="stat-item">
          <div className="stat-label">Tabellen</div>
          <div className="stat-value">{stats.tableCount}</div>
        </div>
        <div className="stat-item">
          <div className="stat-label">Gesamte Datensätze</div>
          <div className="stat-value">{totalRows.toLocaleString()}</div>
        </div>
        <div className="stat-item">
          <div className="stat-label">Größe</div>
          <div className="stat-value">{totalSize.toFixed(2)} MB</div>
        </div>
      </div>

      {stats.tables && stats.tables.length > 0 && (
        <div className="tables-list">
          <h4>📋 Tabellen</h4>
          <div className="tables-grid">
            {stats.tables.map((table) => {
              const tableSize = parseFloat(table.size_mb) || 0;
              const tableRows = parseInt(table.TABLE_ROWS) || 0;
              return (
                <div key={table.TABLE_NAME} className="table-card">
                  <div className="table-name">{table.TABLE_NAME}</div>
                  <div className="table-info">
                    <span className="info-badge">
                      {tableRows.toLocaleString()} Zeilen
                    </span>
                    <span className="info-badge size">
                      {tableSize.toFixed(2)} MB
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default DatabaseStats;
