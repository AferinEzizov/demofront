const BASE_URL = 'http://127.0.0.1:8000/api/export'; // Your FastAPI microservice
const DATA_SOURCE_URL = 'http://127.0.0.1:3001/api/data'; // Your separate data server

let currentTableData = []; // Stores all fetched data from 3001/api/data
let currentColumnOrder = []; // Stores the ordered list of original column names (e.g., ['id', 'name', 'value'])
let headerMap = new Map(); // Maps original column name to current display name (e.g., 'id' -> 'Product ID')

// Pagination state
let currentPage = 1;
let rowsPerPage = 10;
let totalRows = 0;
let lastStartedTaskId = null; // To store the task ID of the last started process

document.addEventListener('DOMContentLoaded', () => {
    rowsPerPage = parseInt(document.getElementById('rowsPerPage').value);
    loadInitialDataAndHeaders();
    setupNavigation();
});

function setupNavigation() {
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            document.querySelectorAll('.nav-link').forEach(nav => nav.classList.remove('active'));
            this.classList.add('active');

            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });
            const targetTab = this.dataset.tab;
            document.getElementById(targetTab).classList.add('active');
        });
    });
}

// Notification System
function showNotification(message, type = 'success', duration = 4000) {
    const container = document.getElementById('notifications-container');
    const notification = document.createElement('div');
    notification.classList.add('notification', type); // Use type as class directly
    notification.textContent = message;

    requestAnimationFrame(() => {
        notification.classList.add('notification-enter-active');
    });

    container.appendChild(notification);

    setTimeout(() => {
        notification.classList.remove('notification-enter-active');
        notification.classList.add('notification-leave-active');
        notification.addEventListener('transitionend', () => {
            notification.remove();
        }, { once: true });
    }, duration);
}

/**
 * Generic function to fetch data from API endpoints.
 * Includes error handling and notification display.
 * @param {string} url - The API endpoint URL.
 * @param {string} method - HTTP method (GET, POST, DELETE).
 * @param {object|null} body - Request body for POST/PUT.
 * @returns {Promise<object>} - A promise that resolves to the JSON response data or an error object.
 */
async function fetchData(url, method = 'GET', body = null) {
    try {
        const options = {
            method: method,
            headers: {
                'Content-Type': 'application/json',
            },
        };
        if (body) {
            options.body = JSON.stringify(body);
        }

        const response = await fetch(url, options);

        // Check if the response is JSON
        const contentType = response.headers.get('content-type');
        let data;
        if (contentType && contentType.includes('application/json')) {
            data = await response.json();
        } else {
            // If not JSON, read as text and include in error message
            const text = await response.text();
            console.error(`Non-JSON response from ${url}:`, text);
            if (!response.ok) {
                showNotification(`API Error (${response.status}): Non-JSON response. Details: ${text.substring(0, 100)}...`, 'error', 7000); // Show part of the text
                throw new Error(`Non-JSON response (status: ${response.status}): ${text}`);
            }
            // If it's OK but not JSON (e.g., empty 200 OK), still return something
            return { message: text || "OK (Non-JSON or empty response)" };
        }

        if (!response.ok) {
            const errorMessage = data.detail ? (Array.isArray(data.detail) ? data.detail.map(d => d.msg).join(', ') : data.detail) : JSON.stringify(data);
            showNotification(`API Error (${response.status}): ${errorMessage}`, 'error');
            throw new Error(errorMessage);
        }
        return data;
    } catch (error) {
        console.error('Fetch Error:', error);
        // Notification already shown for API errors or general network issues
        return { error: error.message };
    }
}

/**
 * Loads initial data from the source (3001/api/data) and column configurations
 * from the backend microservice (api/export/inputs-list).
 * Initializes the table and column order/names.
 */
