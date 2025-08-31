const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();
const http = require('http');
const jwt = require('jsonwebtoken'); 
const User = require('./models/User'); 
const setupWebSocket = require('./WebSocketServer');
const voiceService = require('./services/voiceService');
const authRoutes = require('./routes/authRoutes');
const realtimeRoutes = require("./routes/realtime");

const app = express();
const port = process.env.PORT || 5100;

// **1. Create an HTTP Server from your Express app**
const server = http.createServer(app);

// **2. Enhanced CORS configuration**
app.use(cors({
  origin: 'http://localhost:3000', // Your React app URL
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Your existing Express middleware and routes
app.use(express.json());

// MongoDB Connection - wait for connection before starting server
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/interviewiq', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => {
    console.log("MongoDB connected successfully");
    
    // Initialize voice service after DB connection
    voiceService.getVoices()
      .then(() => console.log('Voice service initialized successfully'))
      .catch(err => console.error('Failed to initialize voice service:', err));

    // Setup WebSocket after DB connection
    setupWebSocket(server);
    app.use("/realtime", realtimeRoutes);
    // Auth routes
    app.use('/api/auth', authRoutes);

    app.get('/', (req, res) => {
      res.send('InterviewIQ Backend is Running!');
    });

    app.get('/api/auth/me', async (req, res) => {
      try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) {
          return res.status(401).json({ message: 'No token provided' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        const user = await User.findById(decoded.userId).select('-password');
        
        if (!user) {
          return res.status(404).json({ message: 'User not found' });
        }

        res.json({ user });
      } catch (error) {
        console.error('Auth me error:', error);
        res.status(401).json({ message: 'Invalid token' });
      }
    });

    // **Start the server only after DB connection**
    server.listen(port, () => {
      console.log(`Server and WebSocket are running on port: ${port}`);
    });
})
.catch(err => {
    console.error("MongoDB connection error: ", err);
    process.exit(1); // Exit if DB connection fails
});