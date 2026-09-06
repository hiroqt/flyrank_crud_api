const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

//Constant value for tasks
const tasks = [
  { id: 1, title: 'Buy groceries', done: false },
  { id: 2, title: 'Go to gym', done: false },
  { id: 3, title: 'Read a book', done: false },
];

app.use(express.json());
//Stage 1: Root and health endpoints
app.get('/', (req, res) => {
  res.json({
    name: 'Task API',
    version: '1.0.0',
    endpoints: ['/tasks']
  })
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});


app.get('/tasks', (req, res) => {
  res.json(tasks);
});

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
