import React, { useEffect, useRef } from 'react';
import './ProgressLog.css';

function ProgressLog({ logs }) {
  const logsEndRef = useRef(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div className="progress-log">
      <h3>📋 Progress Log</h3>
      <div className="logs-container">
        {logs.length === 0 ? (
          <div className="empty-logs">
            <p>No activity yet. Test connections and start cloning!</p>
          </div>
        ) : (
          logs.map((log, index) => (
            <div key={index} className={`log-entry log-${log.type || 'info'}`}>
              <span className="log-icon">
                {log.type === 'success' && '✓'}
                {log.type === 'error' && '✗'}
                {log.type === 'progress' && '⏳'}
                {!log.type || log.type === 'info' && 'ℹ'}
              </span>
              <span className="log-message">{log.message}</span>
            </div>
          ))
        )}
        <div ref={logsEndRef} />
      </div>
    </div>
  );
}

export default ProgressLog;
