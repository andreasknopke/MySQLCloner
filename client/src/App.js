import React, { useState } from 'react';
import axios from 'axios';
import './App.css';
import CredentialForm from './components/CredentialForm';
import ProgressLog from './components/ProgressLog';
import DatabaseStats from './components/DatabaseStats';

function App() {
  const [source, setSource] = useState({
    host: '',
    port: 3306,
    user: '',
    password: '',
    database: '',
  });

  const [target, setTarget] = useState({
    host: '',
    port: 3306,
    user: '',
    password: '',
    database: '',
  });

  const [cloning, setCloning] = useState(false);
  const [logs, setLogs] = useState([]);
  const [sourceConnected, setSourceConnected] = useState(false);
  const [targetConnected, setTargetConnected] = useState(false);
  const [sourceDatabases, setSourceDatabases] = useState([]);
  const [sourceStats, setSourceStats] = useState(null);
  const [targetStats, setTargetStats] = useState(null);

  // Dynamically determine API URL based on environment
  const API_URL = process.env.REACT_APP_API_URL || 
    (process.env.NODE_ENV === 'production' ? '/api' : 'http://localhost:5000/api');

  const testSourceConnection = async () => {
    try {
      const response = await axios.post(`${API_URL}/test-connection`, { ...source, isSource: true });
      if (response.data.success) {
        setSourceConnected(true);
        setLogs([...logs, { type: 'success', message: 'Source connected (read-only mode enabled)!' }]);
        
        const dbResponse = await axios.post(`${API_URL}/get-databases`, { ...source, isSource: true });
        if (dbResponse.data.success) {
          setSourceDatabases(dbResponse.data.databases);
        }

        // Get source database stats if database is selected
        if (source.database) {
          try {
            const statsResponse = await axios.post(`${API_URL}/get-database-stats`, { ...source, isSource: true });
            if (statsResponse.data.success) {
              setSourceStats(statsResponse.data.stats);
            }
          } catch (statsError) {
            console.log('Could not fetch stats:', statsError.message);
          }
        }
      }
    } catch (error) {
      setSourceConnected(false);
      setSourceStats(null);
      setLogs([...logs, { type: 'error', message: `Source error: ${error.response?.data?.message || error.message}` }]);
    }
  };

  const testTargetConnection = async () => {
    try {
      const response = await axios.post(`${API_URL}/test-connection`, target);
      if (response.data.success) {
        setTargetConnected(true);
        setLogs([...logs, { type: 'success', message: 'Target connected!' }]);
        
        // Get target database stats if database is selected
        if (target.database) {
          try {
            const statsResponse = await axios.post(`${API_URL}/get-database-stats`, { ...target, isSource: false });
            if (statsResponse.data.success) {
              setTargetStats(statsResponse.data.stats);
            }
          } catch (statsError) {
            console.log('Could not fetch stats:', statsError.message);
          }
        }
      }
    } catch (error) {
      setTargetConnected(false);
      setTargetStats(null);
      setLogs([...logs, { type: 'error', message: `Target error: ${error.response?.data?.message || error.message}` }]);
    }
  };

  const cloneDatabase = async () => {
    if (!sourceConnected || !targetConnected) {
      setLogs([...logs, { type: 'error', message: 'Please test both connections first!' }]);
      return;
    }

    if (!source.database || !target.database) {
      setLogs([...logs, { type: 'error', message: 'Please select both source and target databases!' }]);
      return;
    }

    setCloning(true);
    setLogs([{ type: 'info', message: 'Starting database clone...' }]);

    try {
      const response = await axios.post(`${API_URL}/clone-database`, { source, target }, {
        responseType: 'text',
        onDownloadProgress: (event) => {
          const text = event.currentTarget.response;
          const lines = text.trim().split('\n');
          const newLogs = lines.map(line => {
            try {
              const parsed = JSON.parse(line);
              return parsed;
            } catch {
              return null;
            }
          }).filter(log => log !== null);
          
          setLogs(newLogs);
        }
      });

      setCloning(false);
    } catch (error) {
      setCloning(false);
      setLogs(prev => [...prev, { 
        type: 'error', 
        message: error.response?.data?.message || error.message 
      }]);
    }
  };

  return (
    <div className="app">
      <div className="container">
        <div className="header">
          <h1>🗄️ MySQL Cloner</h1>
          <p>Clone your MySQL databases across networks</p>
        </div>

        <div className="main-content">
          <div className="forms-section">
            <div>
              <CredentialForm
                title="Source Database"
                credentials={source}
                setCredentials={setSource}
                onTest={testSourceConnection}
                connected={sourceConnected}
                databases={sourceDatabases}
                selectedDatabase={source.database}
                onDatabaseSelect={(db) => setSource({ ...source, database: db })}
              />
              {sourceStats && <DatabaseStats stats={sourceStats} />}
            </div>

            <div className="arrow">
              <span>→</span>
            </div>

            <div>
              <CredentialForm
                title="Target Database"
                credentials={target}
                setCredentials={setTarget}
                onTest={testTargetConnection}
                connected={targetConnected}
                selectedDatabase={target.database}
                onDatabaseSelect={(db) => setTarget({ ...target, database: db })}
              />
              {targetStats && <DatabaseStats stats={targetStats} />}
            </div>
          </div>

          <div className="action-section">
            <button 
              className={`clone-btn ${cloning ? 'loading' : ''} ${sourceConnected && targetConnected ? '' : 'disabled'}`}
              onClick={cloneDatabase}
              disabled={cloning || !sourceConnected || !targetConnected}
            >
              {cloning ? '⏳ Cloning...' : '🚀 Clone Database'}
            </button>
          </div>

          <ProgressLog logs={logs} />
        </div>
      </div>
    </div>
  );
}

export default App;
