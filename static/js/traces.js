// Trace Handling for TT-NN Trace Viewer

// Global variables for column widths
let columnWidths = {};

// Make sure columnFilters is initialized
if (typeof window.columnFilters === 'undefined') {
    window.columnFilters = {};
}

// Debug helper to print all active filters
function printFilters() {
    console.log("Active filters:", JSON.stringify(window.columnFilters, null, 2));
}
window.printFilters = printFilters;

// Select a trace in by-upload view
function selectTrace(traceId, uploadId) {
    // Update selected state in UI
    document.querySelectorAll('.trace-item').forEach(item => {
        item.classList.remove('selected');
    });
    const selectedItem = document.querySelector(`.trace-item[data-trace-id="${traceId}"][data-upload-id="${uploadId}"]`);
    if (selectedItem) {
        selectedItem.classList.add('selected');
    }
    
    // Load trace data
    loadTraceData(traceId, uploadId);
}
window.selectTrace = selectTrace;

// Select a trace in consolidated view
function selectConsolidatedTrace(traceId) {
    // Update selected state in UI
    document.querySelectorAll('.trace-item').forEach(item => {
        item.classList.remove('selected');
    });
    const selectedItem = document.querySelector(`.trace-item[data-trace-id="${traceId}"]`);
    if (selectedItem) {
        selectedItem.classList.add('selected');
    }
    
    // Load consolidated trace data
    loadConsolidatedTraceData(traceId);
}
window.selectConsolidatedTrace = selectConsolidatedTrace;

// Load trace data for by-upload view
function loadTraceData(traceId, uploadId) {
    fetch(`/api/trace/${traceId}/values?upload_id=${uploadId}`)
        .then(response => response.json())
        .then(data => {
            window.currentTrace = data;
            displayTraceData(data);
            populateColumnsList(data);
        });
}
window.loadTraceData = loadTraceData;

// Load trace data for consolidated view
function loadConsolidatedTraceData(traceId) {
    console.log(`Loading consolidated trace data for ${traceId}`);
    
    // Use the consolidated trace API endpoint
    fetch(`/api/consolidated-trace/${encodeURIComponent(traceId)}/values`)
        .then(response => response.json())
        .then(events => {
            // The API returns an array of events joined from all uploads with this trace name
            console.log(`Received ${events.length} events for consolidated trace`);
            
            // Create a consolidated data structure
            const processedData = {
                name: traceId,
                filename: `${traceId} (Consolidated)`,
                events: events,
                uploads: extractUploadsFromEvents(events),
                length: events.length
            };
            
            // Update the UI
            window.currentTrace = processedData;
            displayConsolidatedTraceData(processedData);
            populateColumnsList(processedData);
        })
        .catch(error => {
            console.error("Error loading consolidated trace:", error);
            const traceDataContainer = document.getElementById('traceData');
            traceDataContainer.innerHTML = `
                <div class="alert alert-danger">
                    Failed to load consolidated trace: ${error.message}
                </div>
            `;
        });
}
window.loadConsolidatedTraceData = loadConsolidatedTraceData;

// Helper function to extract uploads from events
function extractUploadsFromEvents(events) {
    if (!Array.isArray(events) || events.length === 0) return [];
    
    const uploadMap = {};
    
    // Extract unique uploads from event metadata
    events.forEach(event => {
        // Try different field names for upload ID
        const uploadId = event._upload_id || event.upload_id;
        const uploadName = event._upload_name || event.upload_name || 'Unknown';
        const uploadTime = event._upload_time || event.upload_time || '';
        
        if (uploadId && !uploadMap[uploadId]) {
            uploadMap[uploadId] = {
                id: uploadId,
                name: uploadName,
                timestamp: uploadTime
            };
        }
    });
    
    return Object.values(uploadMap);
}

