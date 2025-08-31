const WebSocket = require('ws');
const { generateQuestions, generateQuestionAudio } = require('./controllers/interviewController');
const fs = require('fs');
const path = require('path');
const VocalAnalysisService = require('./services/vocalAnalysisService');
const mongoose = require('mongoose'); 

const interviewSessionSchema = new mongoose.Schema({
  role: String,
  questions: [String],
  transcriptHistory: [{}],
  summary: [{}],
  timestamp: { type: Date, default: Date.now }
});


const InterviewSession =
  mongoose.models.InterviewSession || mongoose.model('InterviewSession', interviewSessionSchema);


function setupWebSocket(server) {
  const wss = new WebSocket.Server({ server });

  wss.on('connection', (ws) => {
    console.log('New client connected for interview practice');

    const session = {
      currentQuestionIndex: 0,
      questions: [],
      role: null,
      audioFiles: [],
      analysisService: new VocalAnalysisService()
    };

    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data);
        await handleClientMessage(ws, message, session);
      } catch (error) {
        console.error('Error parsing message:', error);
        ws.send(JSON.stringify({ type: 'ERROR', error: 'Invalid message format' }));
      }
    });

    ws.on('close', () => {
      console.log('Client disconnected');
      cleanupAudioFiles(session.audioFiles);
    });

    ws.send(JSON.stringify({ type: 'connection_ack', message: 'WS Connected for InterviewIQ' }));
  });
}

async function handleClientMessage(ws, message, session) {
  switch (message.type) {
    case 'SETUP':
      console.log('Setting up interview for role:', message.role);
      session.role = message.role;

      try {
        session.questions = await generateQuestions(message.role);
        console.log('[SERVER] generated questions:', session.questions.length);

        session.audioFiles = [];
        const audioResults = [];
        let hasAudioErrors = false;

        for (let i = 0; i < session.questions.length; i++) {
          const question = session.questions[i];
          const audioResult = await generateQuestionAudio(question, i);
          audioResults.push(audioResult);

          if (audioResult.filepath) {
            session.audioFiles.push(audioResult.filepath);
          } else {
            hasAudioErrors = true;
            console.warn(`Audio generation failed for question ${i + 1}`);
          }
        }

        ws.send(JSON.stringify({
          type: 'QUESTIONS_READY',
          questions: session.questions,
          totalQuestions: session.questions.length,
          audioFiles: audioResults.map(result => result.filename),
          hasAudioErrors: hasAudioErrors
        }));

      } catch (error) {
        console.error('Error setting up interview:', error);
        ws.send(JSON.stringify({
          type: 'ERROR',
          message: 'Failed to generate questions or audio. Please try again.'
        }));
      }
      break;

    case 'REQUEST_QUESTION':
      console.log('Client requested question:', message.questionIndex);
      await sendQuestion(ws, session, message.questionIndex);
      break;

    case 'AUDIO_RESPONSE':
      try {
        const result = await session.analysisService.processQuestionResponse(
          message.audioData,
          message.questionIndex,
        );

        if (result.transcript) {
          ws.send(JSON.stringify({
            type: 'TRANSCRIPT',
            transcript: result.transcript,
            questionIndex: message.questionIndex
          }));

          const aiFeedback = await session.analysisService.getRealtimeFeedback(
            result.transcript,
            result.audioResults,
            message.questionText
          );

          // 🔹 Save transcript + question for final summary
          if (!session.analysisService.transcriptHistory) {
            session.analysisService.transcriptHistory = [];
          }
          session.analysisService.transcriptHistory.push({
            question: message.questionText || session.questions[message.questionIndex] || "(Unknown question)",
            transcript: result.transcript
          });

          ws.send(JSON.stringify({
            type: 'REALTIME_FEEDBACK',
            feedback: {
              aiFeedback,
              transcript: result.transcript,
              question: message.questionText
            },
            questionIndex: message.questionIndex
          }));
        }
      } catch (error) {
        console.error('Error processing audio response:', error);
      }
      break;
    case 'INTERVIEW_COMPLETE':
      try {
        console.log('Interview completed by client, generating final summary...');

        const summary = await session.analysisService.getSummary();
        const interviewSession = new InterviewSession({
          role: session.role,
          questions: session.questions,
          transcriptHistory: session.analysisService.transcriptHistory,
          summary: summary
        });
    
        await interviewSession.save();
        console.log('✅ Interview session saved to MongoDB');
    
        // Save also in localStorage (frontend can pull)
        ws.send(JSON.stringify({
          type: 'SUMMARY',
          feedback: { result: summary }
        }));

        cleanupAudioFiles(session.audioFiles);
        session.currentQuestionIndex = 0;
        session.analysisService.reset();

      } catch (error) {
        console.error('Error generating final summary:', error);
        ws.send(JSON.stringify({
          type: 'SUMMARY',
          feedback: { type: 'error', message: 'Failed to generate final summary' }
        }));
      }
      break;

    default:
      console.log('Unknown message type:', message.type);
      ws.send(JSON.stringify({
        type: 'ERROR',
        message: `Unknown message type: ${message.type}`
      }));
  }
}

async function sendQuestion(ws, session, questionIndex) {
  if (questionIndex >= session.questions.length) {
    ws.send(JSON.stringify({
      type: 'INTERVIEW_COMPLETE',
      message: 'Congratulations! You have completed all the questions.'
    }));
    return;
  }

  const question = session.questions[questionIndex];
  const audioFilePath = session.audioFiles[questionIndex];

  try {
    const audioData = fs.readFileSync(audioFilePath, { encoding: 'base64' });

    ws.send(JSON.stringify({
      type: 'QUESTION_AUDIO',
      audioData: audioData,
      questionIndex: questionIndex,
      questionText: question,
      format: 'base64_wav'
    }));

  } catch (error) {
    console.error('Error reading audio file:', error);
    ws.send(JSON.stringify({
      type: 'AUDIO_ERROR',
      message: 'Could not load audio for this question.',
      questionIndex: questionIndex
    }));
  }
}

function cleanupAudioFiles(audioFiles) {
  audioFiles.forEach(filePath => {
    if (fs.existsSync(filePath)) {
      fs.unlink(filePath, (err) => {
        if (err) console.error('Error deleting audio file:', err);
      });
    }
  });
}

module.exports = setupWebSocket;