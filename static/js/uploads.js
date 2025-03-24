// Uploads Handling for TT-NN Trace Viewer

// Load all uploads from the server
function loadUploads() {
    fetch(`/api/uploads?mode=${window.viewMode}`)
        .then(response => response.json())
        .then(data => {
            window.uploads = data;
            
            // Sort uploads by date (newest first) if in by_upload mode
            if (window.viewMode === 'by_upload') {
                window.uploads.sort((a, b) => {
                    // If there's an explicit timestamp field, use that
                    if (a.timestamp && b.timestamp) {
                        return new Date(b.timestamp) - new Date(a.timestamp);
                    }
                    // Otherwise, use the upload ID (assuming higher ID = newer upload)
                    return b.id - a.id;
                });
            }
            
            window.filteredUploads = [...window.uploads];
            displayUploadsList();
        });
}

// Filter uploads based on search term
function filterUploads() {
    const searchTerm = document.getElementById('uploadFilter').value.toLowerCase();
    
    if (window.viewMode === 'consolidated') {
        // For consolidated view, filter the traces directly
        window.filteredUploads = window.uploads.filter(trace => 
            trace.filename.toLowerCase().includes(searchTerm)
        );
        displayUploadsList();
    } else {
        // For by-upload view, filter both uploads and traces
        window.filteredUploads = window.uploads.filter(upload => {
            const uploadMatches = upload.name.toLowerCase().includes(searchTerm);
            const hasMatchingTraces = upload.traces.some(trace => 
                trace.filename.toLowerCase().includes(searchTerm)
            );
            return uploadMatches || hasMatchingTraces;
        });
        
        // Keep uploads sorted by date (newest first)
        window.filteredUploads.sort((a, b) => {
            // If there's an explicit timestamp field, use that
            if (a.timestamp && b.timestamp) {
                return new Date(b.timestamp) - new Date(a.timestamp);
            }
            // Otherwise, use the upload ID (assuming higher ID = newer upload)
            return b.id - a.id;
        });
        
        displayUploadsList();
    }
}

// Filter traces within an upload
function filterTraces() {
    const searchTerm = document.getElementById('traceFilter').value.toLowerCase();
    displayUploadsList(searchTerm);
}