// Get filtered events based on trace data
function getFilteredEvents(traceData) {
    if (!traceData) {
        console.warn("No trace data provided to getFilteredEvents");
        return [];
    }
    
    let events = [];
    
    // Handle consolidated traces (with uploads)
    if (traceData.uploads && Array.isArray(traceData.uploads)) {
        // Check if we have events at the top level
        if (traceData.events && Array.isArray(traceData.events)) {
            // This is a consolidated trace with merged events
            events = JSON.parse(JSON.stringify(traceData.events));
        } else {
            // We need to merge events from uploads
            traceData.uploads.forEach(upload => {
                if (upload.events && Array.isArray(upload.events)) {
                    const eventsWithMeta = upload.events.map(event => ({
                        ...event,
                        upload_id: upload.id,
                        upload_name: upload.name || 'Unknown'
                    }));
                    events.push(...eventsWithMeta);
                }
            });
        }
    }
    // Handle consolidated traces (with traces)
    else if (traceData.traces && Array.isArray(traceData.traces)) {
        // Merge events from traces
        traceData.traces.forEach(trace => {
            if (trace.events && Array.isArray(trace.events)) {
                const eventsWithMeta = trace.events.map(event => ({
                    ...event,
                    upload_id: trace.upload_id,
                    upload_name: trace.upload_name || 'Unknown'
                }));
                events.push(...eventsWithMeta);
            }
        });
    }
    // Handle regular trace array
    else if (Array.isArray(traceData)) {
        events = [...traceData];
    }
    // Handle trace with events property
    else if (traceData.events && Array.isArray(traceData.events)) {
        events = [...traceData.events];
    }
    
    console.log(`getFilteredEvents: Found ${events.length} events`);
    
    // Ensure each event has proper upload metadata if available
    if (traceData.uploads && Array.isArray(traceData.uploads)) {
        events = events.map(event => {
            // Add upload name if it doesn't exist but we have an upload ID
            if (!event.upload_name && event.upload_id) {
                const upload = traceData.uploads.find(u => u.id === event.upload_id);
                if (upload) {
                    return { 
                        ...event, 
                        upload_name: upload.name || 'Unknown',
                        upload_time: upload.timestamp || ''
                    };
                }
            }
            return event;
        });
    }
    
    return events;
}

// Display trace data in the main content area
function displayTraceData(traceData) {
    const traceDataContainer = document.getElementById('traceData');
    
    // Create table for trace data
    let html = `
        <div class="trace-header-container">
            <h2>Trace Data</h2>
            <div class="export-actions">
                <button class="btn btn-sm btn-outline-primary" onclick="exportVisibleDataToCSV('${traceData.id || ''}', false)">
                    <i class="bi bi-download"></i> Export CSV
                </button>
            </div>
        </div>
        <div class="trace-stats">
            ${traceData.length || 0} events
        </div>
        <div id="eventsTableContainer" class="mt-3"></div>
    `;
    
    traceDataContainer.innerHTML = html;
    
    // Get all unique columns from the events
    const columns = getTraceColumns(traceData);
    
    // Get filtered events
    const filteredEvents = getFilteredEvents(traceData);
    
    // Update the trace table with events
    updateTraceTable(filteredEvents, columns);
}

// Display consolidated trace data
function displayConsolidatedTraceData(traceData) {
    const traceDataContainer = document.getElementById('traceData');
    
    // Sanity check the data
    if (!traceData || !traceData.events) {
        traceDataContainer.innerHTML = `
            <div class="alert alert-warning">
                No consolidated trace data available.
            </div>
        `;
        return;
    }
    
    // Count the events and uploads
    const eventCount = traceData.events.length;
    const uploadCount = traceData.uploads ? traceData.uploads.length : 0;
    
    // Create container for consolidated trace data
    let html = `
        <div class="trace-header-container">
            <h2>Consolidated Trace</h2>            
            <div class="export-actions">
                <button class="btn btn-sm btn-outline-primary" onclick="exportVisibleDataToCSV('${encodeURIComponent(traceData.name || '')}', true)">
                    <i class="bi bi-download"></i> Export CSV
                </button>
            </div>
        </div>
        <div class="trace-stats">
            ${uploadCount} uploads, ${eventCount} total events
        </div>
    `;
    
    // If no events, show a message
    if (eventCount === 0) {
        html += `
            <div class="alert alert-info mt-3">
                This consolidated trace contains no events.
            </div>
        `;
        traceDataContainer.innerHTML = html;
        return;
    }
    
    html += `<div id="eventsTableContainer" class="mt-3"></div>`;
    traceDataContainer.innerHTML = html;
    
    // Get all unique columns from the events
    const columns = getTraceColumns(traceData);
    
    // Get filtered events
    const filteredEvents = getFilteredEvents(traceData);
    
    // Update the trace table with events
    updateTraceTable(filteredEvents, columns);
}

