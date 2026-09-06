const express = require('express');
const swaggerUi = require('swagger-ui-express');
const openapi = require('../openapi.json');

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(express.json());

// In-Memory Data Store & Seed
const INITIAL_TASKS = [
  { id: 1, title: 'Buy groceries', done: false },
  { id: 2, title: 'Walk the dog', done: true },
  { id: 3, title: 'Read a book', done: false },
];

let tasks = INITIAL_TASKS.map((t) => ({ ...t }));

const resetTasks = () => {
  tasks = INITIAL_TASKS.map((t) => ({ ...t }));
  return tasks;
};

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

// GET /tasks with query filtering
app.get('/tasks', (req, res) => {
  let result = [...tasks];
  const { done, search } = req.query;

  if (done !== undefined) {
    if (done !== 'true' && done !== 'false') {
      return res.status(400).json({ error: 'done query parameter must be "true" or "false"' });
    }
    const isDone = done === 'true';
    result = result.filter((task) => task.done === isDone);
  }

  if (search !== undefined) {
    const term = String(search).trim();
    if (!term) {
      return res.status(400).json({ error: 'search query parameter must not be empty' });
    }
    const lowerTerm = term.toLowerCase();
    result = result.filter((task) => task.title.toLowerCase().includes(lowerTerm));
  }

  res.status(200).json(result);
});

// GET /stats
app.get('/stats', (req, res) => {
  const total = tasks.length;
  const done = tasks.filter((t) => t.done).length;
  res.status(200).json({
    total,
    done,
    open: total - done,
  });
});

// POST /reset
app.post('/reset', (req, res) => {
  const restored = resetTasks();
  res.status(200).json(restored);
});

// POST /tasks
app.post('/tasks', (req, res) => {
  const { title } = req.body || {};

  if (!title || typeof title !== 'string' || title.trim() === '') {
    return res.status(400).json({ error: 'title is required and must be a non-empty string' });
  }

  const nextId = tasks.length === 0 ? 1 : Math.max(...tasks.map((t) => t.id)) + 1;
  const newTask = {
    id: nextId,
    title: title.trim(),
    done: false,
  };

  tasks.push(newTask);
  res.status(201).json(newTask);
});

// GET /tasks/:id
app.get('/tasks/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Task ID must be a positive integer' });
  }

  const task = tasks.find((t) => t.id === id);
  if (!task) {
    return res.status(404).json({ error: `Task ${id} not found` });
  }

  res.status(200).json(task);
});

// PUT /tasks/:id
app.put('/tasks/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Task ID must be a positive integer' });
  }

  const task = tasks.find((t) => t.id === id);
  if (!task) {
    return res.status(404).json({ error: `Task ${id} not found` });
  }

  const { title, done } = req.body || {};
  const hasTitle = Object.prototype.hasOwnProperty.call(req.body || {}, 'title');
  const hasDone = Object.prototype.hasOwnProperty.call(req.body || {}, 'done');

  if (!hasTitle && !hasDone) {
    return res.status(400).json({ error: 'request body must include title and/or done' });
  }

  if (hasTitle) {
    if (!title || typeof title !== 'string' || title.trim() === '') {
      return res.status(400).json({ error: 'title cannot be empty' });
    }
    task.title = title.trim();
  }

  if (hasDone) {
    if (typeof done !== 'boolean') {
      return res.status(400).json({ error: 'done must be a boolean' });
    }
    task.done = done;
  }

  res.status(200).json(task);
});

// DELETE /tasks/:id
app.delete('/tasks/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Task ID must be a positive integer' });
  }

  const index = tasks.findIndex((t) => t.id === id);
  if (index === -1) {
    return res.status(404).json({ error: `Task ${id} not found` });
  }

  tasks.splice(index, 1);
  res.status(204).send();
});

// Start Server
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`AI-Version Task API running on port ${PORT}`);
  });
}

module.exports = app;
