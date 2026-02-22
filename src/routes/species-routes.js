const express = require('express');
const path = require('path');
const fs = require('fs/promises');
const { randomUUID } = require('crypto');

const getSeq = require('../data/getSeq');
const getPrimers = require('../primers/getPrimers');
const runEPCR = require('../primers/runEPCR');
const runPrediction = require('../prediction/prediction');
const runBlast = require('../prediction/blast');
const { enqueueJob, getJob, deleteFileIfExists } = require('../jobs/queue');
const runtime = require('../config/runtime');
const Bos = require('../models/bosTaurus');

const router = express.Router();

const SPECIES_TABLES = new Set([
  'bos_taurus',
  'capra_hircus',
  'canis_lupus',
  'felis_catus',
  'equus_asinus',
  'equus_caballus',
  'sus_sucrofas',
  'bubalus_bubalis',
  'ovis_aries',
  'bos_grunniens',
  'gallus_gallus',
  'apis_meliferas',
]);

const INFO_TABLES = new Set([
  'spinfo_bos',
  'spinfo_capras',
  'spinfo_dogs',
  'spinfo_cats',
  'spinfo_donkeys',
  'spinfo_horses',
  'spinfo_pigs',
  'spinfo_buffalos',
  'spinfo_sheeps',
  'spinfo_yaks',
  'spinfo_chickens',
  'spinfo_bees',
]);

const ALLOWED_BLAST_DB = new Set([
  'bostaurus.fasta',
  'goat.fa',
  'dog.fa',
  'cat.fa',
  'donkey.fa',
  'horse.fa',
  'pig.fa',
  'buffalo.fa',
  'sheep.fa',
  'yak.fa',
  'bee.fa',
  'chicken.fa',
]);

const ALLOWED_JOB_TYPES = new Set(['prediction', 'blast']);