// Get all unique columns from trace events
function getTraceColumns(traceData) {
    console.log("Getting trace columns for:", traceData);
    
    if (!traceData) {
        console.warn("No trace data provided to getTraceColumns");
        return [];
    }
    
    // Get events array from the appropriate source
    let events = [];
    
    if (Array.isArray(traceData)) {
        // Direct array of events
        events = traceData;
        console.log("Found direct array of events:", events.length);
    } else if (traceData.events && Array.isArray(traceData.events)) {
        // Events property
        events = traceData.events;
        console.log("Found events property:", events.length);
    } else {
        // Try to get events from other sources
        const filteredEvents = getFilteredEvents(traceData);
        if (filteredEvents.length > 0) {
            events = filteredEvents;
            console.log("Using filtered events:", events.length);
        } else {
            console.warn("No events found in trace data");
            return [];
        }
    }
    
    // No events found
    if (events.length === 0) {
        console.warn("Empty events array");
        return [];
    }
    
    // Collect all unique keys from all events
    const columns = new Set();
    events.forEach(event => {
        Object.keys(event).forEach(key => {
            columns.add(key);
        });
    });
    
    console.log("Found columns:", columns);
    
    // Convert to array and filter out unwanted columns
    const columnsArray = Array.from(columns);
    
    // Columns to exclude
    const excludeColumns = ['id']; 
    
    // For consolidated view, also exclude upload metadata columns
    if (traceData.uploads || events.some(e => e.upload_id || e.upload_name)) {
        // Add both underscore and non-underscore versions
        excludeColumns.push(
            '_upload_id', '_upload_name', '_upload_time',
            'upload_id', 'upload_name', 'upload_time'
        );
    }
    
    // Filter out unwanted columns and any column that starts with 'upload_'
    const filteredColumns = columnsArray.filter(col => 
        !excludeColumns.includes(col) && !col.startsWith('upload_') && !col.startsWith('_upload_')
    );
    
    console.log("Filtered columns:", filteredColumns);
    
    // Custom sort function for columns
    return sortColumns(filteredColumns);
}

// Custom sort function for trace columns
function sortColumns(columns) {
    // First, separate columns into categories
    const operationColumn = columns.includes('operation') ? ['operation'] : [];
    const argColumns = columns.filter(col => col.match(/^arg\d+$/));
    const otherColumns = columns.filter(col => col !== 'operation' && !col.match(/^arg\d+$/));
    
    // Sort arg columns numerically
    argColumns.sort((a, b) => {
        const numA = parseInt(a.replace('arg', ''), 10);
        const numB = parseInt(b.replace('arg', ''), 10);
        return numA - numB;
    });
    
    // Sort other columns alphabetically
    otherColumns.sort();
    
    // Combine all columns in the desired order
    return [...operationColumn, ...argColumns, ...otherColumns];
}

// Function to filter events based on column filters from the right panel
function filterEvents() {
    // No column-filter elements in headers anymore, using columnFilters object
    if (Object.keys(window.columnFilters).length === 0) {
        // No filters active, show all events
        document.querySelectorAll('tr.event-row').forEach(row => {
            row.style.display = '';
        });
        updateRowCount();
        return;
    }
    
    console.log("Applying filters:", window.columnFilters);
    
    // Apply filters
    document.querySelectorAll('tr.event-row').forEach(row => {
        let visible = true;
        
        for (const column in window.columnFilters) {
            const filterText = window.columnFilters[column] && window.columnFilters[column].trim();
            if (!filterText) continue; // Skip empty filters
            
            const cellValue = row.querySelector(`td[data-column="${column}"]`)?.textContent || '';
            console.log(`Checking cell value "${cellValue}" against filter "${filterText}"`);
            
            // Check if this is a parser function call (contains parentheses)
            if (filterText.includes('(') && filterText.includes(')')) {
                try {
                    // Create a function that will evaluate the expression with the event value
                    const filterFunction = new Function('value', `
                        // Make all parser functions available in this scope
                        ${Object.keys(window)
                            .filter(key => typeof window[key] === 'function' && !key.startsWith('_'))
                            .map(key => `const ${key} = window['${key}'];`)
                            .join('\n')}
                        
                        try {
                            return ${filterText};
                        } catch (e) {
                            console.error("Filter evaluation error:", e);
                            return false;
                        }
                    `);
                    
                    // Apply the function to the cell value
                    const result = filterFunction(cellValue);
                    console.log(`Function filter result: ${result}`);
                    if (result !== true) {
                        visible = false;
                        break;
                    }
                } catch (error) {
                    console.error(`Error evaluating filter expression "${filterText}":`, error);
                    // If there's an error evaluating the expression, consider it as not matching
                    visible = false;
                    break;
                }
            } else {
                // For expressions without parentheses, evaluate them directly
                try {
                    // Create a function that will evaluate the expression with the event value
                    const filterFunction = new Function('value', `
                        // Make all parser functions available in this scope
                        ${Object.keys(window)
                            .filter(key => typeof window[key] === 'function' && !key.startsWith('_'))
                            .map(key => `const ${key} = window['${key}'];`)
                            .join('\n')}
                        
                        try {
                            return ${filterText};
                        } catch (e) {
                            // Fall back to substring search
                            return value.toLowerCase().includes("${filterText.toLowerCase().replace(/"/g, '\\"')}");
                        }
                    `);
                    
                    // Apply the function to the cell value
                    const result = filterFunction(cellValue);
                    console.log(`Expression filter result: ${result}`);
                    if (result !== true) {
                        visible = false;
                        break;
                    }
                } catch (error) {
                    console.error(`Error evaluating expression "${filterText}":`, error);
                    // Fall back to simple text filter
                    if (!cellValue.toLowerCase().includes(filterText.toLowerCase())) {
                        visible = false;
                        break;
                    }
                }
            }
        }
        
        row.style.display = visible ? '' : 'none';
    });
    
    updateRowCount();
}

