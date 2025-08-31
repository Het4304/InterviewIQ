const axios = require('axios');

class VoiceService {
  constructor() {
    this.voices = null;
    this.lastFetched = null;
    this.cacheDuration = 24 * 60 * 60 * 1000;
  }

  async getVoices() {
    if (this.voices && this.lastFetched && (Date.now() - this.lastFetched) < this.cacheDuration) {
      return this.voices;
    }

    try {
      // console.log('Fetching available voices from Murf API...');
      const response = await axios.get('https://api.murf.ai/v1/speech/voices', {
        headers: {
          'api-key': process.env.MURF_API_KEY,
        },
      });

      this.voices = response.data;
      this.lastFetched = Date.now();
      
      // console.log(`Found ${this.voices.length} available voices`);
      // const englishVoices = this.voices.filter(voice => 
      //   voice.locale && voice.locale.startsWith('en')
      // ).slice(0, 5);
      
      // englishVoices.forEach((voice, index) => {
      //   console.log(`English Voice ${index + 1}: ${voice.voiceId} - ${voice.displayName} (${voice.gender})`);
      // });
      
      return this.voices;
    } catch (error) {
      console.error('Error fetching voices from Murf:', error.response?.data || error.message);
      throw new Error('Failed to fetch available voices');
    }
  }

  async findVoiceIdByName(name) {
    const voices = await this.getVoices();
    
    if (!Array.isArray(voices)) {
      console.error('Voices is not an array:', voices);
      return null;
    }

    // Search through voiceId and displayName fields
    const voice = voices.find(v => 
      (v.voiceId && v.voiceId.toLowerCase().includes(name.toLowerCase())) ||
      (v.displayName && v.displayName.toLowerCase().includes(name.toLowerCase()))
    );
    
    return voice ? voice.voiceId : null;
  }

  async getRandomVoice(language = 'en', gender = null) {
    const voices = await this.getVoices();
    
    if (!Array.isArray(voices)) {
      throw new Error('Voices data is not available');
    }

    const filtered = voices.filter(voice => {
      let matches = voice.locale && voice.locale.toLowerCase().startsWith(language.toLowerCase());
      
      if (gender && voice.gender) {
        matches = matches && voice.gender.toLowerCase() === gender.toLowerCase();
      }
      return matches;
    });

    if (filtered.length === 0) {
      throw new Error(`No voices found for language: ${language}, gender: ${gender}`);
    }

    const selectedVoice = filtered[Math.floor(Math.random() * filtered.length)];
    return selectedVoice.voiceId;
  }

  async getVoicesByLanguage(language = 'en') {
    const voices = await this.getVoices();
    return voices.filter(voice => 
      voice.locale && voice.locale.toLowerCase().startsWith(language.toLowerCase())
    );
  }
  
  async getVoicesByGender(gender = 'female') {
    const voices = await this.getVoices();
    return voices.filter(voice => 
      voice.gender && voice.gender.toLowerCase() === gender.toLowerCase()
    );
  }
}

const voiceService = new VoiceService();
module.exports = voiceService;