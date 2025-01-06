const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const churchRoutes = require('./routes/church');
const eventRoutes = require('./routes/events');
const kidRoutes = require('./routes/kid');
dotenv.config();

const app = express();
const cors = require('cors');
app.use(cors());

app.use(express.json());

const PORT = process.env.PORT || 5500;

mongoose.connect(process.env.MONGO_URI).then(() => {
    console.log('Connected to MongoDB');
    app.listen(PORT, () => {
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