// Global variables for sorting
let currentSortColumn = null;
let currentSortDirection = 'asc';
let currentEvents = [];

// Function to sort events by a column
function sortEvents(column) {
    if (currentSortColumn === column) {
        // Toggle direction if clicking the same column
        currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        // New column, default to ascending
        currentSortColumn = column;
        currentSortDirection = 'asc';
    }
    
    // Update sort indicators in headers
    document.querySelectorAll('th.sortable').forEach(th => {
        // Clear all sort indicators
        th.classList.remove('sort-asc', 'sort-desc');
        
        // Add indicator to current sort column
        if (th.dataset.column === currentSortColumn) {
            th.classList.add(currentSortDirection === 'asc' ? 'sort-asc' : 'sort-desc');
        }
    });
    
    // Sort the events array
    currentEvents.sort((a, b) => {
        const valueA = String(a[column] || '');
        const valueB = String(b[column] || '');
        
        // Try to convert to numbers if both are numeric
        if (!isNaN(valueA) && !isNaN(valueB)) {
            return currentSortDirection === 'asc' 
                ? Number(valueA) - Number(valueB)
                : Number(valueB) - Number(valueA);
        }
        
        // Otherwise sort as strings
        return currentSortDirection === 'asc'
            ? valueA.localeCompare(valueB)
            : valueB.localeCompare(valueA);
    });
    
    // Redraw the table body
    renderTableBody();
}

// Render the table body without recreating the whole table
function renderTableBody() {
    const tableBody = document.getElementById('eventsTableBody');
    if (!tableBody) return;
    
    tableBody.innerHTML = '';
    
    // Get the current column headers (these are the filtered columns without 'id')
    const visibleColumns = Array.from(document.querySelectorAll('th.sortable')).map(th => th.dataset.column);
    
    if (currentEvents.length === 0) {
        // No events to display
        const emptyRow = document.createElement('tr');
        const emptyCell = document.createElement('td');
        emptyCell.colSpan = visibleColumns.length || 1;
        emptyCell.textContent = "No events to display";
        emptyCell.className = "text-center text-muted py-3";
        emptyRow.appendChild(emptyCell);
        tableBody.appendChild(emptyRow);
        return;
    }
    
    // Add event rows
    currentEvents.forEach((event, index) => {
        const row = document.createElement('tr');
        row.className = 'event-row';
        row.dataset.eventIndex = index;
        
        // Add cells only for visible columns
        visibleColumns.forEach(field => {
            const cell = document.createElement('td');
            cell.dataset.column = field;
            
            // Handle different data types appropriately
            if (event[field] === undefined || event[field] === null) {
                cell.textContent = '';
                cell.classList.add('empty-cell');
            } else if (typeof event[field] === 'object') {
                // For objects, display as JSON
                try {
                    cell.textContent = JSON.stringify(event[field]);
                } catch (e) {
                    cell.textContent = '[Complex Object]';
                }
            } else {
                cell.textContent = event[field];
            }
            
            row.appendChild(cell);
        });
        
        // Add click handler to select the event
        row.addEventListener('click', () => {
            document.querySelectorAll('tr.event-row').forEach(r => {
                r.classList.remove('selected');
            });
            row.classList.add('selected');
            
            // Show event details
            showEventDetails(event);
        });
        
        tableBody.appendChild(row);
    });
    
    // Apply any active filters
    filterEvents();
}

