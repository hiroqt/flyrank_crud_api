require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const swaggerUi = require('swagger-ui-express');
const openapi = require('../openapi.json');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(express.json());

// Database Connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:dev@localhost:5432/tasks',
});

// Database Initialization & Seed
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      done BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const { rows } = await pool.query('SELECT COUNT(*) FROM tasks');
  if (parseInt(rows[0].count, 10) === 0) {
    const seedTasks = [
      ['Buy groceries', false],
      ['Walk the dog', true],
      ['Read a book', false],
    ];
    for (const [title, done] of seedTasks) {
      await pool.query('INSERT INTO tasks (title, done) VALUES ($1, $2)', [title, done]);
    }
    console.log('[AI Version] Seeded 3 initial tasks.');
  }
}

initDB().catch(console.error);

// Format helper
const formatTask = (row) => ({
  id: row.id,
  title: row.title,
  done: Boolean(row.done),
  created_at: row.created_at,
  updated_at: row.updated_at,
});

// Swagger UI Docs
app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapi));

// GET / - API Info
app.get('/', (req, res) => {
  res.status(200).json({
    name: 'Task API (AI Edition)',
    version: '1.0',
    endpoints: ['/tasks', '/stats', '/reset', '/docs'],
  });
});

// GET /health - Healthcheck
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.status(200).json({ status: 'ok', database: 'connected' });
  } catch (err) {
    res.status(503).json({ status: 'error', database: 'disconnected' });
  }
});

// GET /tasks - List with pagination, search, done filter
app.get('/tasks', async (req, res) => {
  try {
    let query = 'SELECT * FROM tasks WHERE 1=1';
    const params = [];
    let idx = 1;

    if (req.query.done !== undefined) {
      if (req.query.done !== 'true' && req.query.done !== 'false') {
        return res.status(400).json({ error: 'done must be true or false' });
      }
      query += ` AND done = $${idx++}`;
      params.push(req.query.done === 'true');
    }

    if (req.query.search !== undefined) {
      const search = String(req.query.search).trim();
      if (!search) {
        return res.status(400).json({ error: 'search must not be empty' });
      }
      query += ` AND title ILIKE $${idx++}`;
      params.push(`%${search}%`);
    }

    if (req.query.sort === 'title') {
      query += ' ORDER BY LOWER(title) ASC';
    } else {
      query += ' ORDER BY id ASC';
    }

    if (req.query.limit !== undefined) {
      const limit = parseInt(req.query.limit, 10);
      if (isNaN(limit) || limit <= 0) {
        return res.status(400).json({ error: 'limit must be a positive integer' });
      }
      const offset = req.query.offset ? parseInt(req.query.offset, 10) : 0;
      if (isNaN(offset) || offset < 0) {
        return res.status(400).json({ error: 'offset must be a non-negative integer' });
      }
      query += ` LIMIT $${idx++} OFFSET $${idx++}`;
      params.push(limit, offset);
    } else if (req.query.offset !== undefined) {
      const offset = parseInt(req.query.offset, 10);
      if (isNaN(offset) || offset < 0) {
        return res.status(400).json({ error: 'offset must be a non-negative integer' });
      }
      query += ` OFFSET $${idx++}`;
      params.push(offset);
    }

    const { rows } = await pool.query(query, params);
    res.status(200).json(rows.map(formatTask));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /tasks - Create task
app.post('/tasks', async (req, res) => {
  const { title } = req.body || {};
  if (!title || typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'Missing or empty title' });
  }

  try {
    const { rows } = await pool.query(
      'INSERT INTO tasks (title, done) VALUES ($1, FALSE) RETURNING *',
      [title.trim()]
    );
    res.status(201).json(formatTask(rows[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /tasks/:id - Get by ID
app.get('/tasks/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid task ID' });
  }

  try {
    const { rows } = await pool.query('SELECT * FROM tasks WHERE id = $1', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    res.status(200).json(formatTask(rows[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /tasks/:id - Update task
app.put('/tasks/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid task ID' });
  }

  const { title, done } = req.body || {};
  const hasTitle = Object.prototype.hasOwnProperty.call(req.body || {}, 'title');
  const hasDone = Object.prototype.hasOwnProperty.call(req.body || {}, 'done');

  if (!hasTitle && !hasDone) {
    return res.status(400).json({ error: 'Body must include title and/or done' });
  }

  try {
    const existing = await pool.query('SELECT * FROM tasks WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    let nextTitle = existing.rows[0].title;
    let nextDone = existing.rows[0].done;

    if (hasTitle) {
      if (typeof title !== 'string' || !title.trim()) {
        return res.status(400).json({ error: 'title cannot be empty' });
      }
      nextTitle = title.trim();
    }

    if (hasDone) {
      if (typeof done !== 'boolean') {
        return res.status(400).json({ error: 'done must be a boolean' });
      }
      nextDone = done;
    }

    const { rows } = await pool.query(
      'UPDATE tasks SET title = $1, done = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING *',
      [nextTitle, nextDone, id]
    );

    res.status(200).json(formatTask(rows[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /tasks/:id - Delete task
app.delete('/tasks/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid task ID' });
  }

  try {
    const { rowCount } = await pool.query('DELETE FROM tasks WHERE id = $1 RETURNING id', [id]);
    if (rowCount === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /stats - Derived metrics
app.get('/stats', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        COUNT(*)::int AS total,
        COALESCE(SUM(CASE WHEN done = TRUE THEN 1 ELSE 0 END), 0)::int AS done,
        COALESCE(SUM(CASE WHEN done = FALSE THEN 1 ELSE 0 END), 0)::int AS open
      FROM tasks
    `);
    res.status(200).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /reset - Restore seed
app.post('/reset', async (req, res) => {
  try {
    await pool.query('TRUNCATE tasks RESTART IDENTITY');
    const seedTasks = [
      ['Buy groceries', false],
      ['Walk the dog', true],
      ['Read a book', false],
    ];
    for (const [title, done] of seedTasks) {
      await pool.query('INSERT INTO tasks (title, done) VALUES ($1, $2)', [title, done]);
    }
    const { rows } = await pool.query('SELECT * FROM tasks ORDER BY id ASC');
    res.status(200).json(rows.map(formatTask));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[AI Version] Server listening on port ${PORT}`);
  });
}

module.exports = app;
