# 📝 Task CRUD API

A clean, lightweight, in-memory RESTful CRUD API built with **Node.js** and **Express**, featuring interactive **Swagger UI** documentation, input validation, search, filtering, and stats computing.

---

## ⚡ Quick Start

You can clone and start the API in under 1 minute:

```bash
git clone https://github.com/hiroqt/flyrank_crud_api.git
cd flyrank_crud_api
npm install
npm run dev
```

The server will start at **`http://localhost:3000`**.

---

## 📖 API Documentation (Swagger UI)

Interactive OpenAPI 3.0 documentation is available right out of the box. You can test all endpoints directly in your browser:

👉 **[http://localhost:3000/docs](http://localhost:3000/docs)**

---

## 🚀 Endpoints Summary

| Method | Endpoint | Description | Request Body | Success Status | Error Statuses |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/` | API metadata & version | None | `200 OK` | — |
| `GET` | `/health` | Server health check | None | `200 OK` | — |
| `GET` | `/tasks` | List all tasks (supports `?done=true` & `?search=gym`) | None | `200 OK` | — |
| `POST` | `/tasks` | Create a new task | `{"title": "Buy milk"}` | `201 Created` | `400 Bad Request` |
| `GET` | `/tasks/:id` | Get single task by ID | None | `200 OK` | `404 Not Found` |
| `PUT` | `/tasks/:id` | Update title and/or done status | `{"title": "...", "done": true}` | `200 OK` | `400 Bad Request`, `404 Not Found` |
| `DELETE` | `/tasks/:id` | Remove a task | None | `204 No Content` | `404 Not Found` |
| `GET` | `/stats` | Task statistics (`total`, `done`, `open`) | None | `200 OK` | — |
| `POST` | `/reset` | Reset tasks to 3 seed items | None | `200 OK` | — |
| `GET` | `/docs` | Interactive Swagger UI docs | None | `200 OK` | — |

---

## 🧪 Testing with `curl`

### 1. Root & Health
```bash
curl -i http://localhost:3000/
# HTTP/1.1 200 OK
# {"name":"Task API","version":"1.0.0","endpoints":["/tasks"]}

curl -i http://localhost:3000/health
# HTTP/1.1 200 OK
# {"status":"ok"}
```

### 2. Create Task (`POST /tasks`)
```bash
curl -i -X POST http://localhost:3000/tasks \
  -H "Content-Type: application/json" \
  -d '{"title":"Buy milk"}'
```
**Output:**
```http
HTTP/1.1 201 Created
Content-Type: application/json; charset=utf-8

{"id":4,"title":"Buy milk","done":false}
```

### 3. Read Tasks (`GET /tasks`)
```bash
curl -i http://localhost:3000/tasks
```
**Output:**
```http
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8

[
  {"id":1,"title":"Buy groceries","done":false},
  {"id":2,"title":"Go to gym","done":false},
  {"id":3,"title":"Read a book","done":false},
  {"id":4,"title":"Buy milk","done":false}
]
```

### 4. Query Filtering & Search
```bash
# Filter by completion
curl -i "http://localhost:3000/tasks?done=false"

# Substring search
curl -i "http://localhost:3000/tasks?search=milk"
```

### 5. Update Task (`PUT /tasks/:id`)
```bash
curl -i -X PUT http://localhost:3000/tasks/4 \
  -H "Content-Type: application/json" \
  -d '{"title":"Buy oat milk","done":true}'
```
**Output:**
```http
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8

{"id":4,"title":"Buy oat milk","done":true}
```

### 6. Delete Task (`DELETE /tasks/:id`)
```bash
curl -i -X DELETE http://localhost:3000/tasks/4
```
**Output:**
```http
HTTP/1.1 204 No Content
```

### 7. Task Statistics (`GET /stats`)
```bash
curl -i http://localhost:3000/stats
```
**Output:**
```http
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8

{"total":3,"done":0,"open":3}
```

---

## 🔬 The Mortality Experiment

> **Observation:** When tasks are created or updated, they only live in the server's volatile RAM (the in-memory JavaScript array). As soon as the Node.js server process terminates or restarts, all mutations disappear and the state resets back to the initial hardcoded seed items.
> 
> **Why it matters:** In-memory state is transient and bound to the process lifecycle. Building resilient production applications requires persistent databases (like PostgreSQL, SQLite, or MongoDB) so state survives server restarts, crashes, and scaling across multiple instances.

---

## 🛠️ Tech Stack
- **Runtime:** Node.js (v20+)
- **Framework:** Express 5
- **Documentation:** Swagger UI (`swagger-ui-express`) & OpenAPI 3.0