// Update trace table with events
function updateTraceTable(events, fields) {
    const tableContainer = document.getElementById('eventsTableContainer');
    if (!tableContainer) return;
    
    // Store events globally for sorting/filtering
    currentEvents = [...events];
    
    // Create table if it doesn't exist
    if (!document.getElementById('eventsTable')) {
        // Create a scrollable wrapper
        const scrollWrapper = document.createElement('div');
        scrollWrapper.className = 'table-scroll-wrapper';
        tableContainer.appendChild(scrollWrapper);
        
        const table = document.createElement('table');
        table.id = 'eventsTable';
        table.className = 'table table-striped table-sm resizable-table';
        scrollWrapper.appendChild(table);
        
        // Create table header
        const thead = document.createElement('thead');
        table.appendChild(thead);
        
        const headerRow = document.createElement('tr');
        thead.appendChild(headerRow);
        
        // Add header cells for each field
        fields.forEach(field => {
            // Header cell
            const th = document.createElement('th');
            th.textContent = field;
            th.className = 'sortable';
            th.dataset.column = field;
            
            // Apply stored width if available
            if (columnWidths[field]) {
                th.style.width = columnWidths[field] + 'px';
                th.style.minWidth = columnWidths[field] + 'px';
            } else {
                // Default minimum width
                th.style.minWidth = '100px';
            }
            
            // Add click handler for sorting
            th.addEventListener('click', (e) => {
                // Only sort if we didn't click on the resizer
                if (!e.target.classList.contains('resizer')) {
                    sortEvents(field);
                }
            });
            
            // Add resizer element
            const resizer = document.createElement('div');
            resizer.className = 'resizer';
            th.appendChild(resizer);
            
            // Add resize functionality
            setupResizer(resizer, th, field);
            
            headerRow.appendChild(th);
        });
        
        // Create table body
        const tbody = document.createElement('tbody');
        tbody.id = 'eventsTableBody';
        table.appendChild(tbody);
    }
    
    // Reset sort status
    currentSortColumn = null;
    currentSortDirection = 'asc';
    
    // Render the table body
    renderTableBody();
}

// Setup column resizer
function setupResizer(resizer, th, field) {
    let startX, startWidth;
    
    // Add double-click handler for auto-sizing
    resizer.addEventListener('dblclick', function(e) {
        e.stopPropagation();
        
        // Auto-size the column based on content
        const maxWidth = calculateMaxColumnWidth(field);
        // Add some padding to ensure text fits
        const newWidth = maxWidth + 20;
        
        // Set the new width
        th.style.width = newWidth + 'px';
        th.style.minWidth = newWidth + 'px';
        columnWidths[field] = newWidth;
    });
    
    resizer.addEventListener('mousedown', function(e) {
        // Prevent sort event from triggering
        e.stopPropagation();
        
        startX = e.pageX;
        startWidth = th.offsetWidth;
        
        // Add event listeners for resize operation
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        
        // Add a resize class to the table for cursor styling
        const table = th.closest('table');
        if (table) {
            table.classList.add('resizing');
        }
    });
    
    function handleMouseMove(e) {
        // Calculate new width
        const newWidth = startWidth + (e.pageX - startX);
        
        // Apply minimum width
        if (newWidth >= 50) {
            th.style.width = newWidth + 'px';
            th.style.minWidth = newWidth + 'px';
            columnWidths[field] = newWidth;
        }
    }
    
    function handleMouseUp() {
        // Remove event listeners
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        
        // Remove the resize class
        const table = th.closest('table');
        if (table) {
            table.classList.remove('resizing');
        }
    }
}

// Calculate max width needed for a column
function calculateMaxColumnWidth(field) {
    let maxWidth = 100;  // Default minimum
    
    // Calculate header width
    const headerElement = document.querySelector(`th[data-column="${field}"]`);
    if (headerElement) {
        // Create temporary span to measure text width
        const tempSpan = document.createElement('span');
        tempSpan.style.visibility = 'hidden';
        tempSpan.style.position = 'absolute';
        tempSpan.style.whiteSpace = 'nowrap';
        tempSpan.textContent = headerElement.textContent;
        document.body.appendChild(tempSpan);
        
        const headerWidth = tempSpan.offsetWidth;
        document.body.removeChild(tempSpan);
        
        maxWidth = Math.max(maxWidth, headerWidth);
    }
    
    // Calculate max content width
    const cells = document.querySelectorAll(`td[data-column="${field}"]`);
    cells.forEach(cell => {
        // For content cells, create a temporary measuring element
        const tempSpan = document.createElement('span');
        tempSpan.style.visibility = 'hidden';
        tempSpan.style.position = 'absolute';
        tempSpan.style.whiteSpace = 'nowrap';
        tempSpan.textContent = cell.textContent;
        document.body.appendChild(tempSpan);
        
        const contentWidth = tempSpan.offsetWidth;
        document.body.removeChild(tempSpan);
        
        maxWidth = Math.max(maxWidth, contentWidth);
    });
    
    return maxWidth;
}

