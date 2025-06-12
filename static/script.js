// script.js

// --- Configurable ---
const pageSize = 25;
let currentPage = 1;
let data = [];
let columns = [];
let originalColumns = []; // Keep track of original column order and names
let dragSrcIndex = null;
let colWidths = {}; // store column widths
let ws = null; // WebSocket object
let currentTaskId = 'N/A'; // Stores the current task ID

// Base URL for initial data fetch (from port 3001)
const DATA_API_BASE_URL = 'http://127.0.0.1:3001/api';
// Base URL for all other export-related API interactions (to port 8080 with /api/export prefix)
const EXPORT_API_BASE_URL = 'http://127.0.0.1:8080/api/export';

// --- Status Helper ---
function setStatus(type, txt) {
  const s = document.getElementById("status");
  s.textContent = txt;
  s.className = "status " + type;
}

// --- Fetch Data ---
async function fetchData() {
  setStatus('processing', 'Loading data...');
  try {
    // Fetch data from the DATA_API_BASE_URL and the '/data' endpoint
    const res = await fetch(`${DATA_API_BASE_URL}/data`);
    if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
    }
    data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
        columns = Object.keys(data[0]);
        originalColumns = [...columns]; // Store original column order
    } else {
        columns = []; // Ensure columns is empty if no data
        originalColumns = [];
        setStatus('error', 'No data to display');
        return; // Exit if no data
    }
    setStatus('ok', 'OK');
    renderTable();
  } catch (error) {
    console.error("Error fetching data:", error);
    setStatus('error', 'Error fetching data');
    // Fallback to mock data if API fetch fails
    data = [
        { "id": 1, "name": "Alice", "age": 30, "city": "New York", "occupation": "Engineer" },
        { "id": 2, "name": "Bob", "age": 24, "city": "Los Angeles", "occupation": "Designer" },
        { "id": 3, "name": "Charlie", "age": 35, "city": "Chicago", "occupation": "Doctor" },
        { "id": 4, "name": "Diana", "age": 28, "city": "Houston", "occupation": "Artist" },
        { "id": 5, "name": "Eve", "age": 22, "city": "Phoenix", "occupation": "Student" },
        { "id": 6, "name": "Frank", "age": 40, "city": "Philadelphia", "occupation": "Manager" },
        { "id": 7, "name": "Grace", "age": 29, "city": "San Antonio", "occupation": "Analyst" },
        { "id": 8, "name": "Heidi", "age": 31, "city": "San Diego", "occupation": "Developer" },
        { "id": 9, "name": "Ivan", "age": 26, "city": "Dallas", "occupation": "Consultant" },
        { "id": 10, "name": "Judy", "age": 33, "city": "San Jose", "occupation": "Architect" },
        { "id": 11, "name": "Kyle", "age": 27, "city": "Austin", "occupation": "Scientist" },
        { "id": 12, "name": "Liam", "age": 38, "city": "Jacksonville", "occupation": "Accountant" },
        { "id": 13, "name": "Mia", "age": 23, "city": "Fort Worth", "occupation": "Writer" },
        { "id": 14, "name": "Noah", "age": 30, "city": "Columbus", "occupation": "Editor" },
        { "id": 15, "name": "Olivia", "age": 25, "city": "Charlotte", "occupation": "Researcher" },
        { "id": 16, "name": "Peter", "age": 32, "city": "San Francisco", "occupation": "Marketer" },
        { "id": 17, "name": "Quinn", "age": 29, "city": "Indianapolis", "occupation": "Recruiter" },
        { "id": 18, "name": "Rachel", "age": 34, "city": "Seattle", "occupation": "Librarian" },
        { "id": 19, "name": "Sam", "age": 27, "city": "Denver", "occupation": "Photographer" },
        { "id": 20, "name": "Tina", "age": 31, "city": "Washington", "occupation": "Nurse" },
        { "id": 21, "name": "Uma", "age": 26, "city": "Boston", "occupation": "Therapist" },
        { "id": 22, "name": "Victor", "age": 39, "city": "El Paso", "occupation": "Electrician" },
        { "id": 23, "name": "Wendy", "age": 24, "city": "Detroit", "occupation": "Mechanic" },
        { "id": 24, "name": "Xavier", "age": 30, "city": "Nashville", "occupation": "Plumber" },
        { "id": 25, "name": "Yara", "age": 28, "city": "Memphis", "occupation": "Chef" },
        { "id": 26, "name": "Zane", "age": 33, "city": "Portland", "occupation": "Pilot" },
        { "id": 27, "name": "Anna", "age": 22, "city": "Oklahoma City", "occupation": "Student" },
        { "id": 28, "name": "Ben", "age": 41, "city": "Las Vegas", "occupation": "Engineer" },
        { "id": 29, "name": "Chloe", "age": 29, "city": "Louisville", "occupation": "Designer" },
        { "id": 30, "name": "David", "age": 36, "city": "Baltimore", "occupation": "Doctor" }
    ];
    if (data.length > 0) {
        columns = Object.keys(data[0]);
        originalColumns = [...columns]; // Store original column order
        setStatus('processing', 'Loaded with fallback data');
    } else {
        columns = [];
        originalColumns = [];
        setStatus('error', 'No fallback data');
    }
    renderTable();
  }
}

