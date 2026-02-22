const fs = require('fs/promises');
const path = require('path');
const { promisify } = require('util');
const { execFile } = require('child_process');

const execFileAsync = promisify(execFile);
const runtime = require('../config/runtime');

const parsePredictionOutput = (raw) => {
  const cells = raw.split('\n').map((el) => el.trim().split(/\s+/));
  const headings = cells.shift() || [];

  const rows = cells.filter((row) => row.length > 1 && row[0] !== '');
  return rows.map((row) => {
    const out = {};
    for (let i = 0; i < row.length; i += 1) {
      out[headings[i]] = Number.isNaN(Number(row[i])) ? row[i] : Number(row[i]);
    }
    return out;
  });
};

const runPrediction = async (id, filedata, minRepeat, maxRepeat, mono, all) => {
  const outPrefix = path.join(runtime.PREDDATA_DIR, `pred${id}`);
  const script = path.join(__dirname, 'MicroSatMiner.pl');
  const outputFile = `${outPrefix}.ssr.txt`;

  await execFileAsync(runtime.PERL_BIN, [
    script,
    '-i',
    filedata,
    '-min',
    String(minRepeat),
    '-max',
    String(maxRepeat),
    '-ml',
    String(mono),
    '-t',
    String(all),
    '-sp',
    outPrefix,
  ]);

  try {
    const raw = await fs.readFile(outputFile, 'utf8');
    return JSON.stringify(parsePredictionOutput(raw));
  } finally {
    await fs.unlink(outputFile).catch(() => {});
  }
};

module.exports = runPrediction