// Add the following CSS to your document head or stylesheet
document.addEventListener('DOMContentLoaded', function() {
    const style = document.createElement('style');
    style.textContent = `
        .table-scroll-wrapper {
            width: 100%;
            overflow-x: auto;
            border-radius: 4px;
            position: relative;
        }
        
        .resizable-table {
            width: max-content;
            min-width: 100%;
        }
        
        .resizable-table th {
            position: relative;
            white-space: nowrap;
            overflow: visible;
            background-color: #f8f9fa;
            z-index: 1;
        }
        
        .resizer {
            position: absolute;
            top: 0;
            right: 0;
            width: 8px;
            height: 100%;
            cursor: col-resize;
            z-index: 10;
        }
        
        .resizer:hover {
            background-color: rgba(0, 0, 0, 0.1);
        }
        
        .resizing {
            cursor: col-resize;
            user-select: none;
        }
        
        .resizable-table td {
            overflow: visible;
            white-space: normal;
            word-wrap: break-word;
            min-width: 100px;
            padding: 4px 8px;
        }
        
        /* Style for selected row */
        .event-row.selected {
            background-color: rgba(0, 123, 255, 0.15) !important;
        }
        
        /* Trace header styling */
        .trace-header-container {
            display: flex;
            align-items: center;
            margin-bottom: 0.5rem;
        }
        
        .trace-name-badge {
            margin-left: 1rem;
            padding: 0.3rem 0.7rem;
            background-color: #6c757d;
            color: white;
            border-radius: 0.25rem;
            font-size: 1rem;
            font-weight: 500;
        }
    `;
    document.head.appendChild(style);
});

// Populate the list of columns for filtering
function populateColumnsList(traceData) {
    const columnsListContainer = document.getElementById('columnsList');
    columnsListContainer.innerHTML = '';
    
    const columns = getTraceColumns(traceData);
    
    columns.forEach(column => {
        const columnItem = document.createElement('div');
        columnItem.className = 'column-item';
        
        columnItem.innerHTML = `
            <span>${column}</span>
            <input type="text" class="filter-input" 
                   id="column-filter-${column}" 
                   placeholder="Filter ${column}..."
                   value="${window.columnFilters[column] || ''}">
        `;
        
        columnsListContainer.appendChild(columnItem);
        
        // Set up event listener for filter input
        const filterInput = document.getElementById(`column-filter-${column}`);
        filterInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                const filterValue = this.value.trim();
                console.log(`Setting filter for ${column}: "${filterValue}"`);
                
                // Store the filter value
                if (filterValue === '') {
                    // Remove empty filters
                    delete window.columnFilters[column];
                } else {
                    window.columnFilters[column] = filterValue;
                }
                
                // Apply filters to current view without redrawing everything
                filterEvents();
                e.preventDefault();
            }
        });
        
        // Also update on blur
        filterInput.addEventListener('blur', function() {
            const filterValue = this.value.trim();
            
            // Only update if value actually changed
            if (filterValue === '' && window.columnFilters[column]) {
                delete window.columnFilters[column];
                filterEvents();
            } else if (filterValue !== '' && window.columnFilters[column] !== filterValue) {
                window.columnFilters[column] = filterValue;
                filterEvents();
            }
        });
    });
}

// Set up common filter
document.addEventListener('DOMContentLoaded', function() {
    const commonFilterTextarea = document.getElementById('commonFilter');
    commonFilterTextarea.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            updateCommonFilter();
        }
    });
});

// Update the common filter function
function updateCommonFilter() {
    const filterText = document.getElementById('commonFilter').value.trim();
    
    if (filterText) {
        try {
            // Create a function from the filter text
            window.commonFilterFn = new Function('row', `
                try {
                    // Make all parsers available in this scope
                    ${Object.keys(window).filter(key => 
                        typeof window[key] === 'function' && 
                        key.match(/(tensor|parse)[A-Za-z]*/i)
                    ).map(key => `const ${key} = window['${key}'];`).join('\n')}
                    
                    return (${filterText})(row);
                } catch (e) {
                    console.error('Common filter execution error:', e);
                    return true;
                }
            `);
            
            window.showToast('Filter applied successfully');
        } catch (error) {
            window.commonFilterFn = null;
            window.showToast(`Invalid filter: ${error.message}`, 'error');
        }
    } else {
        window.commonFilterFn = null;
    }
    
    // Re-display the current trace with the filter applied
    if (window.currentTrace) {
        if (window.viewMode === 'consolidated') {
            displayConsolidatedTraceData(window.currentTrace);
        } else {
            displayTraceData(window.currentTrace);
        }
    }
}

