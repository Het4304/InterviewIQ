import React from 'react';
import './RealTimeFeedback.css';

const RealTimeFeedback = ({ feedback = [] }) => {
  const getFeedbackIcon = (type) => {
    switch (type) {
      case 'pace': return '⏱️';
      case 'filler': return '🗣️';
      case 'pause': return '⏸️';
      case 'volume': return '🔊';
      case 'content': return '💡';
      case 'error': return '❌';
      default: return '💡';
    }
  };

  const getFeedbackClass = (type) => {
    switch (type) {
      case 'error': return 'error';
      case 'pace': return 'warning';
      case 'filler': return 'info';
      default: return 'neutral';
    }
  };

  if (!feedback || feedback.length === 0) {
    return (
      <div className="real-time-feedback">
        <div className="feedback-placeholder">
          <div className="placeholder-icon">💡</div>
          <p>Feedback will appear here as you speak</p>
          <small>Tips: Speak clearly, avoid filler words, and maintain good pace</small>
        </div>
      </div>
    );
  }

  return (
    <div className="real-time-feedback">
      <div className="feedback-list">
        {feedback.slice(-5).filter(item => item.message && item.message.trim()).map((item, index) => (
          <div
            key={index}
            className={`feedback-item ${getFeedbackClass(item.type)}`}
          >
            <span className="feedback-icon">{getFeedbackIcon(item.type)}</span>
            <span className="feedback-content">{item.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default RealTimeFeedback;