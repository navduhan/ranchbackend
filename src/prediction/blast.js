const fs = require('fs/promises');
const path = require('path');
const { promisify } = require('util');
const { execFile } = require('child_process');

const execFileAsync = promisify(execFile);
const runtime = require('../config/runtime');
const BLAST_BIN_DIR = runtime.BLAST_BIN_DIR;
const ALLOWED_PROGRAMS = new Set(['blastn', 'blastp', 'blastx', 'tblastn', 'tblastx']);

const parseBlastOutput = (raw) => {
  const cells = raw.split('\n').map((el) => el.trim().split(/\s+/));
  const headings = ['qseqid', 'sseqid', 'pident', 'length', 'mismatch', 'gapopen', 'qstart', 'qend', 'sstart', 'send', 'evalue', 'bitscore'];
  const rows = cells.filter((row) => row.length > 1 && row[0] !== '');

  return rows.map((row) => {
    const out = {};
    for (let i = 0; i < row.length; i += 1) {
      out[headings[i]] = Number.isNaN(Number(row[i])) ? row[i] : Number(row[i]);
    }
    return out;
  });
};

const runBlast = async (id, filedata, program, genome, word, target, evalue) => {
  if (!ALLOWED_PROGRAMS.has(program)) {
    throw new Error('Invalid BLAST program');
  }

  const binary = path.join(BLAST_BIN_DIR, program);
  const dbPath = path.join(runtime.DATA_DIR, genome);
  const outFile = path.join(runtime.PREDDATA_DIR, `pred${id}.out.tsv`);

  await execFileAsync(binary, [
    '-db',
    dbPath,
    '-query',
    filedata,
    '-max_target_seqs',
    String(target),
    '-word_size',
    String(word),
    '-evalue',
    String(evalue),
    '-num_threads',
    '20',
    '-outfmt',
    '6',
    '-out',
    outFile,
  ]);

  try {
    const raw = await fs.readFile(outFile, 'utf8');
    return JSON.stringify(parseBlastOutput(raw));
  } finally {
    await fs.unlink(outFile).catch(() => {});
  }
};

module.exports = runBlast;