// --- Helper function to get original column index ---
function getOriginalColumnIndex(columnName) {
  return originalColumns.indexOf(columnName);
}

// --- Render Table ---
function renderTable() {
  const container = document.getElementById("table-container");
  const start = (currentPage - 1) * pageSize;
  const pageData = data.slice(start, start + pageSize);

  if (!columns.length) {
    container.innerHTML = "<div style='padding:2em;text-align:center;color:var(--text-cyan);'>No data to display. Please ensure your data API is running.</div>";
    document.getElementById("page").textContent = currentPage; // Still show current page
    return;
  }

  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");

  columns.forEach((col, index) => {
    const th = document.createElement("th");
    th.textContent = col;
    th.setAttribute("draggable", true);

    // Set column width if resized
    if (colWidths[col]) {
      th.style.width = colWidths[col] + 'px';
    }

    // Store the original column index for API calls
    th.dataset.originalColumnIndex = getOriginalColumnIndex(col);
    th.dataset.currentDisplayName = col;

    // --- Drag & Drop logic ---
    th.addEventListener("dragstart", (e) => {
      dragSrcIndex = index;
      e.dataTransfer.setData("text/plain", ""); // Required for Firefox
      th.classList.add('dragging');
    });
    th.addEventListener("dragover", (e) => {
      e.preventDefault();
      th.classList.add('drag-over');
    });
    th.addEventListener("dragleave", (e) => {
      th.classList.remove('drag-over');
    });
    th.addEventListener("drop", async (e) => {
      e.preventDefault();
      th.classList.remove('drag-over');
      document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
      if (dragSrcIndex !== null && dragSrcIndex !== index) {
        const movedColumnName = columns[dragSrcIndex]; // Get the name of the column being moved
        const originalIndex = getOriginalColumnIndex(movedColumnName);
        const moved = columns.splice(dragSrcIndex, 1)[0];
        columns.splice(index, 0, moved);
        renderTable(); // Re-render table with new column order

        // Send column reorder to API - use the original index, not the current display index
        await sendColumnReorderToAPI(movedColumnName, originalIndex, index);
        dragSrcIndex = null;
      }
    });
    th.addEventListener("dragend", (e) => {
      th.classList.remove('dragging');
      document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
      dragSrcIndex = null;
    });

    // --- Column Resize ---
    const handle = document.createElement('div');
    handle.className = 'resize-handle';
    handle.addEventListener('mousedown', function(e) {
      e.stopPropagation();
      startResize(e, th, col);
    });
    th.appendChild(handle);

    // --- Double-click to rename column ---
    th.title = "Double-click to rename";
    th.addEventListener('dblclick', function(e) {
      e.preventDefault();
      th.setAttribute("contenteditable", true);
      th.focus();
    });
    th.addEventListener('blur', async function(e) {
      let newName = th.textContent.trim();
      const originalDisplayName = th.dataset.currentDisplayName;
      const originalIndex = th.dataset.originalColumnIndex;

      // Check if the new name is different, not empty, and not a duplicate of existing display names
      if (newName && newName !== originalDisplayName && !columns.some((c, i) => c === newName && i !== columns.indexOf(originalDisplayName))) {
        // Update the columns array with the new name
        const currentLogicalIndex = columns.indexOf(originalDisplayName);
        if (currentLogicalIndex !== -1) {
            columns[currentLogicalIndex] = newName;
            th.dataset.currentDisplayName = newName;
            
            // Update colWidths entry if needed
            if (colWidths[originalDisplayName]) {
                colWidths[newName] = colWidths[originalDisplayName];
                delete colWidths[originalDisplayName];
            }
            
            renderTable(); // Re-render to reflect header change
            
            // Send column rename to API - send both original name and new name
            await sendColumnRenameToAPI(originalDisplayName, newName);
        }
      } else {
        th.textContent = originalDisplayName; // revert to original name if invalid or duplicate
      }
      th.removeAttribute("contenteditable");
    });
    th.addEventListener('keydown', function(e) {
      if (e.key === "Enter") {
        e.preventDefault();
        th.blur();
      }
    });

    headerRow.appendChild(th);
  });

  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  pageData.forEach(row => {
    const tr = document.createElement("tr");
    columns.forEach(col => {
      const td = document.createElement("td");
      // Use the 'col' from the reordered 'columns' array to access data
      td.textContent = row[col] !== undefined ? row[col] : "";
      // Set cell width to match header if resized
      if (colWidths[col]) {
        td.style.width = colWidths[col] + 'px';
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  container.innerHTML = "";
  container.appendChild(table);

  document.getElementById("page").textContent = currentPage;
}

// --- Column Resize Logic ---
let resizingCol = null;
let startX = 0;
let startWidth = 0;

function startResize(e, th, colName) {
  resizingCol = { th, colName };
  startX = e.clientX;
  startWidth = th.offsetWidth;
  document.body.style.cursor = 'col-resize';
  document.addEventListener('mousemove', resizeCol);
  document.addEventListener('mouseup', stopResize);
}

function resizeCol(e) {
  if (!resizingCol) return;
  let diff = e.clientX - startX;
  let newWidth = Math.max(48, startWidth + diff); // min width 48px
  colWidths[resizingCol.colName] = newWidth;
  // Re-render only the affected column's width to avoid full table redraw during drag
  resizingCol.th.style.width = newWidth + 'px';
}

function stopResize(e) {
  if (!resizingCol) return; // Prevent error if stopResize called without startResize
  resizingCol = null;
  document.body.style.cursor = '';
  document.removeEventListener('mousemove', resizeCol);
  document.removeEventListener('mouseup', stopResize);
  renderTable(); // Re-render table to apply final widths to all cells consistently
}

// --- Pagination ---
function nextPage() {
  if ((currentPage * pageSize) < data.length) {
    currentPage++;
    renderTable();
  }
}
function prevPage() {
  if (currentPage > 1) {
    currentPage--;
    renderTable();
  }
}

// --- API Interactions ---

// Sends column reorder to the FastAPI /input endpoint
async function sendColumnReorderToAPI(columnName, originalIndex, newOrder) {
    const params = {
        name: columnName,
        column: originalIndex, // Corrected from 'coloumn' to 'column'
        change_order: newOrder
    };
    const queryParams = new URLSearchParams(params).toString();
    
    try {
        const response = await fetch(`${EXPORT_API_BASE_URL}/input?${queryParams}`);
        if (!response.ok) {
            throw new Error(`Failed to send column reorder: ${response.statusText}`);
        }
        const result = await response.json();
        console.log("Column reorder sent to API:", result);
        setStatus('processing', 'Column reordered on server');
        setTimeout(() => {
            if (document.getElementById("status").textContent === "Column reordered on server") {
                setStatus('ok', 'OK');
            }
        }, 1500);
    } catch (error) {
        console.error("Error sending column reorder to API:", error);
        setStatus('error', 'Error reordering column');
    }
}

// Sends column rename to the FastAPI /input endpoint
async function sendColumnRenameToAPI(originalDisplayName, newName) { // Added originalDisplayName parameter
    const params = {
        name: originalDisplayName, // Use 'name' for the original column name
        new_name: newName
    };
    const queryParams = new URLSearchParams(params).toString();
    
    try {
        const response = await fetch(`${EXPORT_API_BASE_URL}/input?${queryParams}`);
        if (!response.ok) {
            throw new Error(`Failed to send column rename: ${response.statusText}`);
        }
        const result = await response.json();
        console.log("Column rename sent to API:", result);
        setStatus('processing', 'Column renamed on server');
        setTimeout(() => {
            if (document.getElementById("status").textContent === "Column renamed on server") {
                setStatus('ok', 'OK');
            }
        }, 1500);
    } catch (error) {
        console.error("Error sending column rename to API:", error);
        setStatus('error', 'Error renaming column');
    }
}

// Initiates the processing on the FastAPI backend
async function startProcessing() {
    setStatus('processing', 'Starting process...');
    document.getElementById('startBtn').disabled = true; // Disable button while processing
    document.getElementById('downloadBtn').style.display = 'none'; // Hide download button

    try {
        // Send to EXPORT_API_BASE_URL
        const response = await fetch(`${EXPORT_API_BASE_URL}/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        if (!response.ok) {
            throw new Error(`Failed to start process: ${response.statusText}`);
        }
        const result = await response.json();
        currentTaskId = result.task_id;
        document.getElementById('task_id').textContent = currentTaskId;
        console.log("Process started with Task ID:", currentTaskId);
        setupWebSocket(currentTaskId); // Establish WebSocket connection
    } catch (error) {
        console.error("Error starting process:", error);
        setStatus('error', 'Failed to start process');
        document.getElementById('startBtn').disabled = false; // Re-enable button on error
    }
}

// Sets up the WebSocket connection for real-time status updates
function setupWebSocket(task_id) {
    if (ws) {
        ws.close(); // Close existing connection if any
    }
    // WebSocket URL uses EXPORT_API_BASE_URL's host and path, replacing http with ws
    const wsUrl = EXPORT_API_BASE_URL.replace('http://', 'ws://') + `/ws/${task_id}`;
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log(`WebSocket connected for task ${task_id}`);
        setStatus('processing', 'Connected to process');
    };

    ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        console.log("WebSocket message:", message);
        if (message.status) {
            setStatus(message.status, message.message);
            if (message.status === "completed") { // Matches "completed" from FastAPI
                document.getElementById('downloadBtn').style.display = 'inline-block';
                document.getElementById('downloadBtn').onclick = () => {
                    window.location.href = `${EXPORT_API_BASE_URL}/download/${currentTaskId}`;
                };
                document.getElementById('startBtn').disabled = false;
            } else if (message.status === "failed") { // Matches "failed" from FastAPI
                document.getElementById('startBtn').disabled = false;
            }
        }
    };

    ws.onclose = () => {
        console.log(`WebSocket disconnected for task ${task_id}`);
        // Only update status if it was actively processing or connected, not if already in error/ok state
        if (document.getElementById("status").className.includes("processing")) {
            setStatus('error', 'Disconnected from process');
        }
    };

    ws.onerror = (error) => {
        console.error("WebSocket error:", error);
        setStatus('error', 'WebSocket Error');
    };
}

// --- Toggle Advanced Menu ---
function toggleAdvanced() {
  const menu = document.getElementById("advancedMenu");
  // const toggleButton = document.getElementById("toggleAdvBtn"); // This variable is not used
  if (menu.style.display === "block") {
    menu.style.display = "none";
    menu.classList.remove("animated-border");
  } else {
    menu.style.display = "block";
    menu.classList.add("animated-border");
  }
}

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
  fetchData(); // Load initial data
  document.getElementById('startBtn').addEventListener('click', startProcessing);
  document.getElementById('toggleAdvBtn').addEventListener('click', toggleAdvanced);
});

// Initial fetch when the page loads
fetchData();