async function loadInitialDataAndHeaders() {
    const tableSpinner = document.getElementById('table-spinner');
    tableSpinner.style.display = 'flex'; // Show spinner

    // 1. Fetch data from the external source
    const dataResult = await fetchData(DATA_SOURCE_URL);
    if (dataResult.error) {
        document.getElementById('dataTable').innerHTML = `<tbody><tr><td colspan="100%">Error loading data: ${dataResult.error}</td></tr></tbody>`;
        tableSpinner.style.display = 'none'; // Hide spinner
        return;
    }
    currentTableData = dataResult;
    totalRows = currentTableData.length;
    currentPage = 1; // Reset to first page on new data load

    // 2. Fetch column configurations from our backend
    const inputsResult = await fetchData(`${BASE_URL}/inputs-list`);
    if (inputsResult.error) {
        // If backend inputs fail, use keys from dataResult for default order
        if (currentTableData.length > 0) {
            currentColumnOrder = Object.keys(currentTableData[0]);
            currentColumnOrder.forEach(colName => headerMap.set(colName, colName)); // Initialize map with original names
            showNotification("Failed to fetch backend inputs. Displaying data with default column order.", "info");
        }
    } else {
        let backendInputs = inputsResult.inputs || [];
        // Sort inputs by change_order to get the display order
        let sortedInputs = [...backendInputs].sort((a, b) => (a.change_order ?? Infinity) - (b.change_order ?? Infinity));

        if (sortedInputs.length === 0 && currentTableData.length > 0) {
            // If backend has no inputs but we have data, infer and initialize backend
            currentColumnOrder = Object.keys(currentTableData[0]);
            const inferredInputs = currentColumnOrder.map((name, index) => ({
                name: name,
                column: null, // Initial column can be null as it's for display
                change_order: index
            }));
            const updateResult = await fetchData(`${BASE_URL}/bulk-inputs`, 'POST', inferredInputs);
            if (updateResult.error) {
                console.error("Failed to initialize backend inputs:", updateResult.error);
                showNotification("Failed to initialize backend inputs with inferred data.", "error");
            } else {
                showNotification("Backend inputs initialized from fetched data.", "success");
            }
        } else {
            currentColumnOrder = sortedInputs.map(input => input.name);
        }

        // Populate headerMap with current names from backend
        // This ensures renamed columns are loaded correctly
        backendInputs.forEach(input => {
            if (input.name) { // Ensure name exists
                headerMap.set(input.name, input.name); // Default to its own name
            }
        });
        // Reconcile headerMap with actual data keys to ensure all columns in data are covered
        if (currentTableData.length > 0) {
            Object.keys(currentTableData[0]).forEach(key => {
                if (!headerMap.has(key)) {
                    headerMap.set(key, key); // Add any missing original data columns to map
                }
            });
        }
    }

    populateTable(currentTableData, currentColumnOrder);
    tableSpinner.style.display = 'none'; // Hide spinner
}

/**
 * Populates the data table with data, respecting pagination and current column order/names.
 * @param {Array<object>} data - The full dataset to display.
 * @param {Array<string>|null} columnOrder - The ordered list of original column names for display.
 */
