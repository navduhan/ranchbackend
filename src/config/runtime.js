const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '../..');

const runtime = {
  PORT: Number.parseInt(process.env.PORT || '3603', 10),
  MONGO_URI: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/ranchsatdb',
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)
    : [
        'http://127.0.0.1:3602',
        'http://localhost:3602',
        'https://bioinfo.usu.edu',
        'https://kaabil.net',
      ],
  STRICT_RUNTIME_CHECKS: process.env.STRICT_RUNTIME_CHECKS === 'true',
  PRIMER3_BIN: process.env.PRIMER3_BIN || '/opt/software/primer3/2.6.1/src/primer3_core',
  PRIMERSEARCH_BIN: process.env.PRIMERSEARCH_BIN || '/opt/software/emboss/EMBOSS-6.6.0/emboss/primersearch',
  BLAST_BIN_DIR: process.env.BLAST_BIN_DIR || '/opt/software/ncbi-blast-2.7.1+-src/c++/bin',
  PERL_BIN: process.env.PERL_BIN || 'perl',
  DATA_DIR: process.env.DATA_DIR || path.join(ROOT_DIR, 'src/data'),
  PREDDATA_DIR: process.env.PREDDATA_DIR || path.join(ROOT_DIR, 'src/prediction/preddata'),
};

module.exports = runtime;
