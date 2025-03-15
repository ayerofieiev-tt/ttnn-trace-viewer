// Trace Handling for TT-NN Trace Viewer

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

// Load trace data for by-upload view
function loadTraceData(traceId, uploadId) {
    fetch(`/api/trace/${traceId}/values?upload_id=${uploadId}`)
        .then(response => response.json())
        .then(data => {
            currentTrace = data;
            displayTraceData(data);
            populateColumnsList(data);
        });
}

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
            currentTrace = processedData;
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
        <h2>${traceData.filename || 'Trace Data'}</h2>
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
        <h2>${traceData.filename || traceData.name || 'Consolidated Trace'}</h2>
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
    if (Object.keys(columnFilters).length === 0) {
        // No filters active, show all events
        document.querySelectorAll('tr.event-row').forEach(row => {
            row.style.display = '';
        });
        updateRowCount();
        return;
    }
    
    // Apply filters
    document.querySelectorAll('tr.event-row').forEach(row => {
        let visible = true;
        
        for (const column in columnFilters) {
            const filterText = columnFilters[column] && columnFilters[column].trim();
            if (!filterText) continue; // Skip empty filters
            
            const cellValue = row.querySelector(`td[data-column="${column}"]`)?.textContent || '';
            
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
                // Simple text filter (case insensitive)
                if (!cellValue.toLowerCase().includes(filterText.toLowerCase())) {
                    visible = false;
                    break;
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
        const table = document.createElement('table');
        table.id = 'eventsTable';
        table.className = 'table table-striped table-sm';
        tableContainer.appendChild(table);
        
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
            th.addEventListener('click', () => sortEvents(field));
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
                   value="${columnFilters[column] || ''}">
        `;
        
        columnsListContainer.appendChild(columnItem);
        
        // Set up event listener for filter input
        const filterInput = document.getElementById(`column-filter-${column}`);
        filterInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                columnFilters[column] = this.value;
                if (currentTrace) {
                    if (viewMode === 'consolidated') {
                        displayConsolidatedTraceData(currentTrace);
                    } else {
                        displayTraceData(currentTrace);
                    }
                }
            }
        });
        
        // Also update on blur
        filterInput.addEventListener('blur', function() {
            columnFilters[column] = this.value;
            if (currentTrace) {
                if (viewMode === 'consolidated') {
                    displayConsolidatedTraceData(currentTrace);
                } else {
                    displayTraceData(currentTrace);
                }
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
            commonFilterFn = new Function('row', `
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
            
            showToast('Filter applied successfully');
        } catch (error) {
            commonFilterFn = null;
            showToast(`Invalid filter: ${error.message}`, 'error');
        }
    } else {
        commonFilterFn = null;
    }
    
    // Re-display the current trace with the filter applied
    if (currentTrace) {
        if (viewMode === 'consolidated') {
            displayConsolidatedTraceData(currentTrace);
        } else {
            displayTraceData(currentTrace);
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