// Display the list of uploads in the sidebar
function displayUploadsList(traceFilter = '') {
    const uploadsListContainer = document.getElementById('uploadsList');
    uploadsListContainer.innerHTML = '';
    
    if (window.viewMode === 'consolidated') {
        // Consolidated view - show all traces grouped
        const traceList = document.createElement('div');
        traceList.className = 'trace-list';
        
        const searchTerm = document.getElementById('uploadFilter').value.toLowerCase();
        const filteredTraces = window.uploads.filter(trace => 
            trace.filename.toLowerCase().includes(searchTerm)
        );
                 
        // Sort traces alphabetically by filename
        filteredTraces.sort((a, b) => a.filename.localeCompare(b.filename));
        
        filteredTraces.forEach(trace => {
            const traceItem = document.createElement('div');
            traceItem.className = 'trace-item';
            if (window.currentTrace && window.currentTrace.filename === trace.filename) {
                traceItem.classList.add('selected');
            }
            
            traceItem.innerHTML = `
                <div class="trace-name">
                    <i class="bi bi-file-earmark-text"></i>
                    ${trace.filename}
                </div>
                <div class="trace-count">${trace.row_count || 0} rows</div>
            `;
            
            traceItem.addEventListener('click', function() {
                selectConsolidatedTrace(trace.filename);
            });
            traceList.appendChild(traceItem);
        });
        
        uploadsListContainer.appendChild(traceList);
    } else {
        // By-upload view - show uploads with their traces
        window.filteredUploads.forEach(upload => {
            // Filter traces if needed
            let filteredTraces = upload.traces;
            if (traceFilter) {
                filteredTraces = upload.traces.filter(trace => 
                    trace.filename.toLowerCase().includes(traceFilter.toLowerCase())
                );
            }
            
            // Skip if no matching traces
            if (filteredTraces.length === 0) return;
            
            // Sort traces alphabetically by filename
            filteredTraces.sort((a, b) => a.filename.localeCompare(b.filename));
            
            const uploadGroup = document.createElement('div');
            uploadGroup.className = 'upload-group';
            uploadGroup.id = `upload-${upload.id}`;
            
            // Upload header
            const uploadHeader = document.createElement('div');
            uploadHeader.className = 'upload-header';
            uploadHeader.innerHTML = `
                <div class="upload-name text-truncate" onclick="renameUpload(${upload.id}, event)" title="${upload.name || 'Unnamed Upload'}">${upload.name || 'Unnamed Upload'}</div>
                <div class="upload-count flex-shrink-0">${filteredTraces.length} traces</div>
            `;
            uploadHeader.addEventListener('click', function(e) {
                if (e.target.classList.contains('upload-name')) return;
                toggleUploadContent(upload.id);
            });
            
            // Upload content (traces)
            const uploadContent = document.createElement('div');
            uploadContent.className = 'upload-content';
            uploadContent.id = `upload-content-${upload.id}`;
            
            // Create trace list
            const traceList = document.createElement('div');
            traceList.className = 'trace-list';
            
            filteredTraces.forEach(trace => {
                const traceItem = document.createElement('div');
                traceItem.className = 'trace-item';
                traceItem.setAttribute('data-trace-id', trace.id);
                traceItem.setAttribute('data-upload-id', upload.id);
                
                traceItem.innerHTML = `
                    <div class="trace-name">
                        <i class="bi bi-file-earmark-text"></i>
                        ${trace.filename}
                    </div>
                    <div class="trace-count">${trace.row_count || 0} rows</div>
                `;
                
                traceItem.addEventListener('click', function() {
                    selectTrace(trace.id, upload.id);
                });
                
                traceList.appendChild(traceItem);
            });
            
            uploadContent.appendChild(traceList);
            
            // Add button group for actions
            const actionButtonGroup = document.createElement('div');
            actionButtonGroup.className = 'btn-group mt-2 w-100';
            
            // Create a custom dropdown that doesn't rely on Bootstrap JS
            const exportWrapper = document.createElement('div');
            exportWrapper.className = 'custom-dropdown me-2';
            exportWrapper.style.position = 'relative';
            exportWrapper.style.display = 'inline-block';
            exportWrapper.style.flexGrow = '1';
            
            const exportButton = document.createElement('button');
            exportButton.className = 'btn btn-outline-primary btn-sm';
            exportButton.style.width = '100%';
            exportButton.innerHTML = '<i class="bi bi-download"></i> Export <i class="bi bi-chevron-down"></i>';
            exportButton.setAttribute('type', 'button');
            
            const dropdownMenu = document.createElement('div');
            dropdownMenu.className = 'custom-dropdown-menu';
            dropdownMenu.style.display = 'none';
            dropdownMenu.style.position = 'absolute';
            dropdownMenu.style.backgroundColor = '#fff';
            dropdownMenu.style.border = '1px solid #ddd';
            dropdownMenu.style.borderRadius = '4px';
            dropdownMenu.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
            dropdownMenu.style.zIndex = '1000';
            dropdownMenu.style.width = '100%';
            dropdownMenu.style.marginTop = '2px';
            
            // Add CSV export option
            const csvOption = document.createElement('a');
            csvOption.href = '#';
            csvOption.innerHTML = 'Export CSV';
            csvOption.style.display = 'block';
            csvOption.style.padding = '8px 10px';
            csvOption.style.textDecoration = 'none';
            csvOption.style.color = '#212529';
            csvOption.addEventListener('mouseenter', () => { csvOption.style.backgroundColor = '#f8f9fa'; });
            csvOption.addEventListener('mouseleave', () => { csvOption.style.backgroundColor = 'transparent'; });
            csvOption.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                exportUploadToCSV(upload.id, upload.name);
                dropdownMenu.style.display = 'none';
            });
            dropdownMenu.appendChild(csvOption);
            
            // Add Google Sheets export option
            const sheetsOption = document.createElement('a');
            sheetsOption.href = '#';
            sheetsOption.innerHTML = 'Export to Google Sheets';
            sheetsOption.style.display = 'block';
            sheetsOption.style.padding = '8px 10px';
            sheetsOption.style.textDecoration = 'none';
            sheetsOption.style.color = '#212529';
            sheetsOption.addEventListener('mouseenter', () => { sheetsOption.style.backgroundColor = '#f8f9fa'; });
            sheetsOption.addEventListener('mouseleave', () => { sheetsOption.style.backgroundColor = 'transparent'; });
            sheetsOption.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                exportUploadToGoogleSheets(upload.id, upload.name);
                dropdownMenu.style.display = 'none';
            });
            dropdownMenu.appendChild(sheetsOption);
            
            // Toggle dropdown visibility
            exportButton.addEventListener('click', function(e) {
                e.stopPropagation();
                dropdownMenu.style.display = dropdownMenu.style.display === 'none' ? 'block' : 'none';
            });
            
            // Close dropdown when clicking elsewhere
            document.addEventListener('click', function() {
                dropdownMenu.style.display = 'none';
            });
            
            // Assemble the dropdown
            exportWrapper.appendChild(exportButton);
            exportWrapper.appendChild(dropdownMenu);
            
            // Add delete button
            const deleteButton = document.createElement('button');
            deleteButton.className = 'btn btn-outline-danger btn-sm';
            deleteButton.innerHTML = '<i class="bi bi-trash"></i> Delete';
            deleteButton.addEventListener('click', function(e) {
                e.stopPropagation();
                if (confirm(`Are you sure you want to delete "${upload.name}"?`)) {
                    deleteUpload(upload.id);
                }
            });
            
            // Structure the action buttons with flex
            const buttonWrapper = document.createElement('div');
            buttonWrapper.className = 'd-flex';
            buttonWrapper.style.width = '100%';
            
            buttonWrapper.appendChild(exportWrapper);
            buttonWrapper.appendChild(deleteButton);
            
            actionButtonGroup.appendChild(buttonWrapper);
            uploadContent.appendChild(actionButtonGroup);
            
            // Add to upload group
            uploadGroup.appendChild(uploadHeader);
            uploadGroup.appendChild(uploadContent);
            uploadsListContainer.appendChild(uploadGroup);
        });
    }
}