const toInt = (value, fallback = undefined) => {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const buildQuery = ({ motif, type, annotation, chromosome, start, stop, min }) => {
  const query = {};

  if (chromosome) query.chromosome = chromosome;
  if (motif) query.motif = motif;
  if (type) query.motif_type = type;
  if (annotation) query.annotation = annotation;

  const s = toInt(start);
  const e = toInt(stop);
  const m = toInt(min);

  if (s !== undefined) query.motif_start = { $gte: s };
  if (e !== undefined) query.motif_end = { $lte: e };
  if (m !== undefined) query.motif_length = { $gte: m };

  return query;
};

const statusForExecutionError = (err) => {
  const message = err && err.message ? err.message : '';
  if (message.startsWith('Invalid ') || message.startsWith('No ')) {
    return 400;
  }
  return 500;
};

const createPredictionInput = async (req, id) => {
  const genome = req.body.genome || '';
  const fastaPath = path.join(runtime.PREDDATA_DIR, `${id}.fa`);
  await fs.mkdir(path.dirname(fastaPath), { recursive: true });

  let hasInput = false;
  if (req.files && req.files.file) {
    const uploadFile = req.files.file;
    await uploadFile.mv(fastaPath);
    hasInput = true;
  }

  if (genome !== '') {
    await fs.writeFile(fastaPath, genome, 'utf8');
    hasInput = true;
  }

  if (!hasInput) {
    throw new Error('No input sequence provided');
  }

  return {
    fastaPath,
    minRepeat: req.body.minRepeat,
    maxRepeat: req.body.maxRepeat,
    mono: req.body.mono,
    all: req.body.all,
  };
};

const createBlastInput = async (req, id) => {
  const genome = req.body.genome;
  const gdata = req.body.gdata || '';
  const fastaPath = path.join(runtime.PREDDATA_DIR, `${id}.fa`);

  if (!ALLOWED_BLAST_DB.has(genome)) {
    throw new Error('Invalid BLAST database');
  }

  await fs.mkdir(path.dirname(fastaPath), { recursive: true });

  let hasInput = false;
  if (req.files && req.files.file) {
    const uploadFile = req.files.file;
    await uploadFile.mv(fastaPath);
    hasInput = true;
  }

  if (gdata !== '') {
    await fs.writeFile(fastaPath, gdata, 'utf8');
    hasInput = true;
  }

  if (!hasInput) {
    throw new Error('No query sequence provided');
  }

  return {
    fastaPath,
    genome,
    word: req.body.word,
    target: req.body.target,
    evalue: req.body.evalue,
    program: req.body.program,
  };
};

const enqueuePredictionJob = async (req) => {
  const id = randomUUID();
  const input = await createPredictionInput(req, id);
  return enqueueJob({
    id,
    type: 'prediction',
    run: () => runPrediction(id, input.fastaPath, input.minRepeat, input.maxRepeat, input.mono, input.all),
    cleanup: () => deleteFileIfExists(input.fastaPath),
  });
};

const enqueueBlastJob = async (req) => {
  const id = randomUUID();
  const input = await createBlastInput(req, id);
  return enqueueJob({
    id,
    type: 'blast',
    run: () => runBlast(id, input.fastaPath, input.program, input.genome, input.word, input.target, input.evalue),
    cleanup: () => deleteFileIfExists(input.fastaPath),
  });
};

router.post('/jobs', async (req, res) => {
  try {
    const type = req.body.type;
    if (!ALLOWED_JOB_TYPES.has(type)) {
      return res.status(400).json({ error: 'Invalid job type. Use prediction or blast.' });
    }

    const job = type === 'prediction'
      ? await enqueuePredictionJob(req)
      : await enqueueBlastJob(req);

    return res.status(202).json(job);
  } catch (err) {
    return res.status(statusForExecutionError(err)).json({ error: err.message });
  }
});

router.get('/jobs/:id', async (req, res) => {
  const job = getJob(req.params.id);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  return res.json(job);
});

router.get('/total/', async (req, res) => {
  try {
    const { table } = req.query;
    if (!SPECIES_TABLES.has(table)) {
      return res.status(400).json({ error: 'Invalid species table' });
    }

    const query = buildQuery(req.query);
    const count = await Bos[table].countDocuments(query);
    return res.json(count);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/seq', async (req, res) => {
  try {
    const { chr, start, stop, filename } = req.query;
    const chr1Region = await getSeq(chr, start, stop, filename);
    return res.json(chr1Region);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const { table } = req.query;
    if (!SPECIES_TABLES.has(table)) {
      return res.status(400).json({ error: 'Invalid species table' });
    }

    const page = toInt(req.query.page, 0);
    const size = toInt(req.query.size, 10);
    const limit = Math.max(1, Math.min(size, 200));
    const skip = Math.max(0, page) * limit;

    const query = buildQuery(req.query);
    const results = await Bos[table].find(query).limit(limit).skip(skip).exec();

    return res.json(results);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/sinfo', async (req, res) => {
  try {
    const { infotable } = req.query;
    if (!INFO_TABLES.has(infotable)) {
      return res.status(400).json({ error: 'Invalid info table' });
    }

    const results = await Bos[infotable].find({}).exec();
    return res.json(results);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/primers', async (req, res) => {
  try {
    const { seq, motif_length, minS, maxS, minTM, maxTM, minGC, maxGC, flank } = req.query;
    const pdata = await getPrimers(seq, motif_length, minS, maxS, minTM, maxTM, minGC, maxGC, flank);
    return res.json(pdata);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/epcr', async (req, res) => {
  try {
    const primerdata = JSON.parse(req.query.primerdata || '{}');
    const seqdata = req.query.seq || '';
    const mismatch = req.query.mismatch;
    const genome = req.query.genome;

    const pdata = await runEPCR(primerdata, seqdata, mismatch, genome);
    return res.send(pdata);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/prediction', async (req, res) => {
  try {
    const id = randomUUID();
    const input = await createPredictionInput(req, id);
    const result = await runPrediction(id, input.fastaPath, input.minRepeat, input.maxRepeat, input.mono, input.all);
    await deleteFileIfExists(input.fastaPath);
    return res.send(result);
  } catch (err) {
    return res.status(statusForExecutionError(err)).json({ error: err.message });
  }
});

router.post('/blast', async (req, res) => {
  try {
    const id = randomUUID();
    const input = await createBlastInput(req, id);
    const result = await runBlast(id, input.fastaPath, input.program, input.genome, input.word, input.target, input.evalue);
    await deleteFileIfExists(input.fastaPath);
    return res.send(result);
  } catch (err) {
    return res.status(statusForExecutionError(err)).json({ error: err.message });
  }
});

module.exports = router;
