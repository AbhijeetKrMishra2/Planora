const express = require('express')
const cors = require('cors')
const path = require('path')
const Database = require('better-sqlite3')

const app = express()
const PORT = process.env.PORT || 5000

// Render persistent disk के लिए DB_PATH set कर सकते हैं.
// Local development में database backend/todo.db में बनेगा.
const DB_PATH =
  process.env.DB_PATH || path.join(__dirname, 'todo.db')

const db = new Database(DB_PATH)

db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

app.use(cors({
  origin: [
    'http://localhost:5173',
    process.env.FRONTEND_URL
  ].filter(Boolean)
}))

app.use(express.json())

const categories = [
  'Work',
  'Study',
  'Personal',
  'Health',
  'Shopping',
  'Other'
]

const priorities = ['High', 'Medium', 'Low']

// Create table if it does not exist.
db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    priority TEXT NOT NULL DEFAULT 'Medium',
    dueDate TEXT NOT NULL DEFAULT '',
    createdAt INTEGER NOT NULL,
    category TEXT NOT NULL DEFAULT 'Personal',
    notes TEXT NOT NULL DEFAULT ''
  )
`)

// Safely upgrade an older database.
const existingColumns = db
  .prepare('PRAGMA table_info(tasks)')
  .all()
  .map(column => column.name)

if (!existingColumns.includes('category')) {
  db.exec(`
    ALTER TABLE tasks
    ADD COLUMN category TEXT NOT NULL DEFAULT 'Personal'
  `)
}

if (!existingColumns.includes('notes')) {
  db.exec(`
    ALTER TABLE tasks
    ADD COLUMN notes TEXT NOT NULL DEFAULT ''
  `)
}

function formatTask(task) {
  if (!task) return task

  return {
    ...task,
    completed: Boolean(task.completed),
    priority: priorities.includes(task.priority)
      ? task.priority
      : 'Medium',
    category: categories.includes(task.category)
      ? task.category
      : 'Personal',
    notes: typeof task.notes === 'string'
      ? task.notes
      : ''
  }
}

function getTask(id) {
  return db
    .prepare('SELECT * FROM tasks WHERE id = ?')
    .get(id)
}

function getAllTasks() {
  return db
    .prepare('SELECT * FROM tasks ORDER BY createdAt DESC, id DESC')
    .all()
    .map(formatTask)
}

function validateTaskFields(body, existing = {}) {
  const title = body.title ?? existing.title ?? ''
  const priority = body.priority ?? existing.priority ?? 'Medium'
  const dueDate = body.dueDate ?? existing.dueDate ?? ''
  const category = body.category ?? existing.category ?? 'Personal'
  const notes = body.notes ?? existing.notes ?? ''
  const completed =
    body.completed ?? Boolean(existing.completed ?? false)

  if (typeof title !== 'string' || !title.trim()) {
    return { error: 'Task title is required' }
  }

  if (!priorities.includes(priority)) {
    return { error: 'Priority must be High, Medium, or Low' }
  }

  if (!categories.includes(category)) {
    return {
      error: `Invalid category. Choose one of: ${categories.join(', ')}`
    }
  }

  if (typeof dueDate !== 'string' || typeof notes !== 'string') {
    return { error: 'Due date and notes must be text values' }
  }

  if (typeof completed !== 'boolean') {
    return { error: 'Completed must be true or false' }
  }

  return {
    value: {
      title: title.trim(),
      priority,
      dueDate,
      category,
      notes: notes.trim(),
      completed
    }
  }
}

// Root route
app.get('/', (req, res) => {
  res.send(
    'Planora Backend is running! Check /api/health for API status.'
  )
})

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Planora API is running',
    database: 'SQLite'
  })
})

// Get all tasks
app.get('/api/tasks', (req, res) => {
  try {
    res.json(getAllTasks())
  } catch (error) {
    console.error('Fetch tasks error:', error)
    res.status(500).json({ error: 'Could not fetch tasks' })
  }
})

// Create a task
app.post('/api/tasks', (req, res) => {
  try {
    const validated = validateTaskFields(req.body)

    if (validated.error) {
      return res.status(400).json({ error: validated.error })
    }

    const task = validated.value

    const result = db.prepare(`
      INSERT INTO tasks
        (title, completed, priority, dueDate, createdAt, category, notes)
      VALUES
        (?, ?, ?, ?, ?, ?, ?)
    `).run(
      task.title,
      task.completed ? 1 : 0,
      task.priority,
      task.dueDate,
      Date.now(),
      task.category,
      task.notes
    )

    const created = formatTask(getTask(result.lastInsertRowid))
    res.status(201).json(created)
  } catch (error) {
    console.error('Create task error:', error)
    res.status(500).json({ error: 'Could not create task' })
  }
})

// Update an existing task
app.patch('/api/tasks/:id', (req, res) => {
  try {
    const id = Number(req.params.id)

    if (!Number.isSafeInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid task ID' })
    }

    const existing = getTask(id)

    if (!existing) {
      return res.status(404).json({ error: 'Task not found' })
    }

    const validated = validateTaskFields(req.body, existing)

    if (validated.error) {
      return res.status(400).json({ error: validated.error })
    }

    const task = validated.value

    db.prepare(`
      UPDATE tasks
      SET title = ?,
          completed = ?,
          priority = ?,
          dueDate = ?,
          category = ?,
          notes = ?
      WHERE id = ?
    `).run(
      task.title,
      task.completed ? 1 : 0,
      task.priority,
      task.dueDate,
      task.category,
      task.notes,
      id
    )

    res.json(formatTask(getTask(id)))
  } catch (error) {
    console.error('Update task error:', error)
    res.status(500).json({ error: 'Could not update task' })
  }
})

// Delete all completed tasks
app.delete('/api/tasks/completed', (req, res) => {
  try {
    const result = db
      .prepare('DELETE FROM tasks WHERE completed = 1')
      .run()

    res.json({
      message: 'Completed tasks deleted',
      deletedCount: result.changes
    })
  } catch (error) {
    console.error('Delete completed tasks error:', error)
    res.status(500).json({
      error: 'Could not delete completed tasks'
    })
  }
})

// Delete one task
app.delete('/api/tasks/:id', (req, res) => {
  try {
    const id = Number(req.params.id)

    if (!Number.isSafeInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid task ID' })
    }

    const result = db
      .prepare('DELETE FROM tasks WHERE id = ?')
      .run(id)

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Task not found' })
    }

    res.json({ message: 'Task deleted successfully' })
  } catch (error) {
    console.error('Delete task error:', error)
    res.status(500).json({ error: 'Could not delete task' })
  }
})

// Import old localStorage tasks without duplicating existing IDs.
app.post('/api/tasks/import', (req, res) => {
  try {
    if (!req.body || !Array.isArray(req.body.tasks)) {
      return res.status(400).json({
        error: 'Expected a tasks array'
      })
    }

    const insert = db.prepare(`
      INSERT OR IGNORE INTO tasks
        (id, title, completed, priority, dueDate, createdAt, category, notes)
      VALUES
        (@id, @title, @completed, @priority, @dueDate, @createdAt,
         @category, @notes)
    `)

    const importTasks = db.transaction(items => {
      let importedCount = 0

      for (const item of items) {
        if (
          !Number.isSafeInteger(item.id) ||
          item.id <= 0 ||
          typeof item.title !== 'string' ||
          !item.title.trim()
        ) {
          continue
        }

        const category = categories.includes(item.category)
          ? item.category
          : 'Personal'

        const priority = priorities.includes(item.priority)
          ? item.priority
          : 'Medium'

        const result = insert.run({
          id: item.id,
          title: item.title.trim(),
          completed: item.completed ? 1 : 0,
          priority,
          dueDate: typeof item.dueDate === 'string'
            ? item.dueDate
            : '',
          createdAt: Number.isSafeInteger(item.createdAt)
            ? item.createdAt
            : item.id,
          category,
          notes: typeof item.notes === 'string'
            ? item.notes.trim()
            : ''
        })

        importedCount += result.changes
      }

      return importedCount
    })

    const importedCount = importTasks(req.body.tasks)

    res.json({
      message: 'Import finished',
      importedCount,
      tasks: getAllTasks()
    })
  } catch (error) {
    console.error('Import tasks error:', error)
    res.status(500).json({ error: 'Could not import tasks' })
  }
})

// Start the server on Render's assigned port.
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Planora API is running on port ${PORT}`)
  console.log(`SQLite database path: ${DB_PATH}`)
})