// Update the row count after filtering
function updateRowCount() {
    const totalRows = document.querySelectorAll('tr.event-row').length;
    const visibleRows = document.querySelectorAll('tr.event-row:not([style*="display: none"])').length;
    
    // Update row count in UI
    const rowCountElement = document.getElementById('rowCount');
    if (rowCountElement) {
        if (visibleRows < totalRows) {
            rowCountElement.textContent = `Showing ${visibleRows} of ${totalRows} rows`;
        } else {
            rowCountElement.textContent = `${totalRows} rows`;
        }
    }
    
    // Also update trace stats if it exists
    const traceStatsElement = document.querySelector('.trace-stats');
    if (traceStatsElement && currentEvents) {
        if (visibleRows < totalRows) {
            traceStatsElement.textContent = `Showing ${visibleRows} of ${totalRows} events`;
        } else {
            traceStatsElement.textContent = `${totalRows} events`;
        }
    }
}

// Debug function to test a filter expression
function testFilter(column, filterExpression, cellValue) {
    console.log(`Testing filter: ${filterExpression} on value: ${cellValue}`);
    
    try {
        // Create a function that will evaluate the expression with the event value
        const filterFunction = new Function('value', `
            // Make all parser functions available in this scope
            ${Object.keys(window)
                .filter(key => typeof window[key] === 'function' && !key.startsWith('_'))
                .map(key => `const ${key} = window['${key}'];`)
                .join('\n')}
            
            try {
                return ${filterExpression};
            } catch (e) {
                console.error("Filter evaluation error:", e);
                return false;
            }
        `);
        
        // Apply the function to the cell value
        const result = filterFunction(cellValue);
        console.log(`Filter result: ${result}`);
        return result;
    } catch (error) {
        console.error(`Error creating filter function "${filterExpression}":`, error);
        return false;
    }
}

// Make debug function available globally
window.testFilter = testFilter;

// Export visible data to CSV
function exportVisibleDataToCSV(traceIdentifier, isConsolidated) {
    console.log('Export CSV clicked', { traceIdentifier, isConsolidated });
    
    // Get the visible rows from the current table
    const visibleRows = Array.from(document.querySelectorAll('tr.event-row:not([style*="display: none"])'));
    console.log('Visible rows:', visibleRows.length);
    
    if (visibleRows.length === 0) {
        showToast('error', 'No data to export');
        return;
    }
    
    // Get the column headers from the table
    const headers = Array.from(document.querySelectorAll('th.sortable')).map(th => th.dataset.column);
    console.log('Headers:', headers);
    
    // Extract data from visible rows
    const exportData = [];
    visibleRows.forEach(row => {
        const rowData = {};
        headers.forEach(header => {
            const cell = row.querySelector(`td[data-column="${header}"]`);
            rowData[header] = cell ? cell.textContent : '';
        });
        exportData.push(rowData);
    });
    console.log('Export data sample:', exportData.slice(0, 2));
    
    // Generate CSV directly in the browser
    if (exportData.length > 0) {
        // Create CSV content
        const csvContent = [
            // Headers
            headers.join(','),
            // Data rows
            ...exportData.map(row => 
                headers.map(header => {
                    const value = row[header] || '';
                    // Escape commas and quotes
                    return /[",\n]/.test(value) 
                        ? `"${value.replace(/"/g, '""')}"` 
                        : value;
                }).join(',')
            )
        ].join('\n');
        
        // Create a blob and download link
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const downloadLink = document.createElement('a');
        downloadLink.href = url;
        
        // Generate filename
        let filename = 'export.csv';
        if (traceIdentifier) {
            filename = `trace_${traceIdentifier}${isConsolidated ? '_consolidated' : ''}_filtered.csv`;
        } else {
            const currentDate = new Date().toISOString().split('T')[0];
            filename = `trace_export_${currentDate}.csv`;
        }
        
        downloadLink.setAttribute('download', filename);
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
        URL.revokeObjectURL(url);
        
        showToast('CSV export successful');
    } else {
        showToast('error', 'No data to export');
    }
}
window.exportVisibleDataToCSV = exportVisibleDataToCSV;

// Update the existing export functions to accept exportData parameter
function exportFilteredTraceToCSV(traceId, exportData) {
    console.log('exportFilteredTraceToCSV called with traceId:', traceId);
    
    if (!exportData || exportData.length === 0) {
        console.error('No export data provided');
        showToast('error', 'Export failed: No data to export');
        return;
    }
    
    // Get the current column filters
    const filters = window.columnFilters || {};
    console.log('Using filters:', filters);
    
    // If we have a valid traceId, use the server endpoint
    if (traceId && !isNaN(parseInt(traceId, 10))) {
        // Convert string traceId to number if needed
        if (typeof traceId === 'string') {
            traceId = parseInt(traceId, 10);
            console.log('Converted traceId to number:', traceId);
        }
        
        // Send the filters to the server to get filtered data
        console.log('Sending request to:', `/api/trace/${traceId}/export-filtered-csv`);
        fetch(`/api/trace/${traceId}/export-filtered-csv`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                columnFilters: filters,
                exportData: exportData
            })
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to export filtered CSV');
            }
            
            // Get filename from Content-Disposition header
            const contentDisposition = response.headers.get('Content-Disposition');
            let filename = 'export.csv';
            if (contentDisposition) {
                const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
                if (filenameMatch && filenameMatch[1]) {
                    filename = filenameMatch[1];
                }
            }
            
            // Convert response to blob and create download link
            return response.blob().then(blob => {
                const url = window.URL.createObjectURL(blob);
                const downloadLink = document.createElement('a');
                downloadLink.href = url;
                downloadLink.download = filename;
                downloadLink.style.display = 'none';
                document.body.appendChild(downloadLink);
                downloadLink.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(downloadLink);
            });
        })
        .catch(error => {
            console.error('Error exporting filtered CSV:', error);
            // Show error toast
            showToast('error', `Failed to export filtered CSV: ${error.message}`);
        });
    } else {
        // If no valid traceId, create and download CSV directly in browser
        const headers = Object.keys(exportData[0]);
        const csvContent = [
            // Headers
            headers.join(','),
            // Data rows
            ...exportData.map(row => 
                headers.map(header => {
                    const value = row[header] || '';
                    // Escape commas and quotes
                    return /[",\n]/.test(value) 
                        ? `"${value.replace(/"/g, '""')}"` 
                        : value;
                }).join(',')
            )
        ].join('\n');
        
        // Create a blob and download link
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const downloadLink = document.createElement('a');
        downloadLink.href = url;
        
        // Generate filename
        const currentDate = new Date().toISOString().split('T')[0];
        const filename = `trace_export_${currentDate}.csv`;
        
        downloadLink.setAttribute('download', filename);
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
        URL.revokeObjectURL(url);
        
        showToast('CSV export successful');
    }
}