// Toggle the visibility of an upload's content
function toggleUploadContent(uploadId) {
    const content = document.getElementById(`upload-content-${uploadId}`);
    if (content) {
        content.style.display = content.style.display === 'none' ? 'block' : 'none';
    }
}

// Rename an upload
function renameUpload(uploadId, event) {
    event.stopPropagation();
    const element = event.target;
    const currentName = element.textContent;
    
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'rename-input';
    input.value = currentName;
    
    element.innerHTML = '';
    element.appendChild(input);
    input.focus();
    
    input.addEventListener('blur', function() {
        completeRename(uploadId, input, element);
    });
    
    input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            completeRename(uploadId, input, element);
        } else if (e.key === 'Escape') {
            element.textContent = currentName;
        }
    });
}

// Complete the rename operation
function completeRename(uploadId, input, element) {
    const newName = input.value.trim();
    if (newName && newName !== element.textContent) {
        fetch(`/api/upload/${uploadId}/rename`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name: newName })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                element.textContent = newName;
                // Update the name in our local data too
                const upload = window.uploads.find(u => u.id === uploadId);
                if (upload) upload.name = newName;
            } else {
                element.textContent = window.uploads.find(u => u.id === uploadId)?.name || 'Unnamed Upload';
                showToast(`Rename failed: ${data.error}`, 'error');
            }
        })
        .catch(error => {
            element.textContent = window.uploads.find(u => u.id === uploadId)?.name || 'Unnamed Upload';
            showToast(`Rename error: ${error}`, 'error');
        });
    } else {
        element.textContent = window.uploads.find(u => u.id === uploadId)?.name || 'Unnamed Upload';
    }
}

// Delete an upload
function deleteUpload(uploadId) {
    fetch(`/api/upload/${uploadId}`, {
        method: 'DELETE'
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showToast('Upload deleted successfully');
            loadUploads();
        } else {
            showToast(`Delete failed: ${data.error}`, 'error');
        }
    })
    .catch(error => {
        showToast(`Delete error: ${error}`, 'error');
    });
}

