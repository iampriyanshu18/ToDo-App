"use strict";

/* ==========================================
   FLOWSPACE - CHAT & TODO APP
   ========================================== */

const STORAGE = {
  tasks: "flowspace_tasks_v1",
  messages: "flowspace_messages_v1",
  theme: "flowspace_theme_v1",
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function loadData(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : JSON.parse(value);
  } catch (error) {
    console.warn("Could not load saved data:", error);
    return fallback;
  }
}

function saveData(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error("Could not save data:", error);
    showToast("Could not save data. Check your browser storage.", true);
    return false;
  }
}

function escapeHTML(value) {
  return String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[char],
  );
}

function makeId() {
  return (
    window.crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

function timeNow() {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function dateLabel(date = new Date()) {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/* ==========================================
   APP STATE
   ========================================== */

let tasks = loadData(STORAGE.tasks, []);
let messages = loadData(STORAGE.messages, []);
let currentFilter = "all";
let currentView = "dashboard";
let editingTaskId = null;
let taskSearch = "";
let searchOpen = false;

if (!Array.isArray(tasks)) tasks = [];
if (!Array.isArray(messages)) messages = [];

// Validate stored records before rendering them.
tasks = tasks
  .filter(
    (task) =>
      task && typeof task.id === "string" && typeof task.title === "string",
  )
  .map((task) => ({
    id: task.id,
    title: task.title.slice(0, 180),
    completed: Boolean(task.completed),
    priority: ["high", "medium", "low"].includes(task.priority)
      ? task.priority
      : "medium",
    createdAt:
      typeof task.createdAt === "string"
        ? task.createdAt
        : new Date().toISOString(),
    completedAt: task.completedAt || null,
  }));

messages = messages
  .filter(
    (message) =>
      message &&
      typeof message.id === "string" &&
      ["user", "bot"].includes(message.role) &&
      typeof message.text === "string",
  )
  .map((message) => ({
    ...message,
    text: message.text.slice(0, 5000),
  }));

/* ==========================================
   NOTIFICATIONS
   ========================================== */

function showToast(text, isError = false) {
  const container = $("#toastContainer");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast${isError ? " error" : ""}`;

  const icon = document.createElement("i");
  icon.className = isError
    ? "fa-solid fa-circle-exclamation"
    : "fa-solid fa-circle-check";

  const label = document.createElement("span");
  label.textContent = text;

  toast.append(icon, label);
  container.appendChild(toast);

  window.setTimeout(() => toast.remove(), 3200);
}

/* ==========================================
   TASK MANAGEMENT
   ========================================== */

function addTask(title, priority = "medium") {
  title = title.trim();

  if (!title) {
    showToast("Please enter a task title.", true);
    return false;
  }

  if (title.length > 180) {
    showToast("Task titles must be 180 characters or less.", true);
    return false;
  }

  const task = {
    id: makeId(),
    title,
    completed: false,
    priority: ["high", "medium", "low"].includes(priority)
      ? priority
      : "medium",
    createdAt: new Date().toISOString(),
    completedAt: null,
  };

  tasks.unshift(task);
  saveData(STORAGE.tasks, tasks);
  renderTasks();
  showToast("Task added successfully!");
  return true;
}

function toggleTask(id) {
  const task = tasks.find((item) => item.id === id);
  if (!task) return;

  task.completed = !task.completed;
  task.completedAt = task.completed ? new Date().toISOString() : null;

  saveData(STORAGE.tasks, tasks);
  renderTasks();

  showToast(task.completed ? "Task completed!" : "Task marked active.");
}

function deleteTask(id) {
  const task = tasks.find((item) => item.id === id);
  if (!task) return;

  tasks = tasks.filter((item) => item.id !== id);
  saveData(STORAGE.tasks, tasks);
  renderTasks();
  showToast("Task deleted.");
}

function clearCompletedTasks() {
  const completedCount = tasks.filter((task) => task.completed).length;

  if (!completedCount) {
    showToast("There are no completed tasks.", true);
    return;
  }

  tasks = tasks.filter((task) => !task.completed);
  saveData(STORAGE.tasks, tasks);
  renderTasks();
  showToast(`${completedCount} completed task(s) cleared.`);
}

function openEditModal(id) {
  const task = tasks.find((item) => item.id === id);
  if (!task) return;

  editingTaskId = id;
  $("#editTaskTitle").value = task.title;
  $("#editTaskPriority").value = task.priority;
  $("#taskModal").classList.remove("hidden");

  window.setTimeout(() => $("#editTaskTitle").focus(), 50);
}

function closeEditModal() {
  $("#taskModal").classList.add("hidden");
  editingTaskId = null;
}

$("#editTaskForm").addEventListener("submit", (event) => {
  event.preventDefault();

  const task = tasks.find((item) => item.id === editingTaskId);
  if (!task) return;

  const title = $("#editTaskTitle").value.trim();
  if (!title) {
    showToast("Task title cannot be empty.", true);
    return;
  }

  task.title = title.slice(0, 180);
  task.priority = $("#editTaskPriority").value;

  saveData(STORAGE.tasks, tasks);
  closeEditModal();
  renderTasks();
  showToast("Task updated successfully!");
});

$("#closeTaskModal").addEventListener("click", closeEditModal);
$("#cancelTaskEdit").addEventListener("click", closeEditModal);

$("#taskModal").addEventListener("click", (event) => {
  if (event.target === $("#taskModal")) closeEditModal();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeEditModal();
    $("#sidebar").classList.remove("sidebar-open");
  }
});

/* ==========================================
   TASK FILTERS AND RENDERING
   ========================================== */

function getVisibleTasks() {
  return tasks.filter((task) => {
    const matchesFilter =
      currentFilter === "all" ||
      (currentFilter === "active" && !task.completed) ||
      (currentFilter === "completed" && task.completed);

    const matchesSearch = task.title
      .toLowerCase()
      .includes(taskSearch.toLowerCase());

    return matchesFilter && matchesSearch;
  });
}

function taskHTML(task) {
  const created = new Date(task.createdAt);
  const date = Number.isNaN(created.getTime())
    ? "Recently added"
    : dateLabel(created);

  return `
    <div class="task-row ${task.completed ? "is-completed" : ""}"
         data-task-id="${escapeHTML(task.id)}">
      <button
        class="task-check ${task.completed ? "checked" : ""}"
        data-action="toggle"
        data-id="${escapeHTML(task.id)}"
        aria-label="${task.completed ? "Mark active" : "Mark complete"}"
        aria-pressed="${task.completed}">
        ${task.completed ? '<i class="fa-solid fa-check"></i>' : ""}
      </button>

      <div class="task-content">
        <span class="task-title">${escapeHTML(task.title)}</span>
        <div class="task-meta">
          <span>${escapeHTML(date)}</span>
          <span>·</span>
          <span class="priority-badge priority-${task.priority}">
            ${task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
          </span>
          ${task.completed ? "<span>·</span><span>Completed</span>" : ""}
        </div>
      </div>

      <div class="task-actions">
        <button class="task-action"
          data-action="edit"
          data-id="${escapeHTML(task.id)}"
          aria-label="Edit task">
          <i class="fa-solid fa-pen"></i>
        </button>
        <button class="task-action delete"
          data-action="delete"
          data-id="${escapeHTML(task.id)}"
          aria-label="Delete task">
          <i class="fa-regular fa-trash-can"></i>
        </button>
      </div>
    </div>
  `;
}

function renderTaskList(container, emptyState, list, limit = Infinity) {
  const visible = list.slice(0, limit);
  container.innerHTML = visible.map(taskHTML).join("");
  emptyState.style.display = visible.length ? "none" : "block";
}

function renderTasks() {
  const visible = getVisibleTasks();
  const active = tasks.filter((task) => !task.completed).length;
  const completed = tasks.length - active;
  const percent = tasks.length
    ? Math.round((completed / tasks.length) * 100)
    : 0;

  // Dashboard statistics
  $("#totalStat").textContent = tasks.length;
  $("#activeStat").textContent = active;
  $("#completedStat").textContent = completed;
  $("#completionStat").textContent = `${percent}%`;
  $("#completionBar").style.width = `${percent}%`;

  $("#navTaskCount").textContent = active;
  $("#headingTaskCount").textContent = tasks.length;
  $("#sidebarProgress").style.width = `${percent}%`;
  $("#sidebarProgressText").textContent = `${percent}% completed`;

  $("#taskFooterText").textContent = tasks.length
    ? `${completed} of ${tasks.length} tasks completed`
    : "Ready when you are.";

  $("#clearCompleted").classList.toggle("hidden", completed === 0);
  $("#clearCompletedFull").disabled = completed === 0;

  // Dashboard: show a maximum of six tasks.
  renderTaskList($("#dashboardTaskList"), $("#dashboardEmpty"), visible, 6);

  // Full task manager: show all matching tasks.
  renderTaskList($("#fullTaskList"), $("#fullTasksEmpty"), visible);

  $("#fullTaskCount").textContent =
    `${visible.length} task${visible.length === 1 ? "" : "s"}`;

  // Keep filter controls synchronized.
  $$(".filter-tab").forEach((button) => {
    button.classList.toggle("active", button.dataset.filter === currentFilter);
  });

  $$(".filter-nav").forEach((button) => {
    button.classList.toggle("active", button.dataset.filter === currentFilter);
  });

  $("#taskSearchBox").classList.toggle("hidden", !searchOpen);
}

function setFilter(filter) {
  if (!["all", "active", "completed"].includes(filter)) return;

  currentFilter = filter;
  renderTasks();
}

document.addEventListener("click", (event) => {
  const filterButton = event.target.closest("[data-filter]");

  if (filterButton) {
    setFilter(filterButton.dataset.filter);

    if (filterButton.classList.contains("filter-nav")) {
      switchView("tasks");
    }
  }

  const actionButton = event.target.closest("[data-action]");
  if (!actionButton) return;

  const id = actionButton.dataset.id;
  const action = actionButton.dataset.action;

  if (action === "toggle") toggleTask(id);
  if (action === "edit") openEditModal(id);
  if (action === "delete") deleteTask(id);
});

$("#quickTaskForm").addEventListener("submit", (event) => {
  event.preventDefault();

  const input = $("#quickTaskInput");
  if (addTask(input.value)) input.value = "";
});

$("#fullTaskForm").addEventListener("submit", (event) => {
  event.preventDefault();

  const input = $("#fullTaskInput");
  const priority = $("#taskPriority").value;

  if (addTask(input.value, priority)) {
    input.value = "";
    input.focus();
  }
});

$("#quickAddButton").addEventListener("click", () => {
  switchView("dashboard");
  $("#quickTaskInput").focus();
});

$("#focusAddButton").addEventListener("click", () => {
  $("#fullTaskInput").focus();
});

$("#viewAllTasks").addEventListener("click", () => {
  switchView("tasks");
});

$("#clearCompleted").addEventListener("click", clearCompletedTasks);
$("#clearCompletedFull").addEventListener("click", clearCompletedTasks);

$("#taskSearchToggle").addEventListener("click", () => {
  searchOpen = !searchOpen;
  $("#taskSearchBox").classList.toggle("hidden", !searchOpen);

  if (searchOpen) {
    $("#taskSearchInput").focus();
  } else {
    taskSearch = "";
    $("#taskSearchInput").value = "";
    renderTasks();
  }
});

$("#closeTaskSearch").addEventListener("click", () => {
  searchOpen = false;
  taskSearch = "";
  $("#taskSearchInput").value = "";
  renderTasks();
});

$("#taskSearchInput").addEventListener("input", (event) => {
  taskSearch = event.target.value;
  renderTasks();
});

/* ==========================================
   CHAT SYSTEM
   ========================================== */

const welcomeMessage = {
  id: "welcome-message",
  role: "bot",
  text: "Hey there! 👋 Welcome to FlowSpace. I'm your demo productivity assistant. I can help you organize tasks, review your progress, and share productivity tips.",
  time: timeNow(),
};

function addMessage(role, text) {
  const message = {
    id: makeId(),
    role,
    text: String(text).slice(0, 5000),
    time: timeNow(),
  };

  messages.push(message);

  // Avoid unbounded storage growth.
  if (messages.length > 300) {
    messages = messages.slice(-300);
  }

  saveData(STORAGE.messages, messages);
  renderChat();
}

function renderChat() {
  const chatContainers = [$("#dashboardChatMessages"), $("#fullChatMessages")];

  const chatHistory = messages.length ? messages : [welcomeMessage];

  chatContainers.forEach((container) => {
    if (!container) return;

    container.innerHTML = chatHistory
      .map((message) => {
        const isUser = message.role === "user";

        return `
        <div class="message ${isUser ? "user-message" : ""}"
             data-message-id="${escapeHTML(message.id)}">
          <div class="message-avatar">
            ${
              isUser
                ? '<i class="fa-solid fa-user"></i>'
                : '<i class="fa-solid fa-sparkles"></i>'
            }
          </div>
          <div class="message-body">
            <div class="message-name">${isUser ? "You" : "FlowSpace Assistant"}</div>
            <div class="message-bubble">${escapeHTML(message.text)}</div>
            <span class="message-time">${escapeHTML(message.time || "")}</span>
          </div>
        </div>
      `;
      })
      .join("");

    container.scrollTop = container.scrollHeight;
  });
}

function getBotReply(text) {
  const lower = text.toLowerCase();

  const active = tasks.filter((task) => !task.completed);
  const completed = tasks.filter((task) => task.completed);
  const high = active.filter((task) => task.priority === "high");

  if (/\b(hello|hi|hey|good morning|good evening)\b/.test(lower)) {
    return "Hello! 👋 Ready to make some progress? Tell me what you're working on, or add a task to your workspace.";
  }

  if (/\b(help|what can you do|features)\b/.test(lower)) {
    return "Here's what you can do in FlowSpace:\n\n• Add and manage tasks\n• Set task priorities\n• Mark tasks as complete\n• Search and filter tasks\n• Track your progress\n• Keep notes in this chat\n\nTry asking me to plan your day!";
  }

  if (/\b(progress|statistics|stats|how many|completed|status)\b/.test(lower)) {
    return `Here's your current progress:\n\n📋 Total tasks: ${tasks.length}\n⏳ In progress: ${active.length}\n✅ Completed: ${completed.length}\n📈 Completion rate: ${tasks.length ? Math.round((completed.length / tasks.length) * 100) : 0}%`;
  }

  if (/\b(plan my day|organize my day|schedule|priorit)\b/.test(lower)) {
    if (!active.length) {
      return "Your task list is clear! 🎉 Add the things you need to do, and I can help you organize them.";
    }

    const ordered = [...active].sort((a, b) => {
      const weight = { high: 0, medium: 1, low: 2 };
      return weight[a.priority] - weight[b.priority];
    });

    return (
      "Here's a suggested plan for your day:\n\n" +
      ordered
        .slice(0, 6)
        .map(
          (task, index) =>
            `${index + 1}. ${task.priority === "high" ? "🔴" : task.priority === "medium" ? "🟠" : "🟢"} ${task.title}`,
        )
        .join("\n") +
      (active.length > 6 ? `\n…and ${active.length - 6} more tasks.` : "") +
      "\n\nStart with the most important task, take short breaks, and adjust as needed."
    );
  }

  if (/\b(high priority|urgent|important tasks)\b/.test(lower)) {
    return high.length
      ? "Your high-priority tasks are:\n\n" +
          high.map((task, index) => `${index + 1}. ${task.title}`).join("\n") +
          "\n\nTry to tackle these first."
      : "You don't have any active high-priority tasks. You can assign high priority when adding or editing a task.";
  }

  if (/\b(tip|advice|productive|productivity|focus)\b/.test(lower)) {
    const tips = [
      "Try the 25-minute focus method: work on one task for 25 minutes, then take a 5-minute break.",
      "Pick your three most important tasks before starting your day. Finish the most challenging one first.",
      "Break a big task into smaller steps. Small wins make it easier to keep going.",
      "Silence unnecessary notifications while working on a difficult task. Give yourself uninterrupted focus time.",
      "Before ending your day, review what you completed and choose one priority for tomorrow.",
    ];

    return (
      "Here's a productivity tip for you ✨\n\n" +
      tips[Math.floor(Math.random() * tips.length)]
    );
  }

  if (/\b(thank you|thanks|thank)\b/.test(lower)) {
    return "You're welcome! 😊 Keep going, one small step at a time.";
  }

  if (/\b(bye|goodbye|see you)\b/.test(lower)) {
    return "See you later! 👋 Your tasks are saved in this browser, so you can come back whenever you're ready.";
  }

  return "Thanks for sharing that! 💜 I'm running as a local demo, so I don't have a connected AI model. You can ask me to plan your day, show your progress, list high-priority tasks, or give you a productivity tip.";
}

function sendChatMessage(text) {
  text = text.trim();
  if (!text) return;

  addMessage("user", text);

  // This is a local demo response, not a real AI API call.
  window.setTimeout(() => {
    addMessage("bot", getBotReply(text));
  }, 350);
}

function bindChatForm(formId, inputId) {
  $(formId).addEventListener("submit", (event) => {
    event.preventDefault();

    const input = $(inputId);
    const value = input.value.trim();
    if (!value) return;

    input.value = "";
    sendChatMessage(value);
    input.focus();
  });
}

bindChatForm("#dashboardChatForm", "#dashboardChatInput");
bindChatForm("#fullChatForm", "#fullChatInput");

document.addEventListener("click", (event) => {
  const suggestion = event.target.closest("[data-message]");
  if (!suggestion) return;

  const message = suggestion.dataset.message;
  switchView("chat");
  sendChatMessage(message);
});

function resetChat() {
  if (!window.confirm("Clear all saved chat messages?")) return;

  messages = [];
  saveData(STORAGE.messages, messages);
  renderChat();
  showToast("Conversation cleared.");
}

$("#clearChatButton").addEventListener("click", resetChat);
$("#newChatButton").addEventListener("click", resetChat);

/* ==========================================
   NAVIGATION
   ========================================== */

const viewTitles = {
  dashboard: "Overview",
  tasks: "My Tasks",
  chat: "Team Chat",
};

function switchView(view) {
  if (!viewTitles[view]) return;

  currentView = view;

  $$(".view").forEach((section) => {
    section.classList.toggle("active-view", section.id === `${view}View`);
  });

  $$(".main-nav .nav-item[data-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
  });

  $("#breadcrumbTitle").textContent = viewTitles[view];
  $("#sidebar").classList.remove("sidebar-open");

  if (view === "chat") renderChat();
  if (view === "tasks") renderTasks();
}

$$(".main-nav [data-view]").forEach((button) => {
  button.addEventListener("click", () => {
    switchView(button.dataset.view);
  });
});

$("#menuToggle").addEventListener("click", () => {
  $("#sidebar").classList.toggle("sidebar-open");
});

document.addEventListener("click", (event) => {
  const sidebar = $("#sidebar");
  const menuButton = $("#menuToggle");

  if (
    window.innerWidth <= 760 &&
    sidebar.classList.contains("sidebar-open") &&
    !sidebar.contains(event.target) &&
    !menuButton.contains(event.target)
  ) {
    sidebar.classList.remove("sidebar-open");
  }
});

/* ==========================================
   DARK MODE
   ========================================== */

function applyTheme(theme) {
  const isDark = theme === "dark";

  document.body.classList.toggle("dark-mode", isDark);

  $("#themeIcon").className = isDark
    ? "fa-regular fa-sun"
    : "fa-regular fa-moon";

  $("#themeLabel").textContent = isDark ? "Light mode" : "Dark mode";
}

const savedTheme = loadData(STORAGE.theme, "light");
applyTheme(savedTheme === "dark" ? "dark" : "light");

$("#themeToggle").addEventListener("click", () => {
  const isDark = !document.body.classList.contains("dark-mode");
  const nextTheme = isDark ? "dark" : "light";

  applyTheme(nextTheme);
  saveData(STORAGE.theme, nextTheme);
  showToast(`${isDark ? "Dark" : "Light"} mode enabled.`);
});

/* ==========================================
   HEADER AND INITIALIZATION
   ========================================== */

function updateDate() {
  $("#todayLabel").textContent = new Date().toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

$("#notificationButton").addEventListener("click", () => {
  const active = tasks.filter((task) => !task.completed).length;
  showToast(
    active
      ? `You have ${active} task(s) waiting for you.`
      : "You're all caught up. Add a task whenever you're ready!",
  );
});

$("#profileButton").addEventListener("click", () => {
  showToast("You're using your local FlowSpace demo profile.");
});

$$(".current-year").forEach((element) => {
  element.textContent = new Date().getFullYear();
});

function initializeApp() {
  updateDate();

  // Ensure the initial data exists in local storage.
  saveData(STORAGE.tasks, tasks);

  renderTasks();
  renderChat();
  switchView("dashboard");
}

initializeApp();
