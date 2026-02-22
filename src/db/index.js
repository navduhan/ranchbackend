const mongoose = require('mongoose');
const runtime = require('../config/runtime');

if (process.env.NODE_ENV === 'production' && !process.env.MONGO_URI) {
    throw new Error('MONGO_URI is required in production')
}

const mongoUri = runtime.MONGO_URI;

mongoose
    .connect(mongoUri)
    .catch(e => {
        console.error('Connection error', e.message)
    })

const db = mongoose.connection

module.exports = db
