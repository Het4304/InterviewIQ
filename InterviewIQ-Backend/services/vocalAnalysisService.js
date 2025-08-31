const { WaveFile } = require('wavefile');
const pitchFinder = require('pitchfinder');
const { Readable } = require('stream');
const ffmpeg = require('fluent-ffmpeg');
const OpenAI = require('openai');
const fs = require("fs");
const tmp = require("tmp");

// ✅ initialize OpenAI client
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

class VocalAnalysisService {
  constructor() {
    this.detectedFillers = new Set(['um', 'uh', 'like', 'you know', 'so', 'actually']);
    this.fillerCount = 0;
    this.pauseCount = 0;
    this.longPauses = 0;
    this.energyHistory = [];
    this.pitchHistory = [];
    this.transcriptHistory = [];
    this.lastFeedbackTime = 0;
    this.feedbackInterval = 20000; // 20 seconds in ms
    this.audioBuffer = Buffer.alloc(0); // Accumulate audio chunks
    this.minAudioLength = 2.0; // Minimum audio length in seconds for transcription
  }

  /**
   * 🔹 Decode WebM/Opus → PCM Buffer using ffmpeg
   */
  async decodeWebmToWav(base64Audio) {
    try {
      const inputBuffer = Buffer.from(base64Audio, "base64");

      // Create temporary file for input
      const inputTempFile = tmp.tmpNameSync({ postfix: ".webm" });
      fs.writeFileSync(inputTempFile, inputBuffer);

      // Create temporary file for output
      const outputTempFile = tmp.tmpNameSync({ postfix: ".wav" });

      return new Promise((resolve, reject) => {
        ffmpeg(inputTempFile)
          .inputFormat("webm")
          .audioCodec("pcm_s16le")
          .audioFrequency(16000) // Set sample rate to 16kHz
          .audioChannels(1) // Mono audio
          .format("wav")
          .on("error", (err) => {
            console.error("FFmpeg error:", err);
            reject(err);
          })
          .on("end", () => {
            try {
              const wavBuffer = fs.readFileSync(outputTempFile);
              resolve(wavBuffer);

              // Cleanup temp files
              fs.unlinkSync(inputTempFile);
              fs.unlinkSync(outputTempFile);
            } catch (fileError) {
              console.error("File read error:", fileError);
              reject(fileError);
            }
          })
          .save(outputTempFile);
      });
    } catch (error) {
      console.error("Audio decoding error:", error);
      throw error;
    }
  }

  /**
   * 🔹 Audio Analysis (volume, pitch, pauses)
   */
  analyzeAudioChunk(wavBuffer) {
    const results = { volume: 0, pitch: 0, isSpeaking: false, isPaused: false };

    try {
      const wav = new WaveFile(wavBuffer);
      wav.toBitDepth('16'); // Ensure 16-bit
      wav.toSampleRate(16000); // Ensure 16kHz sample rate

      const samples = wav.getSamples(true, Int16Array);

      if (!samples || !samples.length) {
        return { ...results, skip: true };
      }

      // RMS volume
      results.volume = this.calculateRMS(samples);
      results.isSpeaking = results.volume > 0.01;

      if (!results.isSpeaking) {
        return { ...results, skip: true };
      }

      // Pitch detection
      const detectPitch = pitchFinder.AMDF({ sampleRate: 16000 });
      results.pitch = detectPitch(samples) || 0;

      // Pause detection
      results.isPaused = results.volume < 0.005 &&
        this.energyHistory.slice(-3).every(v => v < 0.005);

      this.energyHistory.push(results.volume);
      this.pitchHistory.push(results.pitch);

      return results;
    } catch (err) {
      console.error("Audio analysis error:", err);
      return results;
    }
  }

  calculateRMS(samples) {
    const sum = samples.reduce((acc, val) => acc + val * val, 0);
    return Math.sqrt(sum / samples.length) / 32768; // Normalize to 0-1 range
  }

