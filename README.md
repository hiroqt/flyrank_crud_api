#  Task CRUD API

A clean, lightweight, in-memory RESTful CRUD API built with **Node.js** and **Express**, featuring interactive **Swagger UI** documentation, input validation, search, filtering, and stats computing.

---

##  Quick Start

You can clone and start the API in under 1 minute:

```bash
git clone https://github.com/hiroqt/flyrank_crud_api.git
cd flyrank_crud_api
npm install
npm run dev
```

The server will start at **`http://localhost:3000`**.

---

##  API Documentation (Swagger UI)

Interactive OpenAPI 3.0 documentation is available right out of the box. You can test all endpoints directly in your browser:

 **[http://localhost:3000/docs](http://localhost:3000/docs)**

---

##  Endpoints Summary

| Method | Endpoint | Description | Request Body | Success Status | Error Statuses |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/` | API metadata & version | None | `200 OK` | — |
| `GET` | `/health` | Server health check | None | `200 OK` | — |
| `GET` | `/tasks` | List tasks (supports `?done=`, `?search=`, `?limit=`, `?offset=`) | None | `200 OK` | `400 Bad Request` |
| `POST` | `/tasks` | Create a new task | `{"title": "Buy milk"}` | `201 Created` | `400 Bad Request` |
| `GET` | `/tasks/:id` | Get single task by ID | None | `200 OK` | `404 Not Found` |
| `PUT` | `/tasks/:id` | Update title and/or done status | `{"title": "...", "done": true}` | `200 OK` | `400 Bad Request`, `404 Not Found` |
| `DELETE` | `/tasks/:id` | Remove a task | None | `204 No Content` | `404 Not Found` |
| `GET` | `/stats` | Task statistics (`total`, `done`, `open`) | None | `200 OK` | — |
| `POST` | `/reset` | Reset tasks to 3 seed items | None | `200 OK` | — |
| `GET` | `/docs` | Dynamic Swagger UI docs generated with `swagger-jsdoc` | None | `200 OK` | — |

---

##  Testing with `curl`

### 1. Root & Health
```bash
curl -i http://localhost:3000/
# HTTP/1.1 200 OK
# {"name":"Task API","version":"1.0","endpoints":["/tasks","/stats","/reset","/docs"]}

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
  {"id":2,"title":"Walk the dog","done":true},
  {"id":3,"title":"Read a book","done":false},
  {"id":4,"title":"Buy milk","done":false}
]
```

### 4. Query Filtering, Search & Pagination
```bash
# Filter by completion
curl -i "http://localhost:3000/tasks?done=false"

# Substring search
curl -i "http://localhost:3000/tasks?search=milk"

# Pagination: limit & offset (first page of 2 items)
curl -i "http://localhost:3000/tasks?limit=2&offset=0"

# Pagination: next page
curl -i "http://localhost:3000/tasks?limit=2&offset=2"
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

{"total":3,"done":1,"open":2}
```

---

## 📄 Why Real APIs Never Return "Everything" (The Need for Pagination)

> Real production systems store millions of records. Returning "everything" without pagination causes critical failures:
> 1. **Server Out-Of-Memory (OOM) Crashes:** Querying 500,000 database records into Node.js memory exhausts the heap allocation and crashes the server process.
> 2. **Network Payload Saturation:** Multi-megabyte JSON responses choke bandwidth, especially on mobile connections, causing severe latency and timeouts.
> 3. **Database Performance Degradation:** Full table scans without `LIMIT` and `OFFSET` (or keyset pagination) lock tables, overwhelm disk I/O, and starve concurrent user queries.
> 4. **User Experience:** Frontend clients and mobile apps only display a visible viewport of 10–20 items at a time (e.g. infinite scroll or paginated tables).
> 
> By implementing `limit` and `offset`, the server controls resource consumption while delivering fast, sub-millisecond response times.

---

##  The Mortality Experiment

> **Observation:** When tasks are created or updated, they only live in the server's volatile RAM (the in-memory JavaScript array). As soon as the Node.js server process terminates or restarts, all mutations disappear and the state resets back to the initial hardcoded seed items.
> 
> **Why it matters:** In-memory state is transient and bound to the process lifecycle. Building resilient production applications requires persistent databases (like PostgreSQL, SQLite, or MongoDB) so state survives server restarts, crashes, and scaling across multiple instances.

---

## Tech Stack
- **Runtime:** Node.js (v20+)
- **Framework:** Express 5
- **Documentation:** `swagger-ui-express` & `swagger-jsdoc` (JSDoc annotations generating OpenAPI 3.0)

---

## AI vs Me (Stage 7 Rematch)

### Prompt Used
```text
I am reviewing the previous AI-generated backend implementation against my requirements. Regenerate the solution with strict adherence to the requested API behavior, including correct HTTP status codes, input validation, edge-case handling, and the specified OpenAPI structure. Before generating the code, identify any ambiguous requirements and make reasonable decisions without inventing functionality. Ensure the final implementation is clean, modular, and production-ready.
```

### 1. What the AI Did Better
- **Path Parameter Type Guarding:** The AI version added strict integer validation (`if (!Number.isInteger(id) || id <= 0)`) returning `400 Bad Request` on non-numeric IDs like `/tasks/abc` before searching memory.
- **Export & Testability:** Wrapped `app.listen()` inside `if (require.main === module)` and exported `app`, enabling seamless automated testing with supertest/jest without occupying live ports.
- **Explicit Status Codes:** Explicitly used `.status(200).json(...)` across all success endpoints rather than relying on default Express behavior.

### 2. What the AI Got Wrong or Quietly Ignored
- **Initial Assumption on Port Binding:** Initially defaulted to port 4000 to avoid conflicting with the primary app, requiring explicit environment configuration if meant to be a drop-in replacement.
- **Query Parameter Strictness:** Initially treated missing search terms as empty strings rather than throwing 400, until explicit validation rules were enforced.

### 3. What the Prompt Forgot to Specify & What the AI Decided
- **Invalid Path Param Status Code:** The prompt did not specify whether `GET /tasks/abc` should return `404` or `400`. The AI chose `400 Bad Request` for invalid integer formats and `404 Not Found` for valid but non-existent integers.
- **Swagger Documentation Linking:** Decided whether to embed swagger specs inline vs load from `openapi.json`. AI reused the structured `../openapi.json` file to maintain single source of truth.

### Rematch Conclusion
Writing the solution by hand in Stages 0–6 provided the exact mental model needed to rigorously review AI-generated code, spot missing edge-case validations, and enforce strict REST status code contracts.

### Direct SQL Execution

#### 1. List all tasks
- **Query:**
  ```sql
  SELECT * FROM tasks;
  ```
- **Output:**
  ```text
  1|Buy groceries|0
  2|Walk the dog|1
  3|Read a book|0
  5|Buy milk|0
  ```
- **Result:** Returned all active rows stored directly in `tasks.db`.

#### 2. Filter completed tasks
- **Query:**
  ```sql
  SELECT * FROM tasks WHERE done = 1;
  ```
- **Output:**
  ```text
  2|Walk the dog|1
  ```
- **Result:** Filtered and returned only tasks with `done = 1` (completed).

#### 3. Count total tasks
- **Query:**
  ```sql
  SELECT COUNT(*) FROM tasks;
  ```
- **Output:**
  ```text
  4
  ```
- **Result:** Returned the total number of tasks currently in `tasks.db`, demonstrating that direct SQL queries and the running API interact with the exact same database file in real-time.
