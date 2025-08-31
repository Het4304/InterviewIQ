import React, { useState, useEffect } from "react";
import "./Results.css";

const Results = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    console.log("📥 Checking localStorage for summary...");

    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(timer);
          return 100;
        }
        return prev + 10;
      });
    }, 300);

    const savedSummary = localStorage.getItem("interviewSummary");
    if (savedSummary) {
      console.log("✅ Found summary in localStorage:", savedSummary);
      setTimeout(() => {
        try {
          setSummary(JSON.parse(savedSummary));
        } catch (err) {
          console.error("❌ Failed to parse summary:", err);
        }
        setIsLoading(false);
        setProgress(100);
      }, 2000);
    } else {
      console.warn("⚠️ No summary found in localStorage");
      setTimeout(() => setIsLoading(false), 2000);
    }

    return () => clearInterval(timer);
  }, []);

  const handleRetry = () => {
    console.log("🔄 Clearing summary and retrying interview...");
    localStorage.removeItem("interviewSummary");
    window.location.href = "/role-selection";
  };

  if (isLoading) {
    return (
      <div className="results-container">
        <div className="results-content">
          <div className="loading-card">
            <div className="loading-header">
              <h2>Analyzing Your Interview</h2>
              <p>Processing performance data...</p>
            </div>
            <div className="progress-container">
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
              <span className="progress-text">{progress}% Complete</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="results-container">
        <div className="no-results-card">
          <h3>No Results Available</h3>
          <p>Complete an interview first to see your results.</p>
          <button className="primary-btn" onClick={handleRetry}>
            ← Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="results-container">
      <div className="results-content">
        <div className="results-header">
          <h1>Interview Results</h1>
          <p className="results-subtitle">Comprehensive performance analysis</p>
        </div>

        <div className="detailed-feedback">
          <h2>Detailed Feedback</h2>
          {summary.result
            ?.filter(
              (item) =>
                item.question &&
                item.question.trim() !== "" &&
                !item.question.toLowerCase().includes("unknown question")
            )
            .map((item, idx) => (
              <div key={idx} className="feedback-card">
                <h3 className="question">
                  Q{idx + 1}: {item.question}
                </h3>

                <div className="section">
                  <strong>Your Response:</strong>
                  <p>{item.yourResponse || "N/A"}</p>
                </div>

                <div className="section">
                  <strong>AI Feedback:</strong>
                  {item.pointsToChange && item.pointsToChange.length > 0 ? (
                    <ul>
                      {item.pointsToChange.map((point, i) => (
                        <li key={i}>{point}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>No feedback available</p>
                  )}
                </div>

                <div className="section">
                  <strong>Suggested Response:</strong>
                  <p>{item.suggestedResponse || "N/A"}</p>
                </div>
              </div>
            ))}
        </div>

        <div className="action-buttons">
          <button className="primary-btn" onClick={handleRetry}>
            Try Another Interview
          </button>
        </div>
      </div>
    </div>
  );
};

export default Results;
