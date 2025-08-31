
const OpenAI = require('openai');
const MurfWebSocketClient = require('../services/murfService');
const voiceService = require('../services/voiceService');
const fs = require('fs');
const path = require('path');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Update this function to use the correct voice ID format
async function assignVoiceAndStyle(questionText, index) {
  try {
    const isTechnical = /(experience|project|technical|code|python|java|debug|system)/i.test(questionText);
    const isBehavioral = /(team|conflict|challenge|mistake|goal|behavior|situation)/i.test(questionText);

    let voiceId;
    let name;

    if (isTechnical) {
      // Use a male voice for technical questions
      voiceId = await voiceService.findVoiceIdByName('cooper') ||
        await voiceService.findVoiceIdByName('ryan') ||
        await voiceService.getRandomVoice('en', 'male');
      name = 'Technical Interviewer';
    } else if (isBehavioral) {
      // Use a female voice for behavioral questions
      voiceId = await voiceService.findVoiceIdByName('hazel') ||
        await voiceService.findVoiceIdByName('imani') ||
        await voiceService.getRandomVoice('en', 'female');
      name = 'HR Manager';
    } else {
      // Random English voice for other questions
      voiceId = await voiceService.getRandomVoice('en');
      name = 'Interviewer';
    }

    console.log(`Selected voice for question ${index}: ${voiceId} (${name})`);
    return { voiceId, style: 'Conversational', name };

  } catch (error) {
    console.error('Error assigning voice:', error);
    // Fallback to known working voice IDs
    return { voiceId: 'en-UK-hazel', style: 'Conversational', name: 'Interviewer' };
  }
}

async function generateQuestions(role) {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: `Generate a list of 3 common and relevant behavioral and technical interview questions for a ${role} role. Focus on questions that evaluate teamwork, problem-solving, past experiences, and situational scenarios, while also assessing the technical skills and knowledge required for the role. The questions should encourage the candidate to provide examples from their past work and describe how they’ve applied their technical expertise to overcome challenges. Ensure the questions are designed to test both the candidate’s soft skills (e.g., collaboration, communication) and hard skills (e.g., coding, troubleshooting, technical decisions). Return ONLY a valid JSON object in this exact format: {"questions": ["Question 1?", "Question 2?", "Question 3?"]}`
        }
      ],
      max_tokens: 350,
      response_format: { type: "json_object" }
    });

    const content = completion.choices[0].message.content;
    const questionsData = JSON.parse(content);

    return questionsData.questions;

  } catch (error) {
    console.error('Error generating questions in controller:', error);
    throw new Error('Failed to generate questions: ' + error.message);
  }
}

async function generateQuestionAudio(questionText, index) {
  try {
    const voiceConfig = await assignVoiceAndStyle(questionText, index);
    console.log(`Generating audio for question ${index + 1} with voice: ${voiceConfig.voiceId}`);

    const murfClient = new MurfWebSocketClient();

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Murf API timeout')), 40000)
    );

    const audioBase64 = await Promise.race([
      murfClient.textToSpeech(questionText, voiceConfig.voiceId, voiceConfig.style),
      timeoutPromise
    ]);

    if (!audioBase64) {
      throw new Error('Received null audio data from Murf');
    }

    console.log(`Successfully generated audio, length: ${audioBase64.length} chars`);

    const audioBuffer = Buffer.from(audioBase64, 'base64');
    const filename = `question_${index + 1}_${Date.now()}.wav`;
    const filepath = path.join(__dirname, '..', 'uploads', filename);

    const uploadsDir = path.join(__dirname, '..', 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    fs.writeFileSync(filepath, audioBuffer);
    console.log(`Audio saved to: ${filepath}`);

    return {
      audioData: audioBase64,
      voiceConfig,
      format: 'base64_wav',
      filename,
      filepath
    };

  } catch (error) {
    console.error('Error generating question audio:', error);

    return {
      audioData: null,
      voiceConfig: { name: 'Fallback' },
      format: 'text_only',
      error: error.message
    };
  }
}



module.exports = {
  generateQuestions,
  generateQuestionAudio,
  assignVoiceAndStyle
};