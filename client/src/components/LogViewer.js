import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './LogViewer.css';

const LogViewer = ({ apiUrl }) => {
  const [logs, setLogs] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [filters, setFilters] = useState({
    jobId: 'all',
    level: 'all',
    limit: 50
  });
  const [autoRefresh, setAutoRefresh] = useState(false);

  useEffect(() => {
    loadJobs();
    loadLogs();
    loadStats();
  }, [filters]);

  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(() => {
        loadLogs();
        loadStats();
      }, 5000); // Refresh every 5 seconds
      return () => clearInterval(interval);
    }
  }, [autoRefresh, filters]);

  const loadJobs = async () => {
    try {
      const response = await axios.get(`${apiUrl}/cron-jobs`);
      if (response.data.success) {
        setJobs(response.data.jobs);
      }
    } catch (err) {
      console.error('Failed to load jobs:', err);
    }
  };

  const loadLogs = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        jobId: filters.jobId,
        level: filters.level,
        limit: filters.limit,
        offset: 0
      });
      
      const response = await axios.get(`${apiUrl}/logs?${params}`);
      if (response.data.success) {
        setLogs(response.data.logs);
      }
    } catch (err) {
      console.error('Failed to load logs:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const response = await axios.get(`${apiUrl}/logs/stats`);
      if (response.data.success) {
        setStats(response.data.stats);
      }
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  };

  const clearLogs = async () => {
    if (!window.confirm('Are you sure you want to clear all logs?')) {
      return;
    }

    try {
      const params = filters.jobId !== 'all' ? `?jobId=${filters.jobId}` : '';
      await axios.delete(`${apiUrl}/logs${params}`);
      loadLogs();
      loadStats();
    } catch (err) {
      alert(`Failed to clear logs: ${err.response?.data?.message || err.message}`);
    }
  };

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleString('de-DE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const getLevelIcon = (level) => {
    const icons = {
      info: 'ℹ️',
      success: '✅',
      warning: '⚠️',
      error: '❌'
    };
    return icons[level] || '📝';
  };

  const getLevelClass = (level) => {
    return `log-level-${level}`;
  };

  const exportLogs = () => {
    const dataStr = JSON.stringify(logs, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cron-logs-${new Date().toISOString()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="log-viewer">
      <div className="log-header">
        <h2>📋 Cron Job Logs</h2>
        <div className="header-actions">
          <label className="auto-refresh">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto-Refresh
          </label>
          <button className="btn-secondary" onClick={exportLogs}>
            💾 Export
          </button>
          <button className="btn-secondary" onClick={loadLogs}>
            🔄 Refresh
          </button>
          <button className="btn-danger" onClick={clearLogs}>
            🗑️ Clear Logs
          </button>
        </div>
      </div>

      {stats && (
        <div className="log-stats">
          <div className="stat-card">
            <div className="stat-value">{stats.total}</div>
            <div className="stat-label">Total Logs</div>
          </div>
          <div className="stat-card success">
            <div className="stat-value">{stats.byLevel.success}</div>
            <div className="stat-label">✅ Success</div>
          </div>
          <div className="stat-card error">
            <div className="stat-value">{stats.byLevel.error}</div>
            <div className="stat-label">❌ Errors</div>
          </div>
          <div className="stat-card warning">
            <div className="stat-value">{stats.byLevel.warning}</div>
            <div className="stat-label">⚠️ Warnings</div>
          </div>
          <div className="stat-card info">
            <div className="stat-value">{stats.byLevel.info}</div>
            <div className="stat-label">ℹ️ Info</div>
          </div>
        </div>
      )}

      <div className="log-filters">
        <div className="filter-group">
          <label>Job:</label>
          <select
            value={filters.jobId}
            onChange={(e) => setFilters({ ...filters, jobId: e.target.value })}
          >
            <option value="all">All Jobs</option>
            {jobs.map(job => (
              <option key={job.id} value={job.id}>{job.name}</option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label>Level:</label>
          <select
            value={filters.level}
            onChange={(e) => setFilters({ ...filters, level: e.target.value })}
          >
            <option value="all">All Levels</option>
            <option value="info">Info</option>
            <option value="success">Success</option>
            <option value="warning">Warning</option>
            <option value="error">Error</option>
          </select>
        </div>

        <div className="filter-group">
          <label>Show:</label>
          <select
            value={filters.limit}
            onChange={(e) => setFilters({ ...filters, limit: parseInt(e.target.value) })}
          >
            <option value="25">25 entries</option>
            <option value="50">50 entries</option>
            <option value="100">100 entries</option>
            <option value="500">500 entries</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="loading">Loading logs...</div>
      ) : logs.length === 0 ? (
        <div className="no-logs">
          <p>No logs found.</p>
          <p>Logs will appear here when cron jobs run.</p>
        </div>
      ) : (
        <div className="logs-container">
          <table className="logs-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Level</th>
                <th>Job</th>
                <th>Message</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log.id} className={getLevelClass(log.level)}>
                  <td className="log-timestamp">{formatTimestamp(log.timestamp)}</td>
                  <td className="log-level">
                    <span className={`level-badge ${log.level}`}>
                      {getLevelIcon(log.level)} {log.level}
                    </span>
                  </td>
                  <td className="log-job">{log.jobName}</td>
                  <td className="log-message">{log.message}</td>
                  <td className="log-metadata">
                    {log.metadata && Object.keys(log.metadata).length > 0 && (
                      <details>
                        <summary>View</summary>
                        <pre>{JSON.stringify(log.metadata, null, 2)}</pre>
                      </details>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default LogViewer;
