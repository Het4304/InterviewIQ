import React, { useState, useEffect, useRef } from 'react';
import RealTimeFeedback from './RealTimeFeedback';
import './Interview.css';

const InterviewRoom = () => {
    const [interviewState, setInterviewState] = useState('preparing');
    const [currentQuestion, setCurrentQuestion] = useState(0);
    const [timeElapsed, setTimeElapsed] = useState(0);
    const [isRecording, setIsRecording] = useState(false);
    const [feedback, setFeedback] = useState([]);
    const [userStream, setUserStream] = useState(null);
    const [role, setRole] = useState('');
    const [questions, setQuestions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [totalQuestions, setTotalQuestions] = useState(0);
    const [isAudioEnabled, setIsAudioEnabled] = useState(true);
    const [hasAudioErrors, setHasAudioErrors] = useState(false);
    const [activeSpeakerId, setActiveSpeakerId] = useState(null);
    const [interviewSummary, setInterviewSummary] = useState(null);

    const mediaRecorderRef = useRef();
    const audioChunksRef = useRef([]);
    const websocketRef = useRef();
    const audioRef = useRef(new Audio());
    const questionsRef = useRef([]);
    const currentQuestionRef = useRef(0);
    const summaryTimeoutRef = useRef(null);

    const participants = [
        { id: 1, name: "Sarah Chen", role: "Technical Lead", isActive: true, avatar: "SC", color: "#667eea" },
        { id: 2, name: "David Rodriguez", role: "Engineering Manager", isActive: true, avatar: "DR", color: "#764ba2" },
        { id: 3, name: "Priya Patel", role: "Senior Developer", isActive: true, avatar: "PP", color: "#f093fb" },
        { id: 4, name: "You", role: "Candidate", isActive: true, isYou: true, avatar: "You", color: "#4fd1c5" }
    ];

    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const roleParam = urlParams.get('role');
        setRole(roleParam || 'Software Engineer');

        initializeMedia();
        return () => {
            if (websocketRef.current) websocketRef.current.close();
            if (summaryTimeoutRef.current) clearTimeout(summaryTimeoutRef.current);
        };
    }, []);

    useEffect(() => {
        let timer;
        if (interviewState === 'in-progress') {
            timer = setInterval(() => setTimeElapsed(prev => prev + 1), 1000);
        }
        return () => clearInterval(timer);
    }, [interviewState]);

    useEffect(() => {
        questionsRef.current = questions;
    }, [questions]);

    useEffect(() => {
        currentQuestionRef.current = currentQuestion;
    }, [currentQuestion]);

    const initializeMedia = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });
            setUserStream(stream);
        } catch (error) {
            console.error('Error accessing microphone:', error);
        }
    };

    const setupWebSocket = () => {
        setLoading(true);
        const wsUrl = 'ws://localhost:5100';
        websocketRef.current = new WebSocket(wsUrl);

        websocketRef.current.onopen = () => {
            console.log('WebSocket open');
            websocketRef.current.send(JSON.stringify({ type: 'SETUP', role }));
        };

        websocketRef.current.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                handleWebSocketMessage(message);
            } catch (error) {
                console.error('Error parsing message:', error);
            }
        };

        websocketRef.current.onerror = (error) => {
            console.error('WebSocket error:', error);
            setFeedback([{ type: 'error', message: 'Connection error. Please try again.' }]);
            setLoading(false);
        };

        websocketRef.current.onclose = () => {
            console.log('WebSocket closed');
            setLoading(false);
        };
    };

    const handleWebSocketMessage = (message) => {
        switch (message.type) {
            case 'QUESTIONS_READY':
                setQuestions(message.questions || []);
                setTotalQuestions(message.totalQuestions ?? (message.questions?.length ?? 0));
                setHasAudioErrors(!!message.hasAudioErrors);
                setLoading(false);
                startInterview();
                break;

            case 'QUESTION_AUDIO':
                playQuestionAudio(message);
                break;

            case 'TRANSCRIPT':
                console.log('Transcript:', message.transcript);
                break;

            case 'REALTIME_FEEDBACK':
                setFeedback(prev => [
                    ...prev,
                    {
                        type: 'feedback',
                        message: message.feedback.aiFeedback,
                        timestamp: new Date().toLocaleTimeString()
                    }
                ]);
                break;

            case 'SUMMARY':
                console.log('📥 [Frontend] Summary message received from server:', message);

                if (!message.feedback) {
                    console.warn('⚠️ [Frontend] Summary feedback is missing or null:', message);
                } else {
                    console.log('✅ [Frontend] Summary feedback content:', message.feedback);
                }

                setInterviewSummary(message.feedback);

                // Store in localStorage for results page
                localStorage.setItem("interviewSummary", JSON.stringify(message.feedback));

                setTimeout(() => {
                    window.location.href = '/results';
                }, 20000);
                break;

            case 'INTERVIEW_COMPLETE':
                // Server acknowledges completion, but we wait for summary
                console.log('Server acknowledged interview completion');
                break;

            case 'ERROR':
                console.error('Backend error:', message.error);
                setFeedback([{ type: 'error', message: 'Server error. Please try again.' }]);
                setLoading(false);
                break;

            default:
                console.log('Unknown WS message:', message);
        }
    };

    const playQuestionAudio = (message) => {
        const { audioData, questionIndex, format } = message;

        const interviewerId = (questionIndex % 3) + 1;
        setActiveSpeakerId(interviewerId);

        try {
            if (audioRef.current) {
                audioRef.current.pause();
                if (audioRef.current.src) URL.revokeObjectURL(audioRef.current.src);
            }

            const mimeType = format === 'base64_webm' ? 'audio/webm' : 'audio/wav';
            const audioBlob = base64ToBlob(audioData, mimeType);

            const audioUrl = URL.createObjectURL(audioBlob);
            audioRef.current.src = audioUrl;
            audioRef.current.onended = () => {
                setActiveSpeakerId(null);
                startRecording();
            };
            audioRef.current.play();
        } catch (error) {
            console.error('Error playing audio:', error);
            speakQuestionText(questionsRef.current[questionIndex], questionIndex);
        }
    };

    const speakQuestionText = (questionText, questionIndex) => {
        const interviewerId = (questionIndex % 3) + 1;
        setActiveSpeakerId(interviewerId);
        const utterance = new SpeechSynthesisUtterance(questionText);
        utterance.onend = () => { setActiveSpeakerId(null); startRecording(); };
        window.speechSynthesis.speak(utterance);
    };

    const base64ToBlob = (base64, mimeType) => {
        const byteCharacters = atob(base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) byteNumbers[i] = byteCharacters.charCodeAt(i);
        const byteArray = new Uint8Array(byteNumbers);
        return new Blob([byteArray], { type: mimeType });
    };

    const startRecording = () => {
        if (!userStream || !isAudioEnabled) return;
        try {
            let options = { mimeType: 'audio/webm;codecs=opus' };
            mediaRecorderRef.current = new MediaRecorder(userStream, options);

            audioChunksRef.current = [];
            mediaRecorderRef.current.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            mediaRecorderRef.current.onstop = () => {
                const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
                sendFullResponse(blob);
            };

            mediaRecorderRef.current.start();
            setIsRecording(true);

            setTimeout(() => {
                if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
                    stopRecording();
                    handleQuestionComplete();
                }
            }, 20000);
        } catch (error) {
            console.error('Error starting recording:', error);
        }
    };

    const sendFullResponse = async (blob) => {
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const arrayBuffer = reader.result;
                const uint8Array = new Uint8Array(arrayBuffer);

                let binary = '';
                const chunkSize = 0x8000;
                for (let i = 0; i < uint8Array.length; i += chunkSize) {
                    const chunk = uint8Array.subarray(i, i + chunkSize);
                    binary += String.fromCharCode.apply(null, chunk);
                }
                const audioBase64 = btoa(binary);

                const ws = websocketRef.current;
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        type: "AUDIO_RESPONSE",
                        audioData: audioBase64,
                        questionIndex: currentQuestionRef.current,
                        questionText: questions[currentQuestionRef.current],
                    }));
                }
            } catch (err) {
                console.error("Error sending full response:", err);
            }
        };
        reader.readAsArrayBuffer(blob);
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
        }
        setIsRecording(false);
    };

    const startInterview = () => {
        setInterviewState('in-progress');
        setTimeElapsed(0);
        setCurrentQuestion(0);
        requestQuestion(0);
    };

    const requestQuestion = (index) => {
        if (websocketRef.current && websocketRef.current.readyState === WebSocket.OPEN) {
            websocketRef.current.send(JSON.stringify({ type: 'REQUEST_QUESTION', questionIndex: index }));
        }
    };

    const handleQuestionComplete = () => {
        stopRecording();

        const curr = currentQuestionRef.current;
        const next = curr + 1;
        if (next < questionsRef.current.length) {
            setCurrentQuestion(next);
            setTimeout(() => requestQuestion(next), 2000);
        }
        else {
            completeInterview();
        }
    };
    const completeInterview = () => {
        stopRecording();

        const ws = websocketRef.current;
        if (ws && ws.readyState === WebSocket.OPEN) {
            console.log("📤 [Frontend] Sending INTERVIEW_COMPLETE to server...");
            ws.send(JSON.stringify({ type: 'INTERVIEW_COMPLETE' }));
            summaryTimeoutRef.current = setTimeout(() => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.close();
                }
                setInterviewState('completed');
            }, 20000);
        }
        else {
            console.error("❌ [Frontend] WebSocket not open, cannot request summary");
            setInterviewState('completed');
        }
    };

    const toggleAudio = async () => {
        if (!userStream) return;
        if (isAudioEnabled) {
            userStream.getAudioTracks().forEach(track => track.stop());
            setUserStream(new MediaStream()); // empty stream
        } else {
            try {
                const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                setUserStream(audioStream);
            } catch (err) {
                console.error('Error enabling microphone:', err);
            }
        }
        setIsAudioEnabled(!isAudioEnabled);
    };

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const getGridLayout = (count) => {
        if (count <= 2) return '1fr 1fr';
        return '1fr 1fr';
    };
    return (
        <div className="interview-room-container">
            <div className="interview-room-content">
                {interviewState === 'preparing' && (
                    <div className="preparation-screen">
                        <div className="preparation-card">
                            <div className="card-header">
                                <h2>Virtual Interview Room</h2>
                                <p className="setup-subtitle">Get ready for your professional interview</p>
                            </div>

                            <div className="meet-preview">
                                <h3>Meeting Participants</h3>
                                <div
                                    className="participants-grid preview"
                                    style={{ gridTemplateColumns: getGridLayout(participants.length) }}
                                >
                                    {participants.map((participant) => (
                                        <div key={participant.id} className="participant-tile">
                                            <div
                                                className="participant-avatar"
                                                style={{ backgroundColor: participant.color }}
                                            >
                                                {participant.avatar}
                                            </div>
                                            <div className="participant-info">
                                                <div className="participant-name">{participant.name}</div>
                                                <div className="participant-role">{participant.role}</div>
                                            </div>
                                            {participant.isYou && <span className="you-badge">You</span>}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="setup-instructions">
                                <h4>Interview Guidelines</h4>
                                <ul>
                                    <li>Ensure good lighting and professional background</li>
                                    <li>Test your microphone and camera beforehand</li>
                                    <li>Listen carefully to each question</li>
                                    <li>Answer naturally - we provide real-time feedback</li>
                                    <li>Total duration: approximately 15-20 minutes</li>
                                </ul>
                            </div>
                            
                            {hasAudioErrors && (
                                <div className="warning-message">
                                    ⚠️ Some audio couldn't be generated. The interview will use text-to-speech as fallback.
                                </div>
                            )}
                            
                            <button
                                onClick={setupWebSocket}
                                disabled={!userStream || loading}
                                className="join-meeting-btn primary-button"
                            >
                                {loading ? 'Setting up the meeting' :
                                    !userStream ? 'Waiting for microphone access...' : 'Join Meeting'}
                            </button>
                        </div>
                    </div>
                )}

                {interviewState === 'in-progress' && (
                    <div className="active-interview-screen">
                        <div className="meeting-header">
                            <div className="meeting-info">
                                <span className="meeting-title">{role} Interview</span>
                                <span className="meeting-time">⏱️ {formatTime(timeElapsed)}</span>
                                <span className="question-counter">Question {currentQuestion + 1} of {questions.length}</span>
                            </div>

                            <div className="meeting-controls">
                                <button
                                    onClick={() => {
                                        if (window.confirm('Are you sure you want to leave the interview?')) {
                                            window.location.href = '/role-selection';
                                        }
                                    }}
                                    className="control-btn leave-btn"
                                    title="Leave interview"
                                >
                                    📞 Leave
                                </button>
                            </div>
                        </div>
                        
                        <div className="meeting-main">
                            <div
                                className="participants-grid active"
                                style={{ gridTemplateColumns: getGridLayout(participants.length) }}
                            >
                                {participants.map((participant) => (
                                    <div
                                        key={participant.id}
                                        className={`participant-video-tile ${(activeSpeakerId === participant.id) ? 'active-speaker' : ''
                                            } ${(participant.isYou && isRecording) ? 'active-speaker' : ''}`}
                                    >
                                        <div className="participant-placeholder">
                                            <div
                                                className="participant-avatar large"
                                                style={{ backgroundColor: participant.color }}
                                            >
                                                {participant.avatar}
                                            </div>
                                        </div>

                                        <div className="participant-overlay">
                                            <span className="participant-name">{participant.name}</span>
                                            <span className="participant-role">{participant.role}</span>
                                            {(activeSpeakerId === participant.id) && (
                                                <div className="speaking-indicator">
                                                    <div className="speaking-dot"></div>
                                                    <span>Speaking</span>
                                                </div>
                                            )}
                                            {participant.isYou && isRecording && (
                                                <div className="speaking-indicator">
                                                    <div className="speaking-dot"></div>
                                                    <span>Speaking</span>
                                                </div>
                                            )}
                                            {participant.isYou && (
                                                <div className="you-indicator">You</div>
                                            )}
                                        </div>

                                        {activeSpeakerId === participant.id && (
                                            <div className="active-speaker-overlay">
                                                <div className="pulse-ring"></div>
                                                <span>Asking question...</span>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>

                            <div className="meeting-sidebar">
                                <div className="current-question-panel">
                                    <h4>Current Question</h4>
                                    {questions.length > 0 && currentQuestion < questions.length && (
                                        <div className="question-text">
                                            {questions[currentQuestion]}
                                        </div>
                                    )}
                                </div>

                                <div className="feedback-panel">
                                    <h4>Real-time Feedback</h4>
                                    <RealTimeFeedback feedback={feedback} />
                                </div>
                            </div>
                        </div>
                    </div>
                )}
                
                {interviewState === 'completed' && (
                    <div className="completion-screen">
                        <div className="completion-card">
                            <div className="success-animation">
                                <div className="checkmark">✓</div>
                            </div>

                            <h2>Interview Completed</h2>
                            <p className="completion-message">
                                You've successfully finished your mock interview. 
                                You will be redirected to your results shortly.
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default InterviewRoom;