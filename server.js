const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const {logAuditTrails} = require('./middlewares/audits');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const churchRoutes = require('./routes/church');
const eventRoutes = require('./routes/events');
const kidRoutes = require('./routes/kid');
const auditRoutes = require('./routes/audit');
const checkinRoutes = require('./routes/checkin');
dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const cors = require('cors');
app.use(cors());
app.use(express.json());
app.use(logAuditTrails);

const PORT = process.env.PORT || 5500;

mongoose.connect(process.env.MONGO_URI).then(() => {
    console.log('Connected to MongoDB');
    // Emit updates to connected clients
    io.on('connection', (socket) => {
        console.log('A client connected:', socket.id);
    
        // Example: Emit real-time update
        setInterval(() => {
        socket.emit('dataUpdated', { message: 'This is a real-time update', timestamp: new Date() });
        }, 5000); // Emit every 5 seconds
    
        socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        });
    });
    server.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}).catch(err => {
    console.error(err);
});
// server.js
app.use('/auth', authRoutes);
app.use('/user', userRoutes);
app.use('/church', churchRoutes);
app.use('/event', eventRoutes);
app.use('/kid', kidRoutes);
app.use('/audit', auditRoutes);
app.use('/checkin', checkinRoutes);

