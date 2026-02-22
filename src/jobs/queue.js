const fs = require('fs/promises');

const DEFAULT_CONCURRENCY = Number.parseInt(process.env.JOB_CONCURRENCY || '1', 10);
const CONCURRENCY = Number.isNaN(DEFAULT_CONCURRENCY) || DEFAULT_CONCURRENCY < 1 ? 1 : DEFAULT_CONCURRENCY;
const DEFAULT_RETENTION_MS = Number.parseInt(process.env.JOB_RETENTION_MS || `${6 * 60 * 60 * 1000}`, 10);
const RETENTION_MS = Number.isNaN(DEFAULT_RETENTION_MS) || DEFAULT_RETENTION_MS < 60_000
  ? 6 * 60 * 60 * 1000
  : DEFAULT_RETENTION_MS;

const jobs = new Map();
const queue = [];
let activeCount = 0;

const pruneJobs = () => {
  const now = Date.now();
  for (const [id, job] of jobs.entries()) {
    if (!job.finishedAt) continue;
    const finishedAt = Date.parse(job.finishedAt);
    if (!Number.isNaN(finishedAt) && now - finishedAt > RETENTION_MS) {
      jobs.delete(id);
    }
  }
};

const parseMaybeJson = (value) => {
  if (typeof value !== 'string') {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch (_err) {
    return value;
  }
};

const toPublicJob = (job) => ({
  id: job.id,
  type: job.type,
  status: job.status,
  createdAt: job.createdAt,
  startedAt: job.startedAt,
  finishedAt: job.finishedAt,
  error: job.error,
  result: job.result,
});

const runNext = () => {
  while (activeCount < CONCURRENCY && queue.length > 0) {
    const nextId = queue.shift();
    const job = jobs.get(nextId);

    if (!job || job.status !== 'queued') {
      continue;
    }

    activeCount += 1;
    job.status = 'running';
    job.startedAt = new Date().toISOString();

    Promise.resolve()
      .then(() => job.run())
      .then((result) => {
        job.status = 'completed';
        job.result = parseMaybeJson(result);
      })
      .catch((err) => {
        job.status = 'failed';
        job.error = err instanceof Error ? err.message : String(err);
      })
      .finally(async () => {
        job.finishedAt = new Date().toISOString();
        if (typeof job.cleanup === 'function') {
          try {
            await job.cleanup();
          } catch (_cleanupErr) {
            // Cleanup errors are intentionally not promoted to job failure.
          }
        }

        activeCount -= 1;
        pruneJobs();
        setImmediate(runNext);
      });
  }
};

const enqueueJob = ({ id, type, run, cleanup }) => {
  pruneJobs();
  const createdAt = new Date().toISOString();
  jobs.set(id, {
    id,
    type,
    status: 'queued',
    createdAt,
    startedAt: null,
    finishedAt: null,
    error: null,
    result: null,
    run,
    cleanup,
  });

  queue.push(id);
  setImmediate(runNext);
  return toPublicJob(jobs.get(id));
};

const getJob = (id) => {
  pruneJobs();
  const job = jobs.get(id);
  return job ? toPublicJob(job) : null;
};

const deleteFileIfExists = async (filepath) => {
  if (!filepath) return;
  try {
    await fs.unlink(filepath);
  } catch (_err) {
    // Ignore missing file cleanup errors.
  }
};

module.exports = {
  enqueueJob,
  getJob,
  deleteFileIfExists,
};
