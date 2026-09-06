const express = require('express');
const swaggerUi = require('swagger-ui-express');
const openapi = require('./openapi.json');
const app = express();
const port = 3000;

// Parse JSON request bodies (e.g. POST /tasks).
app.use(express.json());

// Original demo data — POST /reset restores a fresh copy of this list.
const SEED_TASKS = [
  { id: 1, title: 'Buy groceries', done: false },
  { id: 2, title: 'Walk the dog', done: true },
  { id: 3, title: 'Read a book', done: false },
];

// In-memory task store — data is lost when the server restarts.
const tasks = SEED_TASKS.map((task) => ({ ...task }));

function resetTasks() {
  tasks.length = 0;
  tasks.push(...SEED_TASKS.map((task) => ({ ...task })));
}

// OpenAPI spec — interactive docs at /docs.
app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapi));

// API metadata — lists available endpoints for clients and docs.
app.get('/', (req, res) => {
  res.json({
    name: 'Task API',
    version: '1.0',
    endpoints: ['/tasks', '/stats', '/reset'],
  });
});

// Liveness check for load balancers and monitoring.
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Query params after ? filter the list — they are not part of the address.
app.get('/tasks', (req, res) => {
  let result = tasks;

  if (req.query.done !== undefined) {
    if (req.query.done !== 'true' && req.query.done !== 'false') {
      return res.status(400).json({ error: 'done must be true or false' });
    }
    const done = req.query.done === 'true';
    result = result.filter((t) => t.done === done);
  }

  if (req.query.search !== undefined) {
    const word = String(req.query.search).trim();
    if (word === '') {
      return res.status(400).json({ error: 'search must not be empty' });
    }
    const lower = word.toLowerCase();
    result = result.filter((t) => t.title.toLowerCase().includes(lower));
  }

  res.json(result);
});

// Derived counts — the server computes, not just stores.
app.get('/stats', (req, res) => {
  const done = tasks.filter((t) => t.done).length;
  res.json({
    total: tasks.length,
    done,
    open: tasks.length - done,
  });
});

// Restore the 3 seed tasks (handy for demos and testing).
app.post('/reset', (req, res) => {
  resetTasks();
  res.json(tasks);
});

// Create a task. Client sends { "title": "..." }; server assigns id and done=false.
app.post('/tasks', (req, res) => {
  const { title } = req.body;

  // Business rule: never trust the client — title must be present and non-empty.
  if (title === undefined || title === null || String(title).trim() === '') {
    return res.status(400).json({ error: 'title is required and cannot be empty' });
  }

  // Next free id is one above the current highest (handles gaps if tasks are removed later).
  const id = tasks.length === 0 ? 1 : Math.max(...tasks.map((t) => t.id)) + 1;
  const task = { id, title: String(title).trim(), done: false };

  tasks.push(task);
  res.status(201).json(task);
});

// :id is a path parameter — the number in /tasks/2 comes from the URL, not the body.
app.get('/tasks/:id', (req, res) => {
  const id = Number(req.params.id);
  const task = tasks.find((t) => t.id === id);

  // 404, not an empty 200 — status codes tell machines whether the resource exists.
  if (!task) {
    return res.status(404).json({ error: `Task ${id} not found` });
  }

  res.json(task);
});

// Update title and/or done on an existing task (partial body is OK).
app.put('/tasks/:id', (req, res) => {
  const id = Number(req.params.id);
  const task = tasks.find((t) => t.id === id);

  if (!task) {
    return res.status(404).json({ error: `Task ${id} not found` });
  }

  const { title, done } = req.body ?? {};
  const hasTitle = Object.prototype.hasOwnProperty.call(req.body ?? {}, 'title');
  const hasDone = Object.prototype.hasOwnProperty.call(req.body ?? {}, 'done');

  if (!hasTitle && !hasDone) {
    return res.status(400).json({ error: 'request body must include title and/or done' });
  }

  if (hasTitle) {
    if (title === null || String(title).trim() === '') {
      return res.status(400).json({ error: 'title cannot be empty' });
    }
    task.title = String(title).trim();
  }

  if (hasDone) {
    if (typeof done !== 'boolean') {
      return res.status(400).json({ error: 'done must be a boolean' });
    }
    task.done = done;
  }

  res.json(task);
});

// Remove a task. 204 = success with no response body.
app.delete('/tasks/:id', (req, res) => {
  const id = Number(req.params.id);
  const index = tasks.findIndex((t) => t.id === id);

  if (index === -1) {
    return res.status(404).json({ error: `Task ${id} not found` });
  }

  tasks.splice(index, 1);
  res.status(204).send();
});

app.listen(port, () => {
  console.log(`CRUD API listening on port ${port}`);
});