function exportFilteredConsolidatedTraceToCSV(filename, exportData) {
    console.log('exportFilteredConsolidatedTraceToCSV called with filename:', filename);
    
    if (!exportData || exportData.length === 0) {
        console.error('No export data provided');
        showToast('error', 'Export failed: No data to export');
        return;
    }
    
    // Get the current column filters
    const filters = window.columnFilters || {};
    console.log('Using filters:', filters);
    
    // If we have a valid filename, use the server endpoint
    if (filename) {
        // Send the filters to the server to get filtered data
        console.log('Sending request to:', `/api/consolidated-trace/${filename}/export-filtered-csv`);
        fetch(`/api/consolidated-trace/${filename}/export-filtered-csv`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                columnFilters: filters,
                exportData: exportData
            })
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to export filtered CSV');
            }
            
            // Get filename from Content-Disposition header
            const contentDisposition = response.headers.get('Content-Disposition');
            let outputFilename = 'export.csv';
            if (contentDisposition) {
                const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
                if (filenameMatch && filenameMatch[1]) {
                    outputFilename = filenameMatch[1];
                }
            }
            
            // Convert response to blob and create download link
            return response.blob().then(blob => {
                const url = window.URL.createObjectURL(blob);
                const downloadLink = document.createElement('a');
                downloadLink.href = url;
                downloadLink.download = outputFilename;
                downloadLink.style.display = 'none';
                document.body.appendChild(downloadLink);
                downloadLink.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(downloadLink);
            });
        })
        .catch(error => {
            console.error('Error exporting filtered CSV:', error);
            // Show error toast
            showToast('error', `Failed to export filtered CSV: ${error.message}`);
        });
    } else {
        // If no valid filename, create and download CSV directly in browser
        const headers = Object.keys(exportData[0]);
        const csvContent = [
            // Headers
            headers.join(','),
            // Data rows
            ...exportData.map(row => 
                headers.map(header => {
                    const value = row[header] || '';
                    // Escape commas and quotes
                    return /[",\n]/.test(value) 
                        ? `"${value.replace(/"/g, '""')}"` 
                        : value;
                }).join(',')
            )
        ].join('\n');
        
        // Create a blob and download link
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const downloadLink = document.createElement('a');
        downloadLink.href = url;
        
        // Generate filename
        const currentDate = new Date().toISOString().split('T')[0];
        const filename = `consolidated_trace_export_${currentDate}.csv`;
        
        downloadLink.setAttribute('download', filename);
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
        URL.revokeObjectURL(url);
        
        showToast('CSV export successful');
    }
} 