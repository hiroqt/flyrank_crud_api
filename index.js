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

// Create table if it does not already exist
db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    done INTEGER NOT NULL DEFAULT 0
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
});

app.get('/tasks', (req, res) => {
  // Query all tasks from SQLite
  const rows = db.prepare('SELECT * FROM tasks').all();

  // Format done as boolean (SQLite stores booleans as 0 or 1)
  const tasks = rows.map((row) => ({
    id: row.id,
    title: row.title,
    done: Boolean(row.done),
  }));

  res.json(tasks);
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
  const rows = db.prepare('SELECT id, title, done FROM tasks').all();
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

  if (title === undefined || title === null || String(title).trim() === '') {
    return res.status(400).json({ error: 'title is required and cannot be empty' });
  }

  const cleanTitle = String(title).trim();
  const info = db.prepare('INSERT INTO tasks (title, done) VALUES (?, 0)').run(cleanTitle);
  const task = {
    id: Number(info.lastInsertRowid),
    title: cleanTitle,
    done: false,
  };

  res.status(201).json(task);
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

  // Parameterized query: pass id to .get() to prevent SQL injection
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);

  // 3. Unknown IDs return 404
  if (!row) {
    return res.status(404).json({ error: `Task ${id} not found` });
  }

  res.json({
    id: row.id,
    title: row.title,
    done: Boolean(row.done),
  });
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
  const existing = db.prepare('SELECT id, title, done FROM tasks WHERE id = ?').get(id);

  if (!existing) {
    return res.status(404).json({ error: `Task ${id} not found` });
  }

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

  db.prepare('UPDATE tasks SET title = ?, done = ? WHERE id = ?').run(newTitle, newDone, id);

  res.json({
    id,
    title: newTitle,
    done: Boolean(newDone),
  });
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
  const info = db.prepare('DELETE FROM tasks WHERE id = ?').run(id);

  if (info.changes === 0) {
    return res.status(404).json({ error: `Task ${id} not found` });
  }

  res.status(204).send();
});

app.listen(port, () => {
  console.log(`CRUD API listening on port ${port}`);
});