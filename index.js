require('dotenv').config();

const express = require('express')
const cors = require('cors')
const db = require('./src/db')
const fs = require('fs/promises')
const path = require('path')
const runtime = require('./src/config/runtime')
const app = express()
const apiPort = runtime.PORT
const fileUpload = require('express-fileupload');

const routes = require('./src/routes/species-routes')
app.use(express.urlencoded({extended:true}))

app.use(express.json())
app.use(fileUpload({
  createParentPath: true,
  limits: { fileSize: 25 * 1024 * 1024 },
  abortOnLimit: true,
}));

// app.use(require("./routes/species-routes"));
db.on('error', console.error.bind(console, 'MongoDB connection error:'))

// app.get('/', (req,res)=>{
//     res.send('Hello World')
// })
const allowedOrigins = runtime.ALLOWED_ORIGINS;

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('CORS Error'));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'KBL-User-Agent'],
  credentials: true,
}));

const ensureRuntimePaths = async () => {
  const requiredPaths = [
    runtime.PRIMER3_BIN,
    runtime.PRIMERSEARCH_BIN,
    path.join(runtime.BLAST_BIN_DIR, 'blastn'),
    runtime.PREDDATA_DIR,
    runtime.DATA_DIR,
  ];

  const missing = [];
  await Promise.all(requiredPaths.map(async (runtimePath) => {
    try {
      await fs.access(runtimePath);
    } catch (_err) {
      missing.push(runtimePath);
    }
  }));

  if (missing.length > 0) {
    const msg = `Missing runtime paths: ${missing.join(', ')}`;
    if (runtime.STRICT_RUNTIME_CHECKS) {
      throw new Error(msg);
    }
    console.warn(`[WARN] ${msg}`);
  }
};

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'ranchbackend',
    timestamp: new Date().toISOString(),
  });
});



app.use("/api", routes)

ensureRuntimePaths()
  .then(() => {
    if (process.env.JOB_CONCURRENCY === undefined) {
      console.warn('[WARN] Job queue is in-memory; queued/running jobs are lost on restart.');
    }
    app.listen(apiPort, ()=> console.log(`Server runnning on port ${apiPort}`))
  })
  .catch((err) => {
    console.error('Startup runtime check failed:', err.message);
    process.exit(1);
  });
