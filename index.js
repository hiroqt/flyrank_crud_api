const express = require('express');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');
const Database = require('better-sqlite3');

const app = express();
const port = process.env.PORT || 3000;

// Parse JSON request bodies (e.g. POST /tasks).
app.use(express.json());

// SQLite database connection
const db = new Database('tasks.db');

// Create table if it does not already exist (with timestamps)
db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    done INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Original demo data used for initial seed and POST /reset
const SEED_TASKS = [
  { id: 1, title: 'Buy groceries', done: 0 },
  { id: 2, title: 'Walk the dog', done: 1 },
  { id: 3, title: 'Read a book', done: 0 },
];

// Seed three example tasks — only if the table is empty
const countResult = db.prepare('SELECT COUNT(*) AS count FROM tasks').get();
if (countResult.count === 0) {
  const insertTask = db.prepare('INSERT INTO tasks (title, done) VALUES (?, ?)');
  for (const task of SEED_TASKS) {
    insertTask.run(task.title, task.done);
  }
}

function resetTasks() {
  db.exec('DELETE FROM tasks');
  try {
    db.exec("DELETE FROM sqlite_sequence WHERE name = 'tasks'");
  } catch (e) { }
  const insertTask = db.prepare('INSERT INTO tasks (id, title, done) VALUES (?, ?, ?)');
  for (const task of SEED_TASKS) {
    insertTask.run(task.id, task.title, task.done);
  }
}

// Swagger JSDoc Configuration
const swaggerOptions = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Task API',
      version: '1.0',
      description: 'In-memory CRUD API for tasks generated dynamically with swagger-jsdoc, featuring pagination, search, and filtering.',
    },
    servers: [
      {
        url: `http://localhost:${port}`,
        description: 'Local development server',
      },
    ],
    components: {
      schemas: {
        Task: {
          type: 'object',
          required: ['id', 'title', 'done'],
          properties: {
            id: { type: 'integer', example: 1 },
            title: { type: 'string', example: 'Buy groceries' },
            done: { type: 'boolean', example: false },
          },
        },
        CreateTaskRequest: {
          type: 'object',
          required: ['title'],
          properties: {
            title: { type: 'string', example: 'Buy milk' },
          },
        },
        UpdateTaskRequest: {
          type: 'object',
          minProperties: 1,
          properties: {
            title: { type: 'string', example: 'Buy oat milk' },
            done: { type: 'boolean', example: true },
          },
        },
        StatsResponse: {
          type: 'object',
          required: ['total', 'done', 'open'],
          properties: {
            total: { type: 'integer', example: 3 },
            done: { type: 'integer', example: 1 },
            open: { type: 'integer', example: 2 },
          },
        },
        Error: {
          type: 'object',
          required: ['error'],
          properties: {
            error: { type: 'string', example: 'Task not found' },
          },
        },
      },
    },
  },
  apis: ['./index.js'],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

// OpenAPI spec — interactive docs at /docs
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

/**
 * @openapi
 * /:
 *   get:
 *     summary: API information
 *     description: Returns basic API metadata and available endpoints.
 *     responses:
 *       200:
 *         description: API metadata
 */
app.get('/', (req, res) => {
  res.json({
    name: 'Task API',
    version: '1.0',
    endpoints: ['/tasks', '/stats', '/reset', '/docs'],
  });
});

/**
 * @openapi
 * /health:
 *   get:
 *     summary: Health check
 *     description: Liveness check for monitoring and load balancers.
 *     responses:
 *       200:
 *         description: Server is healthy
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

/**
 * @openapi
 * /tasks:
 *   get:
 *     summary: List all tasks
 *     description: Retrieves tasks with optional filtering, search, and pagination.
 *     parameters:
 *       - name: done
 *         in: query
 *         schema:
 *           type: boolean
 *         description: Filter tasks by completion status (true or false)
 *       - name: search
 *         in: query
 *         schema:
 *           type: string
 *         description: Case-insensitive substring search in task titles
 *       - name: limit
 *         in: query
 *         schema:
 *           type: integer
 *         description: Maximum number of tasks to return (pagination)
 *       - name: offset
 *         in: query
 *         schema:
 *           type: integer
 *         description: Number of tasks to skip (pagination)
 *     responses:
 *       200:
 *         description: List of tasks
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Task'
 *       400:
 *         description: Invalid query parameters
 */
const formatTask = (row) => ({
  id: row.id,
  title: row.title,
  done: Boolean(row.done),
  created_at: row.created_at,
  updated_at: row.updated_at,
});

app.get('/tasks', (req, res) => {
  let query = 'SELECT id, title, done, created_at, updated_at FROM tasks WHERE 1=1';
  const params = [];

  // Filter by completion status
  if (req.query.done !== undefined) {
    if (req.query.done !== 'true' && req.query.done !== 'false') {
      return res.status(400).json({ error: 'done must be true or false' });
    }
    const done = req.query.done === 'true' ? 1 : 0;
    query += ' AND done = ?';
    params.push(done);
  }

  // SQL LIKE search
  if (req.query.search !== undefined) {
    const word = String(req.query.search).trim();
    if (word === '') {
      return res.status(400).json({ error: 'search must not be empty' });
    }
    query += ' AND LOWER(title) LIKE ?';
    params.push(`%${word.toLowerCase()}%`);
  }

  // Sort alphabetically or by id
  if (req.query.sort === 'title') {
    query += ' ORDER BY title COLLATE NOCASE ASC';
  } else {
    query += ' ORDER BY id ASC';
  }

  // Pagination: limit and offset
  if (req.query.limit !== undefined) {
    const limit = Number(req.query.limit);
    if (!Number.isInteger(limit) || limit <= 0) {
      return res.status(400).json({ error: 'limit must be a positive integer' });
    }
    const offset = req.query.offset !== undefined ? Number(req.query.offset) : 0;
    if (!Number.isInteger(offset) || offset < 0) {
      return res.status(400).json({ error: 'offset must be a non-negative integer' });
    }
    query += ' LIMIT ? OFFSET ?';
    params.push(limit, offset);
  } else if (req.query.offset !== undefined) {
    const offset = Number(req.query.offset);
    if (!Number.isInteger(offset) || offset < 0) {
      return res.status(400).json({ error: 'offset must be a non-negative integer' });
    }
    query += ' LIMIT -1 OFFSET ?';
    params.push(offset);
  }

  const rows = db.prepare(query).all(...params);
  res.json(rows.map(formatTask));
});