  /**
   * 🔹 Accumulate audio chunks for better transcription
   */
  accumulateAudio(wavBuffer) {
    this.audioBuffer = Buffer.concat([this.audioBuffer, wavBuffer]);

    // Check if we have enough audio (at least 2 seconds)
    const audioLength = this.audioBuffer.length / (16000 * 2); // 16kHz, 16-bit = 2 bytes per sample
    return audioLength >= this.minAudioLength;
  }

  /**
   * 🔹 Whisper transcription (accumulated audio)
   */
  async transcribeAccumulatedAudio() {
    if (this.audioBuffer.length === 0) {
      return '';
    }

    let tmpFile;
    try {
      tmpFile = tmp.tmpNameSync({ postfix: ".wav" });

      // Create proper WAV file header
      const wav = new WaveFile();
      wav.fromScratch(1, 16000, '16', this.audioBuffer);
      fs.writeFileSync(tmpFile, wav.toBuffer());

      console.log(`[Audio Debug] Sending ${this.audioBuffer.length} bytes to Whisper`);

      const response = await openai.audio.transcriptions.create({
        file: fs.createReadStream(tmpFile),
        model: "whisper-1",
        language: "en",
        prompt: "This is an interview response. Transcribe clearly."
      });

      const text = response.text || '';
      console.log(`[Whisper Output] "${text}"`);

      if (text) {
        // this.transcriptHistory.push({
        //   question: "(Unknown question - buffer)",
        //   transcript: text
        // });
        this.audioBuffer = Buffer.alloc(0); // Reset buffer after successful transcription
      }

      return text;
    } catch (err) {
      console.error('Whisper transcription error:', err);
      // Keep the audio buffer for next attempt
      return '';
    } finally {
      if (tmpFile && fs.existsSync(tmpFile)) {
        fs.unlinkSync(tmpFile);
      }
    }
  }

  /**
   * 🔹 Process audio chunk with accumulation
   */
  async processQuestionResponse(base64Audio, questionIndex) {
    try {
      const wavBuffer = await this.decodeWebmToWav(base64Audio);
      const audioResults = this.analyzeAudioChunk(wavBuffer);

      // Always transcribe full blob
      const transcript = await this.transcribeAccumulatedAudioFromBuffer(wavBuffer);

      return { audioResults, transcript };
    } catch (err) {
      console.error('Error processing full response:', err);
      return { audioResults: {}, transcript: '' };
    }
  }