function populateTable(data, columnOrder = null) {
    const tableHead = document.querySelector('#dataTable thead');
    const tableBody = document.querySelector('#dataTable tbody');
    const headerRow = document.getElementById('tableHeaderRow');

    // Remove old event listeners to prevent memory leaks and duplicate behavior
    const oldHeaders = headerRow.querySelectorAll('th');
    oldHeaders.forEach(th => {
        th.removeEventListener('dragstart', handleDragStart);
        th.removeEventListener('dragover', handleDragOver);
        th.removeEventListener('drop', handleDrop);
        th.removeEventListener('dragend', handleDragEnd);
        const input = th.querySelector('input[type="text"]');
        if (input) {
            input.removeEventListener('dblclick', handleDblClick);
            input.removeEventListener('blur', handleBlur);
            input.removeEventListener('keydown', handleKeyDown);
        }
    });

    headerRow.innerHTML = ''; // Clear existing headers
    tableBody.innerHTML = ''; // Clear existing rows

    if (data.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="100%">No data available.</td></tr>';
        renderPaginationControls();
        return;
    }

    let actualColumnOrder = columnOrder || Object.keys(data[0]);
    
    // Filter out columns not present in the *first* row of data (important for consistency)
    const availableColumnsInFirstRow = Object.keys(data[0]);
    actualColumnOrder = actualColumnOrder.filter(col => availableColumnsInFirstRow.includes(col));
    currentColumnOrder = actualColumnOrder; // Update global currentColumnOrder based on filtered, active columns

    // Ensure headerMap is consistent with actualColumnOrder
    actualColumnOrder.forEach(colName => {
        if (!headerMap.has(colName)) {
            headerMap.set(colName, colName); // Add if not present, assume original name is also display name initially
        }
    });

    // Create headers
    currentColumnOrder.forEach((originalColName, index) => {
        const th = document.createElement('th');
        th.setAttribute('data-original-name', originalColName); // Store original name for data lookup
        th.setAttribute('draggable', 'true');
        th.setAttribute('data-column-index', index); // Store current display index

        const input = document.createElement('input');
        input.type = 'text';
        input.value = headerMap.get(originalColName) || originalColName; // Use mapped display name or original
        input.readOnly = true; // Read-only by default

        input.addEventListener('dblclick', handleDblClick);
        input.addEventListener('blur', handleBlur);
        input.addEventListener('keydown', handleKeyDown);

        th.appendChild(input);
        headerRow.appendChild(th);
    });

    addDragDropListeners(); // Re-add listeners for newly created headers

    // Pagination logic for rows
    const startIndex = (currentPage - 1) * rowsPerPage;
    const endIndex = Math.min(startIndex + rowsPerPage, totalRows);
    const paginatedData = data.slice(startIndex, endIndex);

    // Populate table body
    paginatedData.forEach(rowData => {
        const tr = document.createElement('tr');
        currentColumnOrder.forEach(originalColName => { // Use the current display order
            const td = document.createElement('td');
            // Use the original column name to get data from rowData
            td.textContent = rowData[originalColName] !== undefined ? rowData[originalColName] : '';
            tr.appendChild(td);
        });
        tableBody.appendChild(tr);
    });
    renderPaginationControls();
}

/**
 * Handlers for header input editing
 */
function handleDblClick() {
    this.readOnly = false;
    this.focus();
}

function handleBlur() {
    this.readOnly = true;
    const newDisplayName = this.value.trim();
    const th = this.closest('th');
    const originalName = th.getAttribute('data-original-name');

    if (headerMap.get(originalName) !== newDisplayName && newDisplayName !== '') {
        headerMap.set(originalName, newDisplayName); // Update map
        showNotification(`Column '${originalName}' display name changed to '${newDisplayName}'. Click 'Save Column Changes to Backend' to persist.`, 'info');
    } else if (newDisplayName === '') {
        // Revert to previous display name if empty
        this.value = headerMap.get(originalName) || originalName;
        showNotification("Column name cannot be empty. Reverted to previous name.", "warning");
    }
}

function handleKeyDown(event) {
    if (event.key === 'Enter') {
        this.blur(); // Trigger blur on Enter key
    }
}


/**
 * Adds drag and drop event listeners to table header cells.
 */
let dragTargetTh = null; // The th element being dragged

function addDragDropListeners() {
    const headerRow = document.getElementById('tableHeaderRow');
    const allHeaders = headerRow.querySelectorAll('th');

    allHeaders.forEach(th => {
        th.addEventListener('dragstart', handleDragStart);
        th.addEventListener('dragover', handleDragOver);
        th.addEventListener('drop', handleDrop);
        th.addEventListener('dragend', handleDragEnd);
    });
}

function handleDragStart(e) {
    const targetTh = e.target.closest('th');
    if (targetTh) {
        dragTargetTh = targetTh;
        e.dataTransfer.effectAllowed = 'move';
        dragTargetTh.classList.add('dragging');
        // Set a transparent drag image
        const img = new Image();
        img.src = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='; // Transparent 1x1 gif
        e.dataTransfer.setDragImage(img, 0, 0);
    }
}

