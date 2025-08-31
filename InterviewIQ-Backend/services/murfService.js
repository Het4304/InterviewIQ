const WebSocket = require('ws');

class MurfWebSocketClient {
  constructor() {
    this.ws = null;
    this.audioBuffer = [];
    this.resolveAudioPromise = null;
    this.isConnected = false;
    this.contextId = null;
  }

  async connect(voiceId = 'en-US-cooper', style = 'Conversational') {
    return new Promise((resolve, reject) => {
      const wsUrl = `wss://api.murf.ai/v1/speech/stream-input?api-key=${process.env.MURF_API_KEY}&sample_rate=44100&channel_type=MONO&format=WAV`;

      console.log(`Connecting to Murf`);
      this.ws = new WebSocket(wsUrl);

      this.ws.on('open', () => {
        console.log('✅ Connected to Murf WebSocket API');
        this.isConnected = true;
        this.audioBuffer = [];
        this.contextId = null;

        const voiceConfigMessage = {
          voice_config: {
            voiceId,
            style,
            rate: 0,
            pitch: 0,
            variation: 1,
            sampleRate: 44100,
            format: 'WAV',
            channelType: 'MONO'
          }
        };

        this.ws.send(JSON.stringify(voiceConfigMessage));
        resolve();
      });

      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data);

          if (message.error) {
            console.error('❌ Murf error:', message.error);
            if (this.resolveAudioPromise) {
              this.resolveAudioPromise(null);
              this.resolveAudioPromise = null;
            }
            return;
          }

          if (message.context_id) {
            this.contextId = message.context_id;
          }

          if (message.audio) {
            this.audioBuffer.push(message.audio);
          }

          if (message.final === true || message.isFinalAudio === true) {
            console.log('✅ Received final audio from Murf');
            this._finalizeAudio();
          }

        } catch (error) {
          console.error('Error parsing message as JSON:', error);
        }
      });

      this.ws.on('error', (error) => {
        console.error('WebSocket error:', error.message);
        reject(error);
      });

      this.ws.on('close', () => {
        console.log('WebSocket connection closed');
        this.isConnected = false;
        this.contextId = null;
      });
    });
  }

  async textToSpeech(text, voiceId = 'en-US-cooper', style = 'Conversational') {
    if (!this.isConnected) {
      await this.connect(voiceId, style);
    }

    return new Promise((resolve) => {
      this.resolveAudioPromise = resolve;
      this.audioBuffer = [];

      const textMessage = {
        text,
        end: true
      };

      // console.log('📤 Sending text to Murf:', text.substring(0, 50) + '...');
      this.ws.send(JSON.stringify(textMessage));

      setTimeout(() => {
        if (this.resolveAudioPromise) {
          console.warn('⏰ Timeout (15s) - finalizing with received audio');
          this._finalizeAudio();
        }
      }, 15000);
    });
  }

  _finalizeAudio() {
    if (!this.resolveAudioPromise) return;

    if (this.audioBuffer.length > 0) {
      const buffers = this.audioBuffer.map(chunk => Buffer.from(chunk, 'base64'));
      const completeBuffer = Buffer.concat(buffers);
      const completeBase64 = completeBuffer.toString('base64');
      this.resolveAudioPromise(completeBase64);
    } else {
      this.resolveAudioPromise(null);
    }

    this.resolveAudioPromise = null;
    this.audioBuffer = [];

    if (this.ws) {
      this.ws.close();
    }
  }
}

module.exports = MurfWebSocketClient;
