import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './CronManager.css';

const CronManager = ({ apiUrl }) => {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedJob, setExpandedJob] = useState(null);

  useEffect(() => {
    loadJobs();
  }, []);

  const loadJobs = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${apiUrl}/cron-jobs`);
      if (response.data.success) {
        setJobs(response.data.jobs);
      }
      setError(null);
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleJob = async (jobId, currentStatus) => {
    try {
      const response = await axios.patch(`${apiUrl}/cron-jobs/${jobId}`, {
        enabled: !currentStatus
      });
      
      if (response.data.success) {
        setJobs(jobs.map(job => 
          job.id === jobId ? { ...job, enabled: !currentStatus } : job
        ));
      }
    } catch (err) {
      alert(`Failed to toggle job: ${err.response?.data?.message || err.message}`);
    }
  };

  const deleteJob = async (jobId) => {
    if (!window.confirm('Are you sure you want to delete this cron job?')) {
      return;
    }

    try {
      const response = await axios.delete(`${apiUrl}/cron-jobs/${jobId}`);
      if (response.data.success) {
        setJobs(jobs.filter(job => job.id !== jobId));
      }
    } catch (err) {
      alert(`Failed to delete job: ${err.response?.data?.message || err.message}`);
    }
  };

  const runJobNow = async (jobId) => {
    try {
      const response = await axios.post(`${apiUrl}/cron-jobs/${jobId}/run`);
      if (response.data.success) {
        alert('Job started! Check the logs to see progress.');
      }
    } catch (err) {
      alert(`Failed to run job: ${err.response?.data?.message || err.message}`);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString('de-DE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getNextRunTime = (schedule) => {
    // Simple cron expression parser for display
    const cronDescriptions = {
      '0 * * * *': 'Stündlich',
      '0 2 * * *': 'Täglich um 2:00 Uhr',
      '0 2 * * 0': 'Sonntags um 2:00 Uhr',
      '0 2 1 * *': 'Monatlich am 1. um 2:00 Uhr'
    };
    
    return cronDescriptions[schedule] || schedule;
  };

  if (loading) {
    return <div className="cron-manager loading">Loading cron jobs...</div>;
  }

  return (
    <div className="cron-manager">
      <div className="cron-header">
        <h2>⏰ Scheduled Cron Jobs</h2>
        <button className="btn-refresh" onClick={loadJobs}>
          🔄 Refresh
        </button>
      </div>

      {error && (
        <div className="error-banner">
          ⚠️ {error}
        </div>
      )}

      {jobs.length === 0 ? (
        <div className="no-jobs">
          <p>No scheduled cron jobs yet.</p>
          <p>Create one by clicking "Schedule Auto-Clone" after setting up a clone operation.</p>
        </div>
      ) : (
        <div className="jobs-list">
          {jobs.map(job => (
            <div key={job.id} className={`job-card ${job.enabled ? 'enabled' : 'disabled'}`}>
              <div className="job-header">
                <div className="job-title">
                  <h3>{job.name}</h3>
                  <span className={`job-status ${job.enabled ? 'active' : 'paused'}`}>
                    {job.enabled ? '✅ Active' : '⏸️ Paused'}
                  </span>
                </div>
                <div className="job-actions">
                  <button 
                    className="btn-icon" 
                    onClick={() => runJobNow(job.id)}
                    title="Run now"
                  >
                    ▶️
                  </button>
                  <button 
                    className="btn-icon" 
                    onClick={() => toggleJob(job.id, job.enabled)}
                    title={job.enabled ? 'Pause' : 'Resume'}
                  >
                    {job.enabled ? '⏸️' : '▶️'}
                  </button>
                  <button 
                    className="btn-icon btn-delete" 
                    onClick={() => deleteJob(job.id)}
                    title="Delete"
                  >
                    🗑️
                  </button>
                  <button 
                    className="btn-icon" 
                    onClick={() => setExpandedJob(expandedJob === job.id ? null : job.id)}
                    title="Show details"
                  >
                    {expandedJob === job.id ? '▲' : '▼'}
                  </button>
                </div>
              </div>

              <div className="job-info">
                <div className="info-item">
                  <span className="label">Schedule:</span>
                  <span className="value">{getNextRunTime(job.schedule)}</span>
                </div>
                <div className="info-item">
                  <span className="label">Created:</span>
                  <span className="value">{formatDate(job.createdAt)}</span>
                </div>
              </div>

              {expandedJob === job.id && (
                <div className="job-details">
                  <div className="details-section">
                    <h4>Source Database</h4>
                    <div className="connection-info">
                      <span>Host: {job.source.host}</span>
                      <span>Database: {job.source.database}</span>
                    </div>
                  </div>
                  <div className="details-section">
                    <h4>Target Database</h4>
                    <div className="connection-info">
                      <span>Host: {job.target.host}</span>
                      <span>Database: {job.target.database}</span>
                    </div>
                  </div>
                  <div className="details-section">
                    <h4>Technical Details</h4>
                    <div className="connection-info">
                      <span>Job ID: {job.id}</span>
                      <span>Cron Expression: {job.schedule}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CronManager;