function handleDragOver(e) {
    e.preventDefault(); // Necessary to allow dropping
    e.dataTransfer.dropEffect = 'move';
    const targetTh = e.target.closest('th');

    if (dragTargetTh && targetTh && targetTh !== dragTargetTh) {
        const headerRow = document.getElementById('tableHeaderRow');
        const headerChildren = Array.from(headerRow.children);
        const dragIndex = headerChildren.indexOf(dragTargetTh);
        const dropIndex = headerChildren.indexOf(targetTh);

        if (dragIndex < dropIndex) {
            headerRow.insertBefore(dragTargetTh, targetTh.nextSibling);
        } else {
            headerRow.insertBefore(dragTargetTh, targetTh);
        }
        // Update the `data-column-index` attributes and `currentColumnOrder` immediately
        // for visual reordering. The full table re-render happens only on drop.
        updateColumnOrderFromDOM();
        
        // Re-render table body to match new header order dynamically
        const tableBody = document.querySelector('#dataTable tbody');
        const startIndex = (currentPage - 1) * rowsPerPage;
        const endIndex = Math.min(startIndex + rowsPerPage, totalRows);
        const paginatedData = currentTableData.slice(startIndex, endIndex);

        tableBody.innerHTML = ''; // Clear current body
        paginatedData.forEach(rowData => {
            const tr = document.createElement('tr');
            currentColumnOrder.forEach(originalColName => {
                const td = document.createElement('td');
                td.textContent = rowData[originalColName] !== undefined ? rowData[originalColName] : '';
                tr.appendChild(td);
            });
            tableBody.appendChild(tr);
        });
    }
}

function handleDrop(e) {
    e.preventDefault();
    if (dragTargetTh) {
        dragTargetTh.classList.remove('dragging');
        // `updateColumnOrderFromDOM` was already called in `dragover` for visual update.
        showNotification("Columns reordered! Click 'Save Column Changes to Backend' to persist.", "info");
    }
    dragTargetTh = null;
}

function handleDragEnd(e) {
    document.querySelectorAll('th.dragging').forEach(th => th.classList.remove('dragging'));
    dragTargetTh = null;
    // After drag ends, ensure the table is fully consistent with the new order in case dragover didn't trigger a full re-render
    populateTable(currentTableData, currentColumnOrder);
}


/**
 * Updates `currentColumnOrder` and `data-column-index` attributes based on the current DOM order of headers.
 */
function updateColumnOrderFromDOM() {
    const headerCells = Array.from(document.querySelectorAll('#tableHeaderRow th'));
    // Map current DOM order of th elements to their original column names
    currentColumnOrder = headerCells.map(th => th.getAttribute('data-original-name'));

    // Re-assign data-column-index based on new DOM order
    headerCells.forEach((th, index) => {
        th.setAttribute('data-column-index', index);
    });
}

/**
 * Sends the current state of column names (from headerMap) and order (from currentColumnOrder)
 * to the backend's /bulk-inputs endpoint.
 */
async function updateBackendInputs() {
    const inputsToUpdate = currentColumnOrder.map((originalName, index) => {
        // Use the display name from headerMap, or fall back to original name
        const displayName = headerMap.get(originalName) || originalName;
        return {
            name: displayName,
            column: null, // 'column' is specific to the original data index, not display. Setting to null as per schema for new/updated inputs.
            change_order: index // This is the new display order (0-based)
        };
    });

    const result = await fetchData(`${BASE_URL}/bulk-inputs`, 'POST', inputsToUpdate);
    const outputElement = document.getElementById('updateBackendInputsOutput');
    if (result.error) {
        outputElement.textContent = `Error updating backend inputs: ${result.error}`;
    } else {
        outputElement.textContent = JSON.stringify(result, null, 2);
        showNotification('Backend inputs updated successfully!', 'success');
        console.log('Backend Inputs Updated:', result);
        // Re-load to ensure full consistency, especially if other users change inputs
        refreshDataTable();
    }
}

async function refreshDataTable() {
    await loadInitialDataAndHeaders();
}

// Pagination Functions
function renderPaginationControls() {
    const totalPages = Math.ceil(totalRows / rowsPerPage);
    document.getElementById('pageInfo').textContent = `Page ${currentPage} of ${totalPages} (${totalRows} rows)`;
    document.getElementById('prevPageBtn').disabled = currentPage === 1;
    document.getElementById('nextPageBtn').disabled = currentPage === totalPages || totalPages === 0;
}

function nextPage() {
    const totalPages = Math.ceil(totalRows / rowsPerPage);
    if (currentPage < totalPages) {
        currentPage++;
        populateTable(currentTableData, currentColumnOrder);
    }
}

function prevPage() {
    if (currentPage > 1) {
        currentPage--;
        populateTable(currentTableData, currentColumnOrder);
    }
}

function changeRowsPerPage() {
    rowsPerPage = parseInt(document.getElementById('rowsPerPage').value);
    currentPage = 1; // Reset to first page
    populateTable(currentTableData, currentColumnOrder);
}

// --- API Functions for Advanced Input Management ---

async function addOrUpdateSingleInput() {
    const name = document.getElementById('singleInputName').value.trim();
    const columnStr = document.getElementById('singleInputColumn').value.trim();
    const changeOrderStr = document.getElementById('singleInputChangeOrder').value.trim();

    if (!name) {
        showNotification('Input Name is required for single input.', 'error');
        return;
    }

    const inputData = { name: name };
    // Use null for optional fields if empty string
    inputData.column = columnStr !== '' ? parseInt(columnStr, 10) : null;
    inputData.change_order = changeOrderStr !== '' ? parseInt(changeOrderStr, 10) : null;

    const result = await fetchData(`${BASE_URL}/inputs`, 'POST', inputData);
    const outputElement = document.getElementById('singleInputOutput');
    if (result.error) {
        outputElement.textContent = `Error adding/updating single input: ${result.error}`;
    } else {
        outputElement.textContent = JSON.stringify(result, null, 2);
        showNotification('Single input added/updated successfully!', 'success');
        // Clear input fields after successful addition/update
        document.getElementById('singleInputName').value = '';
        document.getElementById('singleInputColumn').value = '';
        document.getElementById('singleInputChangeOrder').value = '';
        refreshDataTable(); // Refresh table to reflect changes
    }
}

async function addBulkInputs() {
    const bulkInputsText = document.getElementById('bulkInputs').value.trim();
    const outputElement = document.getElementById('bulkInputOutput');
    try {
        const inputsData = JSON.parse(bulkInputsText);
        if (!Array.isArray(inputsData)) {
            showNotification('Input for bulk operation must be a JSON array.', 'error');
            outputElement.textContent = 'Error: Input must be a JSON array.';
            return;
        }

        // Ensure optional fields are correctly null for bulk inputs
        inputsData.forEach(input => {
            if (input.column === undefined || input.column === '') input.column = null;
            if (input.change_order === undefined || input.change_order === '') input.change_order = null;
        });

        const result = await fetchData(`${BASE_URL}/bulk-inputs`, 'POST', inputsData);
        if (result.error) {
            outputElement.textContent = `Error adding bulk inputs: ${result.error}`;
        } else {
            outputElement.textContent = JSON.stringify(result, null, 2);
            showNotification('Bulk inputs added/updated successfully!', 'success');
            document.getElementById('bulkInputs').value = ''; // Clear textarea
            refreshDataTable(); // Refresh table to reflect changes
        }
    } catch (e) {
        showNotification(`Invalid JSON format for bulk inputs: ${e.message}`, 'error');
        outputElement.textContent = `Invalid JSON format for bulk inputs: ${e.message}`;
    }
}

async function listAllInputs() {
    const result = await fetchData(`${BASE_URL}/inputs-list`);
    const outputElement = document.getElementById('inputsListOutput');
    if (result.error) {
        outputElement.textContent = `Error: ${result.error}`;
    } else {
        outputElement.textContent = JSON.stringify(result, null, 2);
        showNotification('Backend inputs listed successfully!', 'info');
    }
}

