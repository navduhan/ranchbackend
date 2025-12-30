const express = require ('express')
const cors = require ('cors')
const db = require('./src/db')
const app = express()
const apiPort = 3603
const fileUpload = require('express-fileupload');

const routes =require('./src/routes/species-routes')
app.use(express.urlencoded({extended:true}))

app.use(express.json())
app.use(fileUpload({
  createParentPath: true
}));

// app.use(require("./routes/species-routes"));
db.on('error', console.error.bind(console, 'MongoDB connection error:'))

// app.get('/', (req,res)=>{
//     res.send('Hello World')
// })
const accessControl = (req, res,next) => {
const allowedOrigins = [
    'http://127.0.0.1:3603', 'http://localhost:3603', 'https://bioinfo.usu.edu', 'https://kaabil.net'
  ];
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, KBL-User-Agent');
  res.header('Access-Control-Allow-Credentials', 'true');
  return next();
}

app.use(accessControl)

// Allows other domains to use this domain as an API
const originsWhitelist = [
  'http://127.0.0.1:3603', 'http://localhost:3603', 'http://localhost:3603'
];
const corsOptions = {
  origin: (origin, callback) => {
    if (origin && originsWhitelist.indexOf(origin) >= -1) {
      return callback(null, true);
    }

    const error = new Error('CORS Error');

    return callback(error, false);
  }
}

const cOpt = {
  origin: 'http://localhost:3603',
  credentials: true
}



app.use("/api", routes)

app.listen(apiPort, ()=> console.log(`Server runnning on port ${apiPort}`))




