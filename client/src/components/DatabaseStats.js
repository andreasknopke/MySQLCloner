import React from 'react';
import './DatabaseStats.css';

function DatabaseStats({ stats }) {
  if (!stats) return null;

  return (
    <div className="database-stats">
      <h3>📊 Datenbankstatistiken</h3>
      
      <div className="stats-overview">
        <div className="stat-item">
          <div className="stat-label">Tabellen</div>
          <div className="stat-value">{stats.tableCount}</div>
        </div>
        <div className="stat-item">
          <div className="stat-label">Gesamte Datensätze</div>
          <div className="stat-value">{(stats.totalRows || 0).toLocaleString()}</div>
        </div>
        <div className="stat-item">
          <div className="stat-label">Größe</div>
          <div className="stat-value">{stats.sizeInMB.toFixed(2)} MB</div>
        </div>
      </div>

      {stats.tables && stats.tables.length > 0 && (
        <div className="tables-list">
          <h4>📋 Tabellen</h4>
          <div className="tables-grid">
            {stats.tables.map((table) => (
              <div key={table.TABLE_NAME} className="table-card">
                <div className="table-name">{table.TABLE_NAME}</div>
                <div className="table-info">
                  <span className="info-badge">
                    {(table.TABLE_ROWS || 0).toLocaleString()} Zeilen
                  </span>
                  <span className="info-badge size">
                    {table.size_mb || 0} MB
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default DatabaseStats;