// Export all traces from an upload as CSV
function exportUploadToCSV(uploadId, uploadName) {
    // Show loading toast and disable the export button
    const loadingToastId = showToast(`<div><i class="bi bi-arrow-clockwise spin"></i> Preparing CSV export for "${uploadName}"...</div>`, 'info', 0, true);
    
    // Add a global notification at the top of the UI
    const notificationBar = document.createElement('div');
    notificationBar.id = 'csv-export-notification';
    notificationBar.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#007bff;color:white;padding:10px;text-align:center;z-index:9999;';
    notificationBar.innerHTML = `<i class="bi bi-arrow-clockwise spin"></i> Preparing CSV export for "${uploadName}". Please wait...`;
    document.body.prepend(notificationBar);
    
    // Attempt to find and disable export buttons, but don't rely on it
    try {
        const exportButtons = document.querySelectorAll(`#upload-${uploadId} button`);
        exportButtons.forEach(btn => {
            if (btn.innerHTML.includes('bi-download')) {
                btn.disabled = true;
                btn.innerHTML = '<i class="bi bi-arrow-clockwise spin"></i> Exporting...';
            }
        });
    } catch (e) {
        console.warn('Could not disable export buttons:', e);
    }
    
    // Log to console to confirm the export has started
    console.log(`Starting CSV export for upload ${uploadId}: ${uploadName}`);
    
    const downloadUrl = `/api/upload/${uploadId}/export-csv`;
    
    // Create a temporary link and trigger download
    const downloadLink = document.createElement('a');
    downloadLink.href = downloadUrl;
    downloadLink.download = `${uploadName.replace(/\s+/g, '_')}_traces.zip`;
    document.body.appendChild(downloadLink);
    
    // Set a timeout to simulate the preparation time and provide user feedback
    setTimeout(() => {
        // Clear notifications
        document.getElementById(loadingToastId)?.remove();
        document.getElementById('csv-export-notification')?.remove();
        
        // Trigger the download
        downloadLink.click();
        document.body.removeChild(downloadLink);
        
        // Show success toast
        showToast(`<div><i class="bi bi-check-circle"></i> CSV export started for "${uploadName}"</div>`, 'success', 5000, true);
        
        // Also show a global success bar
        const successBar = document.createElement('div');
        successBar.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#28a745;color:white;padding:10px;text-align:center;z-index:9999;';
        successBar.innerHTML = `<i class="bi bi-check-circle"></i> CSV export started for "${uploadName}". Your download should begin automatically.`;
        document.body.prepend(successBar);
        setTimeout(() => successBar.remove(), 5000);
        
        // Re-enable the export button
        try {
            const exportButtons = document.querySelectorAll(`#upload-${uploadId} button`);
            exportButtons.forEach(btn => {
                if (btn.disabled || btn.innerHTML.includes('Exporting')) {
                    btn.disabled = false;
                    btn.innerHTML = '<i class="bi bi-download"></i> Export <i class="bi bi-chevron-down"></i>';
                }
            });
        } catch (e) {
            console.warn('Could not re-enable export buttons:', e);
        }
    }, 800); // Short delay to show the loading state
}