/**
 * @openapi
 * /stats:
 *   get:
 *     summary: Derived task counts
 *     description: Returns computed metrics (total, done, open).
 *     responses:
 *       200:
 *         description: Task statistics
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StatsResponse'
 */
app.get('/stats', (req, res) => {
  const stats = db.prepare(`
    SELECT
      COUNT(*) AS total,
      COALESCE(SUM(CASE WHEN done = 1 THEN 1 ELSE 0 END), 0) AS done,
      COALESCE(SUM(CASE WHEN done = 0 THEN 1 ELSE 0 END), 0) AS open
    FROM tasks
  `).get();

  res.json({
    total: stats.total,
    done: stats.done,
    open: stats.open,
  });
});

/**
 * @openapi
 * /reset:
 *   post:
 *     summary: Restore seed tasks
 *     description: Restores the 3 demo tasks for demos and testing.
 *     responses:
 *       200:
 *         description: Seed tasks restored
 */
app.post('/reset', (req, res) => {
  resetTasks();
  const rows = db.prepare('SELECT id, title, done, created_at, updated_at FROM tasks').all();
  res.json(rows.map(formatTask));
});

/**
 * @openapi
 * /tasks:
 *   post:
 *     summary: Create a new task
 *     description: Creates a task with server-assigned ID and done=false.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateTaskRequest'
 *     responses:
 *       201:
 *         description: Task created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Task'
 *       400:
 *         description: Missing or empty title
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
app.post('/tasks', (req, res) => {
  const { title } = req.body ?? {};

  // 1. Validation
  if (title === undefined || title === null || String(title).trim() === '') {
    return res.status(400).json({ error: 'Missing or empty title' });
  }
  const cleanTitle = String(title).trim();

  // 2. Insert into SQLite with parameterized query
  const stmt = db.prepare('INSERT INTO tasks (title, done) VALUES (?, ?)');
  const info = stmt.run(cleanTitle, 0);

  // 3. Return created task + 201 Created
  const newTask = db.prepare('SELECT id, title, done, created_at, updated_at FROM tasks WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(formatTask(newTask));
});

/**
 * @openapi
 * /tasks/{id}:
 *   get:
 *     summary: Get task by ID
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Task found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Task'
 *       404:
 *         description: Task not found
 */
app.get('/tasks/:id', (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT id, title, done, created_at, updated_at FROM tasks WHERE id = ?').get(id);

  if (!row) {
    return res.status(404).json({ error: `Task ${id} not found` });
  }

  res.json(formatTask(row));
});

/**
 * @openapi
 * /tasks/{id}:
 *   put:
 *     summary: Update a task
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateTaskRequest'
 *     responses:
 *       200:
 *         description: Task updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Task'
 *       400:
 *         description: Invalid request body
 *       404:
 *         description: Task not found
 */
app.put('/tasks/:id', (req, res) => {
  const id = Number(req.params.id);

  // 1. Fetch existing task if ID exists
  const existing = db.prepare('SELECT id, title, done, created_at, updated_at FROM tasks WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ error: `Task ${id} not found` });
  }

  // 2. Validation of request body
  const { title, done } = req.body ?? {};
  const hasTitle = Object.prototype.hasOwnProperty.call(req.body ?? {}, 'title');
  const hasDone = Object.prototype.hasOwnProperty.call(req.body ?? {}, 'done');

  if (!hasTitle && !hasDone) {
    return res.status(400).json({ error: 'request body must include title and/or done' });
  }

  let newTitle = existing.title;
  let newDone = existing.done;

  if (hasTitle) {
    if (title === null || String(title).trim() === '') {
      return res.status(400).json({ error: 'title cannot be empty' });
    }
    newTitle = String(title).trim();
  }

  if (hasDone) {
    if (typeof done !== 'boolean') {
      return res.status(400).json({ error: 'done must be a boolean' });
    }
    newDone = done ? 1 : 0;
  }

  // 3. Run parameterized UPDATE query with updated_at timestamp
  db.prepare('UPDATE tasks SET title = ?, done = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newTitle, newDone, id);

  // 4. Return updated task with timestamps
  const updated = db.prepare('SELECT id, title, done, created_at, updated_at FROM tasks WHERE id = ?').get(id);
  res.json(formatTask(updated));
});

/**
 * @openapi
 * /tasks/{id}:
 *   delete:
 *     summary: Delete a task
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       204:
 *         description: Task deleted
 *       404:
 *         description: Task not found
 */
app.delete('/tasks/:id', (req, res) => {
  const id = Number(req.params.id);

  // 1. Run parameterized DELETE query
  const info = db.prepare('DELETE FROM tasks WHERE id = ?').run(id);

  // 2. info.changes indicates how many rows were deleted. If 0, the task was not found.
  if (info.changes === 0) {
    return res.status(404).json({ error: `Task ${id} not found` });
  }

  // 3. Return 204 No Content with empty body
  res.status(204).send();
});


app.listen(port, () => {
  console.log(`CRUD API listening on port ${port}`);
});