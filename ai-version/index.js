const express = require('express');
const swaggerUi = require('swagger-ui-express');
const Database = require('better-sqlite3');
const openapi = require('../openapi.json');

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(express.json());

// SQLite Database Setup
const db = new Database('tasks.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    done INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Seed 3 example tasks only if the table is empty
const countResult = db.prepare('SELECT COUNT(*) AS count FROM tasks').get();
if (countResult.count === 0) {
  const seedStmt = db.prepare('INSERT INTO tasks (title, done) VALUES (?, ?)');
  const seedTasks = [
    ['Buy groceries', 0],
    ['Walk the dog', 1],
    ['Read a book', 0],
  ];
  const seedTransaction = db.transaction((tasks) => {
    for (const [title, done] of tasks) {
      seedStmt.run(title, done);
    }
  });
  seedTransaction(seedTasks);
}

// Helper to format SQLite rows for JSON responses
const formatTask = (row) => ({
  id: row.id,
  title: row.title,
  done: Boolean(row.done),
  created_at: row.created_at,
  updated_at: row.updated_at,
});

// Interactive OpenAPI Documentation
app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapi));

// Root & Health
app.get('/', (req, res) => {
  res.status(200).json({
    name: 'Task API',
    version: '1.0',
    endpoints: ['/tasks', '/stats', '/reset', '/docs'],
  });
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// GET /tasks with optional filters
app.get('/tasks', (req, res) => {
  let query = 'SELECT * FROM tasks WHERE 1=1';
  const params = [];

  const { done, search } = req.query;

  if (done !== undefined) {
    if (done !== 'true' && done !== 'false') {
      return res.status(400).json({ error: 'done query parameter must be "true" or "false"' });
    }
    query += ' AND done = ?';
    params.push(done === 'true' ? 1 : 0);
  }

  if (search !== undefined) {
    const term = String(search).trim();
    if (!term) {
      return res.status(400).json({ error: 'search query parameter must not be empty' });
    }
    query += ' AND LOWER(title) LIKE ?';
    params.push(`%${term.toLowerCase()}%`);
  }

  query += ' ORDER BY id ASC';

  const rows = db.prepare(query).all(...params);
  res.status(200).json(rows.map(formatTask));
});

// GET /stats
app.get('/stats', (req, res) => {
  const stats = db.prepare(`
    SELECT
      COUNT(*) AS total,
      COALESCE(SUM(CASE WHEN done = 1 THEN 1 ELSE 0 END), 0) AS done,
      COALESCE(SUM(CASE WHEN done = 0 THEN 1 ELSE 0 END), 0) AS open
    FROM tasks
  `).get();

  res.status(200).json({
    total: stats.total,
    done: stats.done,
    open: stats.open,
  });
});

// POST /reset
app.post('/reset', (req, res) => {
  db.exec('DELETE FROM tasks');
  try {
    db.exec("DELETE FROM sqlite_sequence WHERE name = 'tasks'");
  } catch (e) {}

  const seedStmt = db.prepare('INSERT INTO tasks (id, title, done) VALUES (?, ?, ?)');
  const seedTasks = [
    [1, 'Buy groceries', 0],
    [2, 'Walk the dog', 1],
    [3, 'Read a book', 0],
  ];
  for (const [id, title, done] of seedTasks) {
    seedStmt.run(id, title, done);
  }

  const rows = db.prepare('SELECT * FROM tasks ORDER BY id ASC').all();
  res.status(200).json(rows.map(formatTask));
});

// POST /tasks
app.post('/tasks', (req, res) => {
  const { title } = req.body || {};

  if (!title || typeof title !== 'string' || title.trim() === '') {
    return res.status(400).json({ error: 'title is required and must be a non-empty string' });
  }

  const cleanTitle = title.trim();
  const insertStmt = db.prepare('INSERT INTO tasks (title, done) VALUES (?, 0)');
  const result = insertStmt.run(cleanTitle);

  const newTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(formatTask(newTask));
});

// GET /tasks/:id
app.get('/tasks/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Task ID must be a positive integer' });
  }

  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  if (!row) {
    return res.status(404).json({ error: `Task ${id} not found` });
  }

  res.status(200).json(formatTask(row));
});

// PUT /tasks/:id
app.put('/tasks/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Task ID must be a positive integer' });
  }

  const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ error: `Task ${id} not found` });
  }

  const { title, done } = req.body || {};
  const hasTitle = Object.prototype.hasOwnProperty.call(req.body || {}, 'title');
  const hasDone = Object.prototype.hasOwnProperty.call(req.body || {}, 'done');

  if (!hasTitle && !hasDone) {
    return res.status(400).json({ error: 'request body must include title and/or done' });
  }

  let newTitle = existing.title;
  let newDone = existing.done;

  if (hasTitle) {
    if (!title || typeof title !== 'string' || title.trim() === '') {
      return res.status(400).json({ error: 'title cannot be empty' });
    }
    newTitle = title.trim();
  }

  if (hasDone) {
    if (typeof done !== 'boolean') {
      return res.status(400).json({ error: 'done must be a boolean' });
    }
    newDone = done ? 1 : 0;
  }

  db.prepare('UPDATE tasks SET title = ?, done = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newTitle, newDone, id);

  const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  res.status(200).json(formatTask(updated));
});

// DELETE /tasks/:id
app.delete('/tasks/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Task ID must be a positive integer' });
  }

  const result = db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
  if (result.changes === 0) {
    return res.status(404).json({ error: `Task ${id} not found` });
  }

  res.status(204).send();
});

// Start Server
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`AI-Version Task API running on port ${PORT}`);
  });
}

module.exports = app;
