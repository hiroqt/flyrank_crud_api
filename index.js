require('dotenv').config();
const express = require('express');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');
const { Pool } = require('pg');
// Optional extra: Redis driver for caching / session storage
const Redis = require('ioredis');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const port = process.env.PORT || 3000;

// Initialize Supabase Client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;
let supabase = null;

if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey);
  console.log('[Supabase] Client initialized successfully.');
} else {
  console.warn('[Supabase] Warning: SUPABASE_URL or SUPABASE_KEY missing in environment variables.');
}

// Parse JSON request bodies (e.g. POST /tasks).
app.use(express.json());

// PostgreSQL database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
pool.on('error', (err) => {
  console.error('[PostgreSQL] Client error:', err.message);
});

// Redis client initialization (if REDIS_URL is provided in environment)
let redis = null;
if (process.env.REDIS_URL) {
  redis = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      if (times > 3) return null;
      return Math.min(times * 200, 2000);
    },
  });

  redis.on('error', (err) => {
    // Suppress unhandled event crashes when Redis server is offline
  });

  // PING Redis once on startup to verify connectivity
  redis.ping()
    .then((pong) => {
      console.log(`[Redis] Connection verified on startup: ${pong}`);
    })
    .catch((err) => {
      console.error('[Redis] Connection failed on startup:', err.message);
    });
}

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
        // Relative URL: "Try it out" calls whichever host:port serves /docs
        url: '/',
        description: 'Current server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
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

/**
 * @openapi
 * /auth/signup:
 *   post:
 *     summary: Register a new user
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, example: test@example.com }
 *               password: { type: string, example: password123 }
 *     responses:
 *       201:
 *         description: User created
 *       400:
 *         description: Missing email or password
 */
// POST /auth/signup - register a new user via Supabase Auth
app.post('/auth/signup', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) {
    return res.status(400).json({ error: error.message });
  }
  res.status(201).json(data.user);
});

/**
 * @openapi
 * /auth/login:
 *   post:
 *     summary: Log in and get access + refresh tokens
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, example: test@example.com }
 *               password: { type: string, example: password123 }
 *     responses:
 *       200:
 *         description: access_token and refresh_token
 *       400:
 *         description: Missing email or password
 *       401:
 *         description: Invalid login credentials
 */
// POST /auth/login - sign in and return JWT + refresh token
app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.name === 'AuthApiError') {
      return res.status(401).json({ error: 'Invalid login credentials' });
    }
    return res.status(502).json({ error: error.message });
  }
  res.status(200).json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });
});

/**
 * @openapi
 * /auth/refresh:
 *   post:
 *     summary: Exchange a refresh token for a new access token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refresh_token]
 *             properties:
 *               refresh_token: { type: string }
 *     responses:
 *       200:
 *         description: New access_token and refresh_token
 *       400:
 *         description: Missing refresh_token
 *       401:
 *         description: Invalid or expired refresh token
 */
// POST /auth/refresh - get a fresh access token without logging in again
app.post('/auth/refresh', async (req, res) => {
  const { refresh_token } = req.body || {};
  if (!refresh_token) {
    return res.status(400).json({ error: 'refresh_token is required' });
  }

  const { data, error } = await supabase.auth.refreshSession({ refresh_token });
  if (error) {
    if (error.name === 'AuthApiError') {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }
    return res.status(502).json({ error: error.message });
  }
  res.status(200).json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });
});

/**
 * @openapi
 * /public/info:
 *   get:
 *     summary: Public info (no auth)
 *     responses:
 *       200:
 *         description: Public welcome message
 */
// GET /public/info - no auth required
app.get('/public/info', (req, res) => {
  res.status(200).json({ message: 'Welcome stranger! This info is public.' });
});

// Auth Middleware Guard
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.user = data.user;
  next();
}

/**
 * @openapi
 * /protected/profile:
 *   get:
 *     summary: Get the logged-in user's profile
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: id, email and created_at
 *       401:
 *         description: Missing, invalid or expired token
 */
// GET /protected/profile - requires valid token via requireAuth guard
app.get('/protected/profile', requireAuth, (req, res) => {
  const { id, email, created_at } = req.user;
  res.status(200).json({ id, email, created_at });
});

/**
 * @openapi
 * /protected/dashboard:
 *   get:
 *     summary: Protected dashboard
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard welcome message
 *       401:
 *         description: Missing, invalid or expired token
 */
// GET /protected/dashboard - second protected route demonstrating middleware reuse
app.get('/protected/dashboard', requireAuth, (req, res) => {
  res.status(200).json({ message: `Welcome to the dashboard, ${req.user.email}!` });
});

/**
 * @openapi
 * /auth/logout:
 *   post:
 *     summary: Log out
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       204:
 *         description: Logged out
 *       401:
 *         description: Missing, invalid or expired token
 */
// POST /auth/logout - sign out user and invalidate session
app.post('/auth/logout', requireAuth, async (req, res) => {
  const { error } = await supabase.auth.signOut();
  if (error) {
    return res.status(500).json({ error: error.message });
  }
  res.status(204).send();
});

function startServer(targetPort) {
  const server = app.listen(targetPort, () => {
    console.log(`CRUD API listening on port ${targetPort}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      const fallbackPort = Number(targetPort) + 1;
      console.warn(`[Server] Port ${targetPort} is in use. Switching to port ${fallbackPort}...`);
      startServer(fallbackPort);
    } else {
      console.error('[Server] Fatal server error:', err.message);
    }
  });
}

startServer(port);