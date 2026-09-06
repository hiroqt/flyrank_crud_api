const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

//Parse JSON request bodies
app.use(express.json());

//Constant value for tasks
const tasks = [
  { id: 1, title: 'Buy groceries', done: false },
  { id: 2, title: 'Go to gym', done: false },
  { id: 3, title: 'Read a book', done: false },
];

//Stage 1: Root and health endpoints
app.get('/', (req, res) => {
  res.json({
    name: 'Task API',
    version: '1.0.0',
    endpoints: ['/tasks']
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

//Stage 2: Create an endpoint to get all tasks
app.get('/tasks', (req, res) => {
  res.json(tasks);
});

//Stage 3: Create a new task
app.post('/tasks', (req, res) => {
  const { title } = req.body || {};
  if (!title || typeof title !== 'string' || title.trim() === '') {
    return res.status(400).json({ error: 'Title is required and cannot be empty' });
  }

  const id = tasks.length === 0 ? 1 : Math.max(...tasks.map((t) => t.id)) + 1;
  const task = { id, title: title.trim(), done: false };
  tasks.push(task);
  res.status(201).json(task);
});

//Stage 2: Create an endpoint to get a single task by ID
app.get('/tasks/:id', (req, res) => {
  const id = Number(req.params.id);
  const task = tasks.find((t) => t.id === id);
  if (!task) {
    return res.status(404).json({ error: 'Task not found' })
  }
  res.json(task)
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