// Export all traces from an upload to Google Sheets
function exportUploadToGoogleSheets(uploadId, uploadName) {
    // Create a notification that will stay visible until process completes
    const loadingToastId = showToast(
        `<div><i class="bi bi-arrow-clockwise spin"></i> Exporting traces from "${uploadName}" to Google Sheets...</div>`, 
        'info', 
        0, 
        true
    );
    
    // Add a global notification at the top of the UI
    const notificationBar = document.createElement('div');
    notificationBar.id = 'sheets-export-notification';
    notificationBar.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#007bff;color:white;padding:10px;text-align:center;z-index:9999;';
    notificationBar.innerHTML = `<i class="bi bi-arrow-clockwise spin"></i> Exporting "${uploadName}" to Google Sheets. Please wait...`;
    document.body.prepend(notificationBar);
    
    // Attempt to find and disable export buttons, but don't rely on it
    try {
        const dropdownMenus = document.querySelectorAll(`.custom-dropdown-menu`);
        dropdownMenus.forEach(menu => {
            const links = menu.querySelectorAll('a');
            links.forEach(link => {
                if (link.textContent.includes('Google Sheets')) {
                    link.style.pointerEvents = 'none';
                    link.style.opacity = '0.6';
                }
            });
        });
    } catch (e) {
        console.warn('Could not disable export buttons:', e);
    }
    
    // Log to console to confirm the export has started
    console.log(`Starting Google Sheets export for upload ${uploadId}: ${uploadName}`);
    
    fetch(`/api/upload/${uploadId}/export-to-sheets`)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            // Clear notifications
            document.getElementById(loadingToastId)?.remove();
            document.getElementById('sheets-export-notification')?.remove();
            
            // Re-enable buttons
            try {
                const dropdownMenus = document.querySelectorAll(`.custom-dropdown-menu`);
                dropdownMenus.forEach(menu => {
                    const links = menu.querySelectorAll('a');
                    links.forEach(link => {
                        if (link.textContent.includes('Google Sheets')) {
                            link.style.pointerEvents = '';
                            link.style.opacity = '';
                        }
                    });
                });
            } catch (e) {
                console.warn('Could not re-enable export buttons:', e);
            }
            
            if (data.success && data.spreadsheet_url) {
                // Success with URL in the expected format
                showToast(
                    `<div><i class="bi bi-check-circle"></i> Export successful! <a href="${data.spreadsheet_url}" target="_blank">Open in Google Sheets</a></div>`,
                    'success',
                    10000,
                    true
                );
                
                // Also show a global success bar
                const successBar = document.createElement('div');
                successBar.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#28a745;color:white;padding:10px;text-align:center;z-index:9999;';
                successBar.innerHTML = `<i class="bi bi-check-circle"></i> Export successful! <a href="${data.spreadsheet_url}" target="_blank" style="color:white;text-decoration:underline;">Open in Google Sheets</a>`;
                document.body.prepend(successBar);
                setTimeout(() => successBar.remove(), 8000);
                
            } else if (data.spreadsheet_url) {
                // Success but missing success field
                showToast(
                    `<div><i class="bi bi-check-circle"></i> Export successful! <a href="${data.spreadsheet_url}" target="_blank">Open in Google Sheets</a></div>`,
                    'success',
                    10000,
                    true
                );
                
                // Also show a global success bar
                const successBar = document.createElement('div');
                successBar.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#28a745;color:white;padding:10px;text-align:center;z-index:9999;';
                successBar.innerHTML = `<i class="bi bi-check-circle"></i> Export successful! <a href="${data.spreadsheet_url}" target="_blank" style="color:white;text-decoration:underline;">Open in Google Sheets</a>`;
                document.body.prepend(successBar);
                setTimeout(() => successBar.remove(), 8000);
                
            } else if (data.error) {
                // Server returned an error message
                showToast(`<div><i class="bi bi-exclamation-triangle"></i> Export failed: ${data.error}</div>`, 'error', 10000, true);
            } else {
                // Unknown success/failure state
                console.warn('Unexpected response format:', data);
                showToast('<div><i class="bi bi-question-circle"></i> Export completed but status is unknown. Check the console for details.</div>', 'warning', 10000, true);
            }
        })
        .catch(error => {
            // Clear notifications
            document.getElementById(loadingToastId)?.remove();
            document.getElementById('sheets-export-notification')?.remove();
            
            // Re-enable buttons
            try {
                const dropdownMenus = document.querySelectorAll(`.custom-dropdown-menu`);
                dropdownMenus.forEach(menu => {
                    const links = menu.querySelectorAll('a');
                    links.forEach(link => {
                        if (link.textContent.includes('Google Sheets')) {
                            link.style.pointerEvents = '';
                            link.style.opacity = '';
                        }
                    });
                });
            } catch (e) {
                console.warn('Could not re-enable export buttons:', e);
            }
            
            console.error('Error exporting to Google Sheets:', error);
            showToast(`<div><i class="bi bi-exclamation-triangle"></i> Export failed: ${error.message || 'Connection error'}</div>`, 'error', 10000, true);
        });
}

// Make the functions available globally
window.exportUploadToCSV = exportUploadToCSV;
window.exportUploadToGoogleSheets = exportUploadToGoogleSheets; 