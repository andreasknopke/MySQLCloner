import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';
import CredentialForm from './components/CredentialForm';
import ProgressLog from './components/ProgressLog';
import DatabaseStats from './components/DatabaseStats';
import ConfirmClone from './components/ConfirmClone';
import CronDialog from './components/CronDialog';
import CronManager from './components/CronManager';
import LogViewer from './components/LogViewer';

function App() {
  const [activeTab, setActiveTab] = useState('clone'); // 'clone', 'jobs', 'logs'
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
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showCronDialog, setShowCronDialog] = useState(false);
  const [cloneSuccess, setCloneSuccess] = useState(false);
  const [existingJobs, setExistingJobs] = useState([]);

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

  const handleInitiateClone = () => {
    if (!sourceConnected || !targetConnected) {
      setLogs([...logs, { type: 'error', message: 'Please test both connections first!' }]);
      return;
    }

    if (!source.database || !target.database) {
      setLogs([...logs, { type: 'error', message: 'Please select both source and target databases!' }]);
      return;
    }

    setShowConfirmDialog(true);
  };

  // Fetch existing cron jobs
  const fetchCronJobs = async () => {
    try {
      const response = await axios.get(`${API_URL}/cron-jobs`);
      if (response.data.success) {
        setExistingJobs(response.data.jobs);
      }
    } catch (error) {
      console.log('Could not fetch cron jobs:', error.message);
    }
  };

  // Save a new cron job
  const saveCronJob = async (jobConfig) => {
    const response = await axios.post(`${API_URL}/cron-jobs`, jobConfig);
    if (!response.data.success) {
      throw new Error(response.data.message);
    }
    await fetchCronJobs();
    return response.data;
  };

  const cloneDatabase = async () => {
    setShowConfirmDialog(false);
    setCloning(true);
    setCloneSuccess(false);
    setLogs([{ type: 'info', message: 'Starting database clone...' }]);

    try {
      const response = await fetch(`${API_URL}/clone-database`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ source, target }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }

      // Process the response stream line by line
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let currentData = '';
      const newLogs = [];
      let cloneSuccessful = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        currentData += decoder.decode(value, { stream: true });
        const lines = currentData.split('\n');

        // Keep the last incomplete line
        currentData = lines.pop() || '';

        lines.forEach(line => {
          if (line.trim()) {
            try {
              const parsed = JSON.parse(line);
              newLogs.push(parsed);
              setLogs([...newLogs]);
              // Check if clone was successful
              if (parsed.status === 'success' || (parsed.message && parsed.message.includes('successfully'))) {
                cloneSuccessful = true;
              }
            } catch {
              // Skip invalid JSON lines
            }
          }
        });
      }

      // Handle any remaining data
      if (currentData.trim()) {
        try {
          const parsed = JSON.parse(currentData);
          newLogs.push(parsed);
          setLogs([...newLogs]);
          if (parsed.status === 'success' || (parsed.message && parsed.message.includes('successfully'))) {
            cloneSuccessful = true;
          }
        } catch {
          // Skip invalid JSON
        }
      }

      setCloning(false);
      
      // Show cron dialog after successful clone
      if (cloneSuccessful) {
        setCloneSuccess(true);
        await fetchCronJobs();
      }
    } catch (error) {
      setCloning(false);
      setLogs(prev => [...prev, { 
        type: 'error', 
        message: error.message 
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

        <div className="tabs">
          <button 
            className={`tab ${activeTab === 'clone' ? 'active' : ''}`}
            onClick={() => setActiveTab('clone')}
          >
            🚀 Clone Database
          </button>
          <button 
            className={`tab ${activeTab === 'jobs' ? 'active' : ''}`}
            onClick={() => setActiveTab('jobs')}
          >
            ⏰ Cron Jobs
          </button>
          <button 
            className={`tab ${activeTab === 'logs' ? 'active' : ''}`}
            onClick={() => setActiveTab('logs')}
          >
            📋 Logs
          </button>
        </div>

        {activeTab === 'clone' && (
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
                onClick={handleInitiateClone}
                disabled={cloning || !sourceConnected || !targetConnected}
              >
                {cloning ? '⏳ Cloning...' : '🚀 Clone Database'}
              </button>
            </div>

            {showConfirmDialog && (
              <ConfirmClone 
                source={source}
                target={target}
                onConfirm={cloneDatabase}
                onCancel={() => setShowConfirmDialog(false)}
              />
            )}

            {cloneSuccess && !showCronDialog && (
              <div className="success-actions">
                <div className="success-message">
                  ✅ Clone completed successfully!
                </div>
                <button 
                  className="schedule-btn"
                  onClick={() => setShowCronDialog(true)}
                >
                  ⏰ Schedule Auto-Clone
                </button>
                <button 
                  className="dismiss-btn"
                  onClick={() => setCloneSuccess(false)}
                >
                  Dismiss
                </button>
              </div>
            )}

            {showCronDialog && (
              <CronDialog
                source={source}
                target={target}
                existingJobs={existingJobs}
                onClose={() => {
                  setShowCronDialog(false);
                  setCloneSuccess(false);
                }}
                onSave={saveCronJob}
              />
            )}

            <ProgressLog logs={logs} />
          </div>
        )}

        {activeTab === 'jobs' && (
          <CronManager apiUrl={API_URL} />
        )}

        {activeTab === 'logs' && (
          <LogViewer apiUrl={API_URL} />
        )}
      </div>
    </div>
  );
}

export default App;
