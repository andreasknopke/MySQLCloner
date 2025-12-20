import React, { useState } from 'react';

const CronDialog = ({ source, target, onClose, onSave, existingJobs }) => {
  const [schedule, setSchedule] = useState('daily');
  const [customCron, setCustomCron] = useState('0 2 * * *');
  const [jobName, setJobName] = useState(`Clone ${source.database} → ${target.database}`);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const scheduleOptions = {
    hourly: { label: 'Every Hour', cron: '0 * * * *', description: 'At minute 0 of every hour' },
    daily: { label: 'Daily at 2:00 AM', cron: '0 2 * * *', description: 'Every day at 02:00' },
    weekly: { label: 'Weekly (Sunday 2:00 AM)', cron: '0 2 * * 0', description: 'Every Sunday at 02:00' },
    monthly: { label: 'Monthly (1st at 2:00 AM)', cron: '0 2 1 * *', description: 'First day of month at 02:00' },
    custom: { label: 'Custom Cron', cron: customCron, description: 'Custom cron expression' }
  };

  const getCronExpression = () => {
    return schedule === 'custom' ? customCron : scheduleOptions[schedule].cron;
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    
    try {
      await onSave({
        name: jobName,
        schedule: getCronExpression(),
        source,
        target
      });
      onClose();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content cron-dialog">
        <h2>⏰ Schedule Auto-Clone</h2>
        
        <div className="cron-form">
          <div className="form-group">
            <label>Job Name</label>
            <input
              type="text"
              value={jobName}
              onChange={(e) => setJobName(e.target.value)}
              placeholder="Enter a name for this job"
            />
          </div>

          <div className="form-group">
            <label>Clone Schedule</label>
            <div className="schedule-options">
              {Object.entries(scheduleOptions).map(([key, option]) => (
                <label key={key} className={`schedule-option ${schedule === key ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="schedule"
                    value={key}
                    checked={schedule === key}
                    onChange={(e) => setSchedule(e.target.value)}
                  />
                  <span className="option-label">{option.label}</span>
                  <span className="option-description">{option.description}</span>
                </label>
              ))}
            </div>
          </div>

          {schedule === 'custom' && (
            <div className="form-group">
              <label>Cron Expression</label>
              <input
                type="text"
                value={customCron}
                onChange={(e) => setCustomCron(e.target.value)}
                placeholder="e.g., 0 */6 * * * (every 6 hours)"
              />
              <small>Format: minute hour day-of-month month day-of-week</small>
            </div>
          )}

          <div className="connection-summary">
            <h4>Connection Details</h4>
            <div className="summary-row">
              <span className="label">Source:</span>
              <span className="value">{source.user}@{source.host}:{source.port}/{source.database}</span>
            </div>
            <div className="summary-row">
              <span className="label">Target:</span>
              <span className="value">{target.user}@{target.host}:{target.port}/{target.database}</span>
            </div>
          </div>

          {error && <div className="error-message">{error}</div>}

          <div className="cron-actions">
            <button className="btn-secondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : '💾 Save Schedule'}
            </button>
          </div>
        </div>

        {existingJobs && existingJobs.length > 0 && (
          <div className="existing-jobs">
            <h4>Active Scheduled Jobs</h4>
            <ul>
              {existingJobs.map((job, index) => (
                <li key={index}>
                  <span className="job-name">{job.name}</span>
                  <span className="job-schedule">{job.schedule}</span>
                  <span className="job-status">{job.enabled ? '✅ Active' : '⏸️ Paused'}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

export default CronDialog;
