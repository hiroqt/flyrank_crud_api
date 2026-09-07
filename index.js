require('dotenv').config();
const express = require('express');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 3000;

// Parse JSON request bodies (e.g. POST /tasks).
app.use(express.json());

// PostgreSQL database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Original demo data used for initial seed and POST /reset
const SEED_TASKS = [
  { id: 1, title: 'Buy groceries', done: false },
  { id: 2, title: 'Walk the dog', done: true },
  { id: 3, title: 'Read a book', done: false },
];

// Initialize table and seed data if empty
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      done BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const countResult = await pool.query('SELECT COUNT(*) AS count FROM tasks');
  const count = parseInt(countResult.rows[0].count, 10);

  if (count === 0) {
    for (const task of SEED_TASKS) {
      await pool.query(
        'INSERT INTO tasks (title, done) VALUES ($1, $2)',
        [task.title, task.done]
      );
    }
    console.log('Seeded 3 initial tasks into PostgreSQL.');
  }
}

async function resetTasks() {
  await pool.query('TRUNCATE tasks RESTART IDENTITY');
  for (const task of SEED_TASKS) {
    await pool.query(
      'INSERT INTO tasks (title, done) VALUES ($1, $2)',
      [task.title, task.done]
    );
  }
}

// Initialize database schema & seed
initDB().catch((err) => {
  console.error('Error initializing database:', err);
});

// Swagger JSDoc Configuration
const swaggerOptions = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Task API',
      version: '1.0',
      description: 'CRUD API for tasks backed by PostgreSQL in Docker, featuring pagination, search, and filtering.',
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

app.get('/tasks', async (req, res) => {
  try {
    let query = 'SELECT id, title, done, created_at, updated_at FROM tasks WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    // Filter by completion status
    if (req.query.done !== undefined) {
      if (req.query.done !== 'true' && req.query.done !== 'false') {
        return res.status(400).json({ error: 'done must be true or false' });
      }
      const done = req.query.done === 'true';
      query += ` AND done = $${paramIndex++}`;
      params.push(done);
    }

    // SQL ILIKE search
    if (req.query.search !== undefined) {
      const word = String(req.query.search).trim();
      if (word === '') {
        return res.status(400).json({ error: 'search must not be empty' });
      }
      query += ` AND title ILIKE $${paramIndex++}`;
      params.push(`%${word}%`);
    }

    // Sort
    if (req.query.sort === 'title') {
      query += ' ORDER BY LOWER(title) ASC';
    } else {
      query += ' ORDER BY id ASC';
    }

    // Pagination
    if (req.query.limit !== undefined) {
      const limit = Number(req.query.limit);
      if (!Number.isInteger(limit) || limit <= 0) {
        return res.status(400).json({ error: 'limit must be a positive integer' });
      }
      const offset = req.query.offset !== undefined ? Number(req.query.offset) : 0;
      if (!Number.isInteger(offset) || offset < 0) {
        return res.status(400).json({ error: 'offset must be a non-negative integer' });
      }
      query += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
      params.push(limit, offset);
    } else if (req.query.offset !== undefined) {
      const offset = Number(req.query.offset);
      if (!Number.isInteger(offset) || offset < 0) {
        return res.status(400).json({ error: 'offset must be a non-negative integer' });
      }
      query += ` OFFSET $${paramIndex++}`;
      params.push(offset);
    }

    const result = await pool.query(query, params);
    res.json(result.rows.map(formatTask));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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
app.get('/stats', async (req, res) => {
  try {
    const statsResult = await pool.query(`
      SELECT
        COUNT(*)::int AS total,
        COALESCE(SUM(CASE WHEN done = TRUE THEN 1 ELSE 0 END), 0)::int AS done,
        COALESCE(SUM(CASE WHEN done = FALSE THEN 1 ELSE 0 END), 0)::int AS open
      FROM tasks
    `);

    const stats = statsResult.rows[0];
    res.json({
      total: stats.total,
      done: stats.done,
      open: stats.open,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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
app.post('/reset', async (req, res) => {
  try {
    await resetTasks();
    const result = await pool.query('SELECT id, title, done, created_at, updated_at FROM tasks ORDER BY id ASC');
    res.json(result.rows.map(formatTask));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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
app.post('/tasks', async (req, res) => {
  const { title } = req.body ?? {};

  // 1. Validation (400 if missing or empty)
  if (title === undefined || title === null || String(title).trim() === '') {
    return res.status(400).json({ error: 'Missing or empty title' });
  }
  const cleanTitle = String(title).trim();

  try {
    // 2. Insert into PostgreSQL with parameterized query and RETURNING
    const result = await pool.query(
      'INSERT INTO tasks (title, done) VALUES ($1, FALSE) RETURNING id, title, done, created_at, updated_at',
      [cleanTitle]
    );

    // 3. Return created task + 201 Created
    res.status(201).json(formatTask(result.rows[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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
app.get('/tasks/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'Invalid task ID' });
  }

  try {
    // Parameterized query placeholder ($1)
    const result = await pool.query(
      'SELECT id, title, done, created_at, updated_at FROM tasks WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: `Task ${id} not found` });
    }

    res.json(formatTask(result.rows[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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
app.put('/tasks/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'Invalid task ID' });
  }

  try {
    // 1. Fetch existing task
    const existingResult = await pool.query(
      'SELECT id, title, done, created_at, updated_at FROM tasks WHERE id = $1',
      [id]
    );

    if (existingResult.rows.length === 0) {
      return res.status(404).json({ error: `Task ${id} not found` });
    }
    const existing = existingResult.rows[0];

    // 2. Validation
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
      newDone = done;
    }

    // 3. Update query in Postgres
    const updateResult = await pool.query(
      'UPDATE tasks SET title = $1, done = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING id, title, done, created_at, updated_at',
      [newTitle, newDone, id]
    );

    res.json(formatTask(updateResult.rows[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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
 *         content: {}
 *       404:
 *         description: Task not found
 */
app.delete('/tasks/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'Invalid task ID' });
  }

  try {
    const result = await pool.query('DELETE FROM tasks WHERE id = $1 RETURNING id', [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: `Task ${id} not found` });
    }

    // 204 No Content with empty body
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(port, () => {
  console.log(`CRUD API listening on port ${port}`);
});