  async transcribeAccumulatedAudioFromBuffer(wavBuffer) {
    let tmpFile;
    try {
      tmpFile = tmp.tmpNameSync({ postfix: ".wav" });
      fs.writeFileSync(tmpFile, wavBuffer);

      const response = await openai.audio.transcriptions.create({
        file: fs.createReadStream(tmpFile),
        model: "whisper-1",
        language: "en"
      });

      const text = response.text || '';
      if (text) this.transcriptHistory.push(text);
      return text;
    } finally {
      if (tmpFile && fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    }
  }

  /**
   * 🔹 Detect fillers in transcript
   */
  analyzeTranscription(transcript) {
    if (!transcript) return null;

    const words = transcript.toLowerCase().split(/\s+/);
    const newFillers = words.filter(word => this.detectedFillers.has(word));

    if (newFillers.length > 0) {
      this.fillerCount += newFillers.length;
      return {
        type: 'filler',
        words: newFillers,
        count: this.fillerCount
      };
    }
    return null;
  }

  async getRealtimeFeedback(transcript, audioMetrics, questionText) {
    if (!transcript || transcript.length < 5) return null;

    try {
      const prompt = `
  You are an AI interview coach.
  
  The interviewer asked:
  "${questionText}"
  
  The candidate answered:
  "${transcript}"
  
  1. Give one short, specific piece of real-time feedback (max 1–2 sentences).  
     - If they are speaking too fast/slow → mention pacing.  
     - If they use many filler words → point it out.  
     - If their answer seems irrelevant → tell them to focus on the actual question.  
     - If it’s strong → praise clarity/structure.  
  
  Do not repeat the same structure every time (no "1. Positive / 2. Suggestion").  
  Only output the feedback sentence.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 60,
        temperature: 0.8
      });

      return response.choices[0].message.content.trim();
    } catch (err) {
      console.error('GPT feedback error:', err);
      return null;
    }
  }


  /**
   * 🔹 Get feedback with timing control
   */
  async maybeGetRealtimeFeedback(transcript, audioMetrics) {
    const now = Date.now();
    if (now - this.lastFeedbackTime < this.feedbackInterval) {
      console.log(`[Realtime Feedback] Skipped (only ${((now - this.lastFeedbackTime) / 1000).toFixed(1)}s since last)`);
      return null;
    }

    if (!transcript || transcript.length < 10) { // Require meaningful transcript
      return null;
    }

    this.lastFeedbackTime = now;
    console.log(`[Realtime Feedback] Sending to GPT: "${transcript}"`);

    const feedback = await this.getRealtimeFeedback(transcript, audioMetrics);
    console.log(`[Realtime Feedback] GPT response: "${feedback}"`);

    return feedback;
  }

  /**
 * 🔹 Final Structured Summary after Interview
 */
  async getSummary() {
    if (this.audioBuffer.length > 0) {
      console.log("[getSummary] Processing leftover audio buffer...");
      await this.transcribeAccumulatedAudio();
    }

    console.log("[getSummary] Transcript history:", this.transcriptHistory);

    const summaries = [];

    for (const item of this.transcriptHistory) {
      // 🔹 Normalize transcriptHistory entries
      let question, transcript;
      if (typeof item === "string") {
        question = "(Unknown question)";
        transcript = item;
      } else {
        question = item.question || "(Unknown question)";
        transcript = item.transcript || "";
      }

      console.log(`[getSummary] Processing item → Q: "${question}" | T: "${transcript}"`);

      if (!transcript || transcript.trim().length < 5) {
        console.log("[getSummary] Skipping too-short transcript");
        continue;
      }

      const improved = await this.getImprovedResponse(question, transcript);
      console.log("[getSummary] getImprovedResponse result:", improved);

      summaries.push({
        question,
        yourResponse: transcript,
        suggestedResponse: improved.suggested,
        pointsToChange: improved.points
      });
    }

    console.log("[getSummary] Final summaries:", summaries);
    return summaries;
  }

  async getImprovedResponse(question, transcript) {
    console.log(`[getImprovedResponse] Called with Q: "${question}" | T: "${transcript}"`);

    if (!transcript || transcript.trim().length < 5) {
      return {
        points: ["Answer too short, expand with more detail."],
        suggested: "Try elaborating more clearly on your experience."
      };
    }
    const prompt = `
    You are an AI interview coach. 
    The interviewer asked:
    "${question}"
    
    The candidate answered:
    "${transcript}"
    
    Return a JSON object with:
    {
      "points": ["list of 2-3 concrete improvements the candidate should make"],
      "suggested": "a polished version of the candidate's answer that is clear, concise, and professional"
    }
    
    Rules:
    - Be supportive and constructive ("You did well, but you can improve by...")
    - Suggestions must be realistic and actionable
    - Suggested response should paraphrase, not invent new content
    - IMPORTANT: Return only valid JSON, no commentary
    `;

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 300,
        temperature: 0.7
      });

      const raw = response.choices[0].message.content.trim();
      console.log("[getImprovedResponse] Raw GPT output:", raw);

      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (err) {
        console.error("❌ JSON parse error in getImprovedResponse, GPT output:", raw);
        parsed = {
          points: ["Could not parse GPT response"],
          suggested: transcript
        };
      }

      console.log("[getImprovedResponse] Parsed JSON:", parsed);
      return parsed;

    } catch (err) {
      console.error("❌ getImprovedResponse error:", err);
      return {
        points: ["Error generating improvements"],
        suggested: transcript
      };
    }
  }



  reset() {
    this.fillerCount = 0;
    this.pauseCount = 0;
    this.longPauses = 0;
    this.energyHistory = [];
    this.pitchHistory = [];
    this.transcriptHistory = [];
    this.audioBuffer = Buffer.alloc(0);
    this.lastFeedbackTime = 0;
  }
}

module.exports = VocalAnalysisService;