async function clearAllInputs() {
    const result = await fetchData(`${BASE_URL}/inputs-clear`, 'DELETE');
    const outputElement = document.getElementById('clearInputsOutput');
    if (result.error) {
        outputElement.textContent = `Error clearing inputs: ${result.error}`;
    } else {
        outputElement.textContent = JSON.stringify(result, null, 2);
        showNotification('All backend inputs cleared successfully!', 'success');
        // Clear headerMap and currentColumnOrder, then refresh table
        headerMap.clear();
        currentColumnOrder = [];
        refreshDataTable();
    }
}

// --- Configuration Functions ---

async function configureService() {
    const fileType = document.getElementById('fileType').value.trim();
    const tmpDir = document.getElementById('tmpDir').value.trim();
    const rateLimit = document.getElementById('rateLimit').value.trim();
    const pageLimit = document.getElementById('pageLimit').value.trim();
    const dbUrl = document.getElementById('dbUrl').value.trim();

    const configData = {};
    if (fileType) configData.file_type = fileType;
    if (tmpDir) configData.tmp_dir = tmpDir;
    if (rateLimit !== '') configData.rate_limit = parseInt(rateLimit, 10);
    if (pageLimit !== '') configData.page_limit = parseInt(pageLimit, 10);
    if (dbUrl) configData.db_url = dbUrl;

    const result = await fetchData(`${BASE_URL}/configure`, 'POST', configData);
    const outputElement = document.getElementById('configureOutput');
    if (result.error) {
        outputElement.textContent = `Error configuring: ${result.error}`;
    } else {
        outputElement.textContent = JSON.stringify(result, null, 2);
        showNotification('Configuration set successfully!', 'success');
    }
}

// --- Process Management Functions (Unified for Table Navbar & Task History Tab) ---

let pollingInterval;
let activePollingTaskId = ''; // Keep track of the task ID currently being polled

/**
 * Handles starting a new processing task.
 * Called from the "Process Actions" navbar on the table.
 */
async function startProcessingTask() {
    const result = await fetchData(`${BASE_URL}/start`, 'POST');
    const outputElement = document.getElementById('processActionOutput'); // Output to navbar pre tag
    if (result.error) {
        outputElement.textContent = `Error starting task: ${result.error}`;
    } else {
        outputElement.textContent = JSON.stringify(result, null, 2);
        lastStartedTaskId = result.task_id; // Store the ID
        document.getElementById('activeTaskIdInput').value = lastStartedTaskId; // Update the input field in navbar
        showNotification(`Processing started! Task ID: ${lastStartedTaskId}`, 'success');
    }
}

/**
 * Retrieves task status from the input field in the table navbar.
 */
async function getTaskStatusFromInput() {
    const taskId = document.getElementById('activeTaskIdInput').value.trim();
    if (!taskId) {
        showNotification('Please enter a Task ID in the text field to check status.', 'error');
        return;
    }
    const result = await fetchData(`${BASE_URL}/status/${taskId}`);
    const outputElement = document.getElementById('processActionOutput');
    if (result.error) {
        outputElement.textContent = `Error getting status: ${result.error}`;
    } else {
        outputElement.textContent = JSON.stringify(result, null, 2);
        showNotification(`Status for Task ${taskId}: ${result.status}`, 'info');
    }
}

/**
 * Retrieves task status and starts polling for a given task ID.
 * Called from the Task History tab.
 */
