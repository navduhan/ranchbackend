const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const { promisify } = require('util');
const { execFile } = require('child_process');

const execFileAsync = promisify(execFile);
const runtime = require('../config/runtime');
const PRIMERSEARCH_BIN = runtime.PRIMERSEARCH_BIN;

const runEPCR = async (item, seq, mismatch, genome) => {
  const workdir = await fs.mkdtemp(path.join(os.tmpdir(), 'ranch-epcr-'));

  try {
    const pinputFile = path.join(workdir, 'pinput.txt');
    const seqFile = path.join(workdir, 'dnaseq.fa');
    const outFile = path.join(workdir, 'result.txt');

    const csvString = [
      ['Primer1', item.f1, item.r1],
      ['Primer2', item.f2, item.r2],
      ['Primer3', item.f3, item.r3],
    ].map((e) => e.join('\t')).join('\n');

    await fs.writeFile(pinputFile, csvString, 'utf8');

    const sequence = seq && seq.trim() !== ''
      ? (await fs.writeFile(seqFile, seq, 'utf8'), seqFile)
      : path.join(runtime.DATA_DIR, genome);

    await execFileAsync(PRIMERSEARCH_BIN, [
      '-infile',
      pinputFile,
      '-seqall',
      sequence,
      '-mismatchpercent',
      String(mismatch),
      '-outfile',
      outFile,
    ]);

    return fs.readFile(outFile, 'utf8');
  } finally {
    await fs.rm(workdir, { recursive: true, force: true });
  }
};

module.exports = runEPCR;
