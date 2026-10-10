import { useState, useEffect } from 'react'
import './App.css'

const API = 'http://localhost:5000/api'
const CATEGORIES = ['Work', 'Study', 'Personal', 'Health', 'Shopping', 'Other']
const PRIORITIES = ['High', 'Medium', 'Low']

const cardStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  padding: '16px',
  borderRadius: '14px',
  background: '#20263d',
  border: '1px solid #39415f',
  color: '#fff',
  minWidth: 0
}

const fieldStyle = {
  boxSizing: 'border-box',
  width: '100%',
  minWidth: 0,
  padding: '12px',
  borderRadius: '9px',
  border: '1px solid #5966a5',
  background: '#0e1530',
  color: '#fff',
  font: 'inherit'
}

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(data.error || `Request failed: ${response.status}`)
  }

  return data
}

function App() {
  const [tasks, setTasks] = useState(() => {
    try {
      const saved = localStorage.getItem('my-todo-tasks')
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })

  const [ready, setReady] = useState(false)
  const [apiStatus, setApiStatus] = useState('Connecting...')
  const [notice, setNotice] = useState('')

  const [input, setInput] = useState('')
  const [priority, setPriority] = useState('Medium')
  const [dueDate, setDueDate] = useState('')
  const [category, setCategory] = useState('Personal')
  const [notes, setNotes] = useState('')

  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [sortBy, setSortBy] = useState('newest')

  const [editingId, setEditingId] = useState(null)
  const [editTitle, setEditTitle] = useState('')
  const [editPriority, setEditPriority] = useState('Medium')
  const [editDueDate, setEditDueDate] = useState('')
  const [editCategory, setEditCategory] = useState('Personal')
  const [editNotes, setEditNotes] = useState('')

  // Connect to SQLite and import old browser tasks if needed.
  useEffect(() => {
    let cancelled = false

    async function connectDatabase() {
      try {
        const localTasks = JSON.parse(
          localStorage.getItem('my-todo-tasks') || '[]'
        )

        let databaseTasks = await apiRequest('/tasks')

        // Import localStorage tasks only if SQLite is empty.
        if (databaseTasks.length === 0 && localTasks.length > 0) {
          const imported = await apiRequest('/tasks/import', {
            method: 'POST',
            body: JSON.stringify({ tasks: localTasks })
          })

          databaseTasks = imported.tasks
        }

        if (!cancelled) {
          setTasks(databaseTasks)
          setApiStatus('Connected to SQLite')
          setNotice('')
          setReady(true)
        }
      } catch (error) {
        console.error('Database connection failed:', error)

        if (!cancelled) {
          setApiStatus('Connection failed')
          setNotice(
            'Backend connection failed. Start the backend and refresh this page.'
          )
          setReady(true)
        }
      }
    }

    connectDatabase()

    return () => {
      cancelled = true
    }
  }, [])

  // Maintain a browser backup.
  useEffect(() => {
    if (!ready) return

    try {
      localStorage.setItem('my-todo-tasks', JSON.stringify(tasks))
    } catch (error) {
      console.error('Could not save browser backup:', error)
    }
  }, [tasks, ready])

  function parseDate(value) {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return null
    }

    const [year, month, day] = value.split('-').map(Number)
    const date = new Date(year, month - 1, day)

    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day
    ) {
      return null
    }

    return date
  }

  function todayDate() {
    const now = new Date()

    return new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    )
  }

  function isOverdue(task) {
    if (!task.dueDate || task.completed) return false

    const date = parseDate(task.dueDate)

    return Boolean(date && date < todayDate())
  }

  function isDueToday(task) {
    if (!task.dueDate || task.completed) return false

    const date = parseDate(task.dueDate)

    return Boolean(
      date && date.getTime() === todayDate().getTime()
    )
  }

  function isUpcoming(task) {
    if (!task.dueDate || task.completed) return false

    const date = parseDate(task.dueDate)
    if (!date) return false

    const today = todayDate()
    const end = new Date(today)

    end.setDate(end.getDate() + 7)

    return date >= today && date <= end
  }

  function formatDate(value) {
    const date = parseDate(value)

    return date
      ? date.toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric'
        })
      : value
  }

  function dueLabel(task) {
    if (!task.dueDate) return 'No deadline'
    if (task.completed) return `Due: ${formatDate(task.dueDate)}`
    if (isOverdue(task)) return `Overdue: ${formatDate(task.dueDate)}`
    if (isDueToday(task)) return `Due today: ${formatDate(task.dueDate)}`

    return `Due: ${formatDate(task.dueDate)}`
  }

  function handleError(error) {
    console.error(error)
    setNotice(error.message || 'Something went wrong. Please try again.')
  }

  // Add task with category and notes.
  async function addTask(event) {
    event.preventDefault()

    const title = input.trim()

    if (!title) {
      alert('Please enter a task name!')
      return
    }

    try {
      const created = await apiRequest('/tasks', {
        method: 'POST',
        body: JSON.stringify({
          title,
          priority,
          dueDate,
          category,
          notes
        })
      })

      setTasks(previous => [created, ...previous])

      setInput('')
      setDueDate('')
      setNotes('')

      // Keep the selected category instead of resetting it.
      setNotice(
        `Saved: ${created.title} · Category: ${created.category} · Notes ${
          created.notes ? 'saved' : 'empty'
        }`
      )
    } catch (error) {
      handleError(error)
    }
  }

  // Complete or reopen a task.
  async function toggleTask(id) {
    const task = tasks.find(item => item.id === id)

    if (!task) return

    try {
      const updated = await apiRequest(`/tasks/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          completed: !task.completed
        })
      })

      setTasks(previous =>
        previous.map(item => item.id === id ? updated : item)
      )

      setNotice('')
    } catch (error) {
      handleError(error)
    }
  }

  // Delete a task.
  async function deleteTask(id) {
    if (!window.confirm('Are you sure you want to delete this task?')) {
      return
    }

    try {
      await apiRequest(`/tasks/${id}`, {
        method: 'DELETE'
      })

      setTasks(previous => previous.filter(task => task.id !== id))

      if (editingId === id) {
        cancelEdit()
      }

      setNotice('Task deleted.')
    } catch (error) {
      handleError(error)
    }
  }

  // Open the edit form with saved values.
  function startEdit(task) {
    setEditingId(task.id)
    setEditTitle(task.title || '')
    setEditPriority(
      PRIORITIES.includes(task.priority) ? task.priority : 'Medium'
    )
    setEditDueDate(task.dueDate || '')
    setEditCategory(
      CATEGORIES.includes(task.category) ? task.category : 'Personal'
    )
    setEditNotes(task.notes || '')
  }

  function cancelEdit() {
    setEditingId(null)
    setEditTitle('')
    setEditPriority('Medium')
    setEditDueDate('')
    setEditCategory('Personal')
    setEditNotes('')
  }

  // Save all editable fields to SQLite.
  async function saveEdit(event) {
    event.preventDefault()

    if (!editTitle.trim()) {
      alert('Task name cannot be empty!')
      return
    }

    try {
      const updated = await apiRequest(`/tasks/${editingId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: editTitle.trim(),
          priority: editPriority,
          dueDate: editDueDate,
          category: editCategory,
          notes: editNotes
        })
      })

      setTasks(previous =>
        previous.map(task => task.id === editingId ? updated : task)
      )

      setNotice(
        `Updated: ${updated.category} · Notes ${
          updated.notes ? 'saved' : 'empty'
        }`
      )

      cancelEdit()
    } catch (error) {
      handleError(error)
    }
  }

  // Delete all completed tasks.
  async function clearCompleted() {
    const count = tasks.filter(task => task.completed).length

    if (!count) return

    if (!window.confirm(`Delete all ${count} completed tasks?`)) {
      return
    }

    try {
      await apiRequest('/tasks/completed', {
        method: 'DELETE'
      })

      if (
        tasks.some(task =>
          task.id === editingId && task.completed
        )
      ) {
        cancelEdit()
      }

      setTasks(previous => previous.filter(task => !task.completed))

      if (filter === 'completed') {
        setFilter('all')
      }

      setNotice('Completed tasks cleared.')
    } catch (error) {
      handleError(error)
    }
  }

  // Dashboard statistics.
  const total = tasks.length
  const completed = tasks.filter(task => task.completed).length
  const pending = total - completed
  const overdue = tasks.filter(isOverdue).length
  const dueToday = tasks.filter(isDueToday).length

  const progress = total
    ? Math.round((completed / total) * 100)
    : 0

  const upcoming = tasks
    .filter(isUpcoming)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))

  // Search includes title, category and notes.
  const visibleTasks = tasks
    .filter(task => {
      const text = [
        task.title || '',
        task.category || '',
        task.notes || ''
      ].join(' ').toLowerCase()

      const matchesSearch = text.includes(search.trim().toLowerCase())

const matchesFilter =
  filter === 'all' ||
  (filter === 'pending' && !task.completed) ||
  (filter === 'completed' && task.completed) ||
  (filter === 'overdue' && isOverdue(task))

const matchesCategory =
  categoryFilter === 'all' ||
  (task.category || 'Personal') === categoryFilter

return matchesSearch && matchesFilter && matchesCategory
    })
    .sort((a, b) => {
      if (sortBy === 'priority') {
        const rank = { High: 3, Medium: 2, Low: 1 }

        return (rank[b.priority] || 2) - (rank[a.priority] || 2)
      }

      if (sortBy === 'dueDate') {
        if (!a.dueDate && !b.dueDate) return 0
        if (!a.dueDate) return 1
        if (!b.dueDate) return -1

        return a.dueDate.localeCompare(b.dueDate)
      }

      if (sortBy === 'oldest') {
        return (a.createdAt || a.id) - (b.createdAt || b.id)
      }

      return (b.createdAt || b.id) - (a.createdAt || a.id)
    })

  return (
    <main className="app">
      <section className="todo-card">
        <p className="eyebrow">YOUR DAILY PLANNER</p>

        <h1>My To-Do List</h1>

        <p className="subtitle">
          Plan your day. Get things done.
        </p>

        <div
          style={{
            margin: '14px 0',
            color: apiStatus === 'Connected to SQLite'
              ? '#55e6a5'
              : '#ffd166'
          }}
        >
          ● {apiStatus}
        </div>

        {notice && (
          <p
            role="status"
            style={{
              color: '#9ff2c9',
              overflowWrap: 'anywhere'
            }}
          >
            {notice}
          </p>
        )}

        {/* Add Task Form */}
        <form
          className="task-form task-form-advanced"
          onSubmit={addTask}
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))',
            gap: '12px'
          }}
        >
          <input
            style={fieldStyle}
            type="text"
            placeholder="What do you need to do?"
            value={input}
            onChange={event => setInput(event.target.value)}
            required
          />

          <select
            style={fieldStyle}
            value={priority}
            onChange={event => setPriority(event.target.value)}
            aria-label="Task priority"
          >
            {PRIORITIES.map(item => (
              <option key={item} value={item}>
                {item} priority
              </option>
            ))}
          </select>

          <input
            style={fieldStyle}
            type="date"
            value={dueDate}
            onChange={event => setDueDate(event.target.value)}
            aria-label="Due date"
          />

          <select
            style={fieldStyle}
            value={category}
            onChange={event => setCategory(event.target.value)}
            aria-label="Task category"
          >
            {CATEGORIES.map(item => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>

          <textarea
            style={{
              ...fieldStyle,
              gridColumn: '1 / -1',
              minHeight: '82px',
              resize: 'vertical'
            }}
            placeholder="Notes (optional): Add task details..."
            value={notes}
            onChange={event => setNotes(event.target.value)}
            rows={2}
            aria-label="Task notes"
          />

          <button
            type="submit"
            disabled={!ready || apiStatus !== 'Connected to SQLite'}
          >
            + Add Task
          </button>
        </form>

        {/* Dashboard */}
        <section
          style={{
            margin: '28px 0',
            padding: '20px',
            borderRadius: '18px',
            background: '#151a2d',
            border: '2px solid #606b96',
            color: '#fff',
            textAlign: 'left'
          }}
        >
          <h2 style={{ marginTop: 0 }}>📊 Dashboard</h2>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(115px, 1fr))',
              gap: '12px'
            }}
          >
            <div style={cardStyle}>
              <span>📋 Total Tasks</span>
              <strong style={{ fontSize: 30 }}>{total}</strong>
            </div>

            <div style={cardStyle}>
              <span>✅ Completed</span>
              <strong style={{ fontSize: 30, color: '#55e6a5' }}>
                {completed}
              </strong>
            </div>

            <div style={cardStyle}>
              <span>⏳ Pending</span>
              <strong style={{ fontSize: 30, color: '#ffd166' }}>
                {pending}
              </strong>
            </div>

            <div style={cardStyle}>
              <span>⚠️ Overdue</span>
              <strong style={{ fontSize: 30, color: '#ff7777' }}>
                {overdue}
              </strong>
            </div>

            <div style={cardStyle}>
              <span>📅 Due Today</span>
              <strong style={{ fontSize: 30, color: '#80bdff' }}>
                {dueToday}
              </strong>
            </div>
          </div>

          <div
            style={{
              marginTop: 24,
              padding: 16,
              background: '#20263d',
              borderRadius: 12
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 10,
                marginBottom: 12
              }}
            >
              <strong>Overall Progress</strong>

              <strong style={{ color: '#55e6a5', fontSize: 24 }}>
                {progress}%
              </strong>
            </div>

            <div
              style={{
                width: '100%',
                height: 16,
                background: '#454d66',
                borderRadius: 20,
                overflow: 'hidden'
              }}
            >
              <div
                style={{
                  width: `${progress}%`,
                  height: '100%',
                  background: '#55e6a5',
                  transition: 'width .3s ease'
                }}
              />
            </div>

            <p>
              {total === 0
                ? 'Add a task to start tracking your progress.'
                : `${completed} out of ${total} tasks completed.`}
            </p>
          </div>

          <div
            style={{
              marginTop: 20,
              padding: 16,
              background: '#20263d',
              borderRadius: 12
            }}
          >
            <h3 style={{ marginTop: 0 }}>
              🗓️ Upcoming Deadlines (Next 7 Days)
            </h3>

            {upcoming.length === 0 ? (
              <p>No upcoming deadlines in the next 7 days.</p>
            ) : (
              <ul>
                {upcoming.slice(0, 5).map(task => (
                  <li key={task.id} style={{ padding: '6px 0' }}>
                    {task.title} — {formatDate(task.dueDate)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* Search */}
        <div className="search-box">
          <input
            type="search"
            placeholder="🔍 Search tasks, categories or notes..."
            value={search}
            onChange={event => setSearch(event.target.value)}
          />

          {search && (
            <button type="button" onClick={() => setSearch('')}>
              Clear
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="task-filters">
          {[
            ['all', `All (${total})`],
            ['pending', `Pending (${pending})`],
            ['completed', `Completed (${completed})`],
            ['overdue', `Overdue (${overdue})`]
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={
                filter === value ? 'filter-btn active' : 'filter-btn'
              }
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Sorting and bulk action */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
            margin: '18px 0'
          }}
        >
          <label>
            Sort tasks:{' '}
            <select
              value={sortBy}
              onChange={event => setSortBy(event.target.value)}
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="priority">Highest priority first</option>
              <option value="dueDate">Earliest due date first</option>
            </select>
          </label>

          <button
            type="button"
            onClick={clearCompleted}
            disabled={completed === 0}
          >
            Clear Completed
          </button>
        </div>

        {/* Task List */}
        {!ready ? (
          <div className="empty-state">
            <h3>Loading your tasks...</h3>
          </div>
        ) : visibleTasks.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">📝</span>

            <h3>
              {total === 0
                ? 'No tasks yet!'
                : search
                  ? 'No matching tasks!'
                  : filter === 'overdue'
                    ? 'No overdue tasks!'
                    : filter === 'completed'
                      ? 'No completed tasks!'
                      : 'No tasks in this filter!'}
            </h3>

            <p>
              {total === 0
                ? 'Add your first task to get started.'
                : 'Try changing your search or filter.'}
            </p>
          </div>
        ) : (
          <ul className="task-list">
            {visibleTasks.map(task => (
              <li className="task-item" key={task.id}>
                {editingId === task.id ? (
                  <form
                    onSubmit={saveEdit}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
                      gap: 10,
                      width: '100%'
                    }}
                  >
                    <input
                      style={fieldStyle}
                      type="text"
                      value={editTitle}
                      onChange={event => setEditTitle(event.target.value)}
                      placeholder="Task name"
                      required
                    />

                    <select
                      style={fieldStyle}
                      value={editPriority}
                      onChange={event => setEditPriority(event.target.value)}
                    >
                      {PRIORITIES.map(item => (
                        <option key={item} value={item}>
                          {item} priority
                        </option>
                      ))}
                    </select>

                    <input
                      style={fieldStyle}
                      type="date"
                      value={editDueDate}
                      onChange={event => setEditDueDate(event.target.value)}
                    />

                    <select
                      style={fieldStyle}
                      value={editCategory}
                      onChange={event => setEditCategory(event.target.value)}
                    >
                      {CATEGORIES.map(item => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>

                    <textarea
                      style={{
                        ...fieldStyle,
                        gridColumn: '1 / -1',
                        minHeight: 75,
                        resize: 'vertical'
                      }}
                      value={editNotes}
                      onChange={event => setEditNotes(event.target.value)}
                      placeholder="Notes (optional)"
                      rows={2}
                    />

                    <div className="task-actions">
                      <button type="submit" className="edit-btn">
                        Save Changes
                      </button>

                      <button
                        type="button"
                        className="delete-btn"
                        onClick={cancelEdit}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <label className="task-label">
                      <input
                        type="checkbox"
                        checked={Boolean(task.completed)}
                        onChange={() => toggleTask(task.id)}
                      />

                      <span className={task.completed ? 'done' : ''}>
                        {task.title}
                      </span>
                    </label>

                    <div className="task-details">
                      <span
                        className={`priority-badge priority-${(
                          task.priority || 'Medium'
                        ).toLowerCase()}`}
                      >
                        {task.priority || 'Medium'} Priority
                      </span>

                      <span
                        style={{
                          display: 'inline-block',
                          padding: '5px 9px',
                          margin: 3,
                          borderRadius: 8,
                          background: '#26396a',
                          color: '#dce7ff',
                          fontSize: '.85rem'
                        }}
                      >
                        📂 {CATEGORIES.includes(task.category)
                          ? task.category
                          : 'Personal'}
                      </span>

                      <span
                        className={`due-date ${
                          isOverdue(task) ? 'overdue' : ''
                        }`}
                      >
                        📅 {dueLabel(task)}
                      </span>
                    </div>

                    {/* Always show notes, even when empty. */}
                    <p
                      style={{
                        margin: '9px 0',
                        padding: '10px 12px',
                        borderRadius: 9,
                        background: 'rgba(255,255,255,.06)',
                        color: '#dce4ff',
                        overflowWrap: 'anywhere'
                      }}
                    >
                      📝 <strong>Notes:</strong>{' '}
                      {task.notes?.trim()
                        ? task.notes
                        : 'No notes added'}
                    </p>

                    <div className="task-actions">
                      <button
                        type="button"
                        className="edit-btn"
                        onClick={() => startEdit(task)}
                      >
                        Edit
                      </button>

                      <button
                        type="button"
                        className="delete-btn"
                        onClick={() => deleteTask(task.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        <p className="footer">
          One task at a time. Keep going!
        </p>
      </section>
    </main>
  )
}

export default App