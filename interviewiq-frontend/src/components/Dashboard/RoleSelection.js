import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Dashboard.css';

const RoleSelection = () => {
  const [selectedRole, setSelectedRole] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const roles = [
    'Software Engineer',
    'Data Scientist',
    'Product Manager',
    'UX Designer',
    'DevOps Engineer',
    'Frontend Developer',
    'Backend Developer',
    'Full Stack Developer',
    'Machine Learning Engineer',
    'Cloud Architect'
  ];

  const handleRoleSelect = (role) => {
    setSelectedRole(role);
  };

  const handleStartInterview = async () => {
    if (!selectedRole) return;
    
    setLoading(true);
    try {
      // Navigate to interview page with role as query parameter
      navigate(`/interview?role=${encodeURIComponent(selectedRole)}`);
    } catch (error) {
      console.error('Error starting interview:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="dashboard-container">
      <div className="dashboard-card">
        <h2>Select Your Target Role</h2>
        <p className="dashboard-subtitle">
          Choose the role you're preparing for. We'll tailor the interview questions accordingly.
        </p>

        <div className="roles-grid">
          {roles.map((role) => (
            <div
              key={role}
              className={`role-card ${selectedRole === role ? 'selected' : ''}`}
              onClick={() => handleRoleSelect(role)}
            >
              <div className="role-icon">💼</div>
              <h3>{role}</h3>
              <p>Behavioral & Technical Questions</p>
            </div>
          ))}
        </div>

        <button
          onClick={handleStartInterview}
          disabled={!selectedRole || loading}
          className="start-button"
        >
          {loading ? 'Starting...' : 'Start Interview'}
        </button>
      </div>
    </div>
  );
};

export default RoleSelection;