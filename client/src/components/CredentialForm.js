import React from 'react';
import './CredentialForm.css';

function CredentialForm({
  title,
  credentials,
  setCredentials,
  onTest,
  connected,
  databases = [],
  selectedDatabase,
  onDatabaseSelect,
}) {
  const handleChange = (field, value) => {
    setCredentials({
      ...credentials,
      [field]: value,
    });
  };

  return (
    <div className="credential-form">
      <div className="form-header">
        <h2>{title}</h2>
        <span className={`status ${connected ? 'connected' : 'disconnected'}`}>
          {connected ? '✓ Connected' : '○ Not Connected'}
        </span>
      </div>

      <div className="form-group">
        <label>Host</label>
        <input
          type="text"
          placeholder="localhost or IP address"
          value={credentials.host}
          onChange={(e) => handleChange('host', e.target.value)}
        />
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>Port</label>
          <input
            type="number"
            placeholder="3306"
            value={credentials.port}
            onChange={(e) => handleChange('port', parseInt(e.target.value))}
          />
        </div>
      </div>

      <div className="form-group">
        <label>Username</label>
        <input
          type="text"
          placeholder="root"
          value={credentials.user}
          onChange={(e) => handleChange('user', e.target.value)}
        />
      </div>

      <div className="form-group">
        <label>Password</label>
        <input
          type="password"
          placeholder="Enter password"
          value={credentials.password}
          onChange={(e) => handleChange('password', e.target.value)}
        />
      </div>

      <button className="test-btn" onClick={onTest}>
        🔗 Test Connection
      </button>

      {connected && databases.length > 0 && (
        <div className="form-group">
          <label>Select Database</label>
          <select 
            value={selectedDatabase} 
            onChange={(e) => onDatabaseSelect(e.target.value)}
          >
            <option value="">Choose a database...</option>
            {databases.map((db) => (
              <option key={db} value={db}>
                {db}
              </option>
            ))}
          </select>
        </div>
      )}

      {connected && !databases.length && (
        <div className="form-group">
          <label>Database Name</label>
          <input
            type="text"
            placeholder="Enter database name"
            value={selectedDatabase}
            onChange={(e) => onDatabaseSelect(e.target.value)}
          />
        </div>
      )}

      {!connected && (
        <div className="form-group">
          <label>Database Name</label>
          <input
            type="text"
            placeholder="Enter database name"
            value={selectedDatabase}
            onChange={(e) => onDatabaseSelect(e.target.value)}
            disabled
          />
        </div>
      )}
    </div>
  );
}

export default CredentialForm;
