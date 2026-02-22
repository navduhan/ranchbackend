const { spawn } = require('child_process');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');

const runtime = require('../config/runtime');
const PRIMER3_BIN = runtime.PRIMER3_BIN;

const parsePrimer3Output = (output) => {
  const out = {};
  output.split('\n').forEach((line) => {
    const idx = line.indexOf('=');
    if (idx > 0) {
      const key = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim();
      out[key] = value;
    }
  });

  return {
    f1: out.PRIMER_LEFT_0_SEQUENCE,
    r1: out.PRIMER_RIGHT_0_SEQUENCE,
    f1tm: out.PRIMER_LEFT_0_TM,
    r1tm: out.PRIMER_RIGHT_0_TM,
    f1GC: out.PRIMER_LEFT_0_GC_PERCENT,
    r1GC: out.PRIMER_RIGHT_0_GC_PERCENT,
    p1psize: out.PRIMER_PAIR_0_PRODUCT_SIZE,
    f2: out.PRIMER_LEFT_1_SEQUENCE,
    r2: out.PRIMER_RIGHT_1_SEQUENCE,
    f2tm: out.PRIMER_LEFT_1_TM,
    r2tm: out.PRIMER_RIGHT_1_TM,
    f2GC: out.PRIMER_LEFT_1_GC_PERCENT,
    r2GC: out.PRIMER_RIGHT_1_GC_PERCENT,
    p2psize: out.PRIMER_PAIR_1_PRODUCT_SIZE,
    f3: out.PRIMER_LEFT_2_SEQUENCE,
    r3: out.PRIMER_RIGHT_2_SEQUENCE,
    f3tm: out.PRIMER_LEFT_2_TM,
    r3tm: out.PRIMER_RIGHT_2_TM,
    f3GC: out.PRIMER_LEFT_2_GC_PERCENT,
    r3GC: out.PRIMER_RIGHT_2_GC_PERCENT,
    p3psize: out.PRIMER_PAIR_2_PRODUCT_SIZE,
  };
};

const getPrimers = async (seq, motif_length, minS, maxS, minTM, maxTM, minGC, maxGC, flank) => {
  const excludeStart = Number.parseInt(flank, 10) - 3;
  const excludeEnd = Number.parseInt(motif_length, 10) + 3;
  const excludeRegion = `${excludeStart},${excludeEnd}`;

  const datainput = `SEQUENCE_ID=example\nSEQUENCE_TEMPLATE=${seq}\nPRIMER_TASK=generic\nPRIMER_NUM_RETURN=3
PRIMER_PICK_LEFT_PRIMER=1\nPRIMER_PICK_INTERNAL_OLIGO=0\nPRIMER_PICK_RIGHT_PRIMER=1\nPRIMER_OPT_SIZE=20
PRIMER_MIN_SIZE=${minS}\nPRIMER_MAX_SIZE=${maxS}\nPRIMER_MIN_TM=${minTM}\nPRIMER_MAX_TM=${maxTM}
PRIMER_MIN_GC=${minGC}\nPRIMER_MAX_GC=${maxGC}\nSEQUENCE_TARGET=${excludeRegion}\nSEQUENCE_INTERNAL_EXCLUDE_REGION=${excludeRegion}
PRIMER_PRODUCT_SIZE_RANGE=100-200\nPRIMER_EXPLAIN_FLAG=1\n=`;

  const workdir = await fs.mkdtemp(path.join(os.tmpdir(), 'ranch-primer3-'));
  const inputFile = path.join(workdir, 'input.txt');

  try {
    await fs.writeFile(inputFile, datainput, 'utf8');

    const output = await new Promise((resolve, reject) => {
      const child = spawn(PRIMER3_BIN, [inputFile]);
      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('error', reject);
      child.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`primer3 failed (${code}): ${stderr}`));
          return;
        }
        resolve(stdout);
      });
    });

    return parsePrimer3Output(output);
  } finally {
    await fs.rm(workdir, { recursive: true, force: true });
  }
};

module.exports = getPrimers;