async function getTaskStatusPolling() {
    const taskId = document.getElementById('taskIdStatus').value.trim();
    if (!taskId) {
        showNotification('Please enter a Task ID to start polling.', 'error');
        return;
    }
    activePollingTaskId = taskId; // Set the task ID for polling
    document.getElementById('statusPolling').style.display = 'flex'; // Show polling indicator

    // Initial check
    const result = await fetchData(`${BASE_URL}/status/${taskId}`);
    const outputElement = document.getElementById('taskStatusOutput');
    if (result.error) {
        outputElement.textContent = `Error getting status: ${result.error}`;
        stopPolling();
    } else {
        outputElement.textContent = JSON.stringify(result, null, 2);
        showNotification(`Status for Task ${taskId}: ${result.status}`, 'info');
        if (result.status === 'completed' || result.status === 'failed' || result.status === 'cancelled') {
            stopPolling(); // Stop if task is finished
        } else {
            // Start polling if not already finished
            if (pollingInterval) clearInterval(pollingInterval); // Clear previous interval
            pollingInterval = setInterval(async () => {
                const pollResult = await fetchData(`${BASE_URL}/status/${activePollingTaskId}`);
                if (pollResult.error) {
                    outputElement.textContent = `Error during polling for ${activePollingTaskId}: ${pollResult.error}`;
                    stopPolling();
                } else {
                    outputElement.textContent = JSON.stringify(pollResult, null, 2);
                    if (pollResult.status === 'completed' || pollResult.status === 'failed' || pollResult.status === 'cancelled') {
                        stopPolling();
                        showNotification(`Task ${activePollingTaskId} ${pollResult.status}!`, pollResult.status === 'completed' ? 'success' : 'error');
                    }
                }
            }, 3000); // Poll every 3 seconds
        }
    }
}

function stopPolling() {
    clearInterval(pollingInterval);
    document.getElementById('statusPolling').style.display = 'none';
    activePollingTaskId = ''; // Clear active polling task ID
    showNotification('Polling stopped.', 'info');
}

/**
 * Handles canceling a task from the input field in the table navbar.
 */
async function cancelTaskFromInput() {
    const taskId = document.getElementById('activeTaskIdInput').value.trim();
    if (!taskId) {
        showNotification('Please enter a Task ID in the text field to cancel.', 'error');
        return;
    }
    const result = await fetchData(`${BASE_URL}/cancel/${taskId}`, 'DELETE');
    const outputElement = document.getElementById('processActionOutput');
    if (result.error) {
        outputElement.textContent = `Error cancelling task: ${result.error}`;
    } else {
        outputElement.textContent = JSON.stringify(result, null, 2);
        showNotification(`Task ${taskId} cancellation requested.`, 'info');
    }
}

/**
 * Handles canceling a task from the input field in the Task History tab.
 */
async function cancelTaskExplicit() {
    const taskId = document.getElementById('taskIdCancel').value.trim();
    if (!taskId) {
        showNotification('Please enter a Task ID to cancel.', 'error');
        return;
    }
    const result = await fetchData(`${BASE_URL}/cancel/${taskId}`, 'DELETE');
    const outputElement = document.getElementById('cancelTaskOutput');
    if (result.error) {
        outputElement.textContent = `Error cancelling task: ${result.error}`;
    } else {
        outputElement.textContent = JSON.stringify(result, null, 2);
        showNotification(`Task ${taskId} cancellation requested.`, 'info');
    }
}

/**
 * Handles downloading a file from the input field in the table navbar.
 */
async function downloadFileFromInput() {
    const taskId = document.getElementById('activeTaskIdInput').value.trim();
    if (!taskId) {
        showNotification('Please enter a Task ID in the text field to download.', 'error');
        return;
    }
    const downloadUrl = `${BASE_URL}/download/${taskId}`;
    window.open(downloadUrl, '_blank');
    document.getElementById('processActionOutput').textContent = `Attempted to download from: ${downloadUrl}`;
    showNotification(`Attempting to download file for Task ID: ${taskId}`, 'info');
}

/**
 * Handles downloading a file from the input field in the Task History tab.
 */
async function downloadFileExplicit() {
    const taskId = document.getElementById('taskIdDownload').value.trim();
    if (!taskId) {
        showNotification('Please enter a Task ID to download.', 'error');
        return;
    }
    const downloadUrl = `${BASE_URL}/download/${taskId}`;
    window.open(downloadUrl, '_blank');
    document.getElementById('downloadOutput').textContent = `Attempted to download from: ${downloadUrl}`;
    showNotification(`Attempting to download file for Task ID: ${taskId}`, 'info');
}

