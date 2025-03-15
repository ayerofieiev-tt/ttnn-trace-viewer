// Uploads Handling for TT-NN Trace Viewer

// Load all uploads from the server
function loadUploads() {
    fetch(`/api/uploads?mode=${viewMode}`)
        .then(response => response.json())
        .then(data => {
            uploads = data;
            
            // Sort uploads by date (newest first) if in by_upload mode
            if (viewMode === 'by_upload') {
                uploads.sort((a, b) => {
                    // If there's an explicit timestamp field, use that
                    if (a.timestamp && b.timestamp) {
                        return new Date(b.timestamp) - new Date(a.timestamp);
                    }
                    // Otherwise, use the upload ID (assuming higher ID = newer upload)
                    return b.id - a.id;
                });
            }
            
            filteredUploads = [...uploads];
            displayUploadsList();
        });
}

// Filter uploads based on search term
function filterUploads() {
    const searchTerm = document.getElementById('uploadFilter').value.toLowerCase();
    
    if (viewMode === 'consolidated') {
        // For consolidated view, filter the traces directly
        filteredUploads = uploads.filter(trace => 
            trace.filename.toLowerCase().includes(searchTerm)
        );
        displayUploadsList();
    } else {
        // For by-upload view, filter both uploads and traces
        filteredUploads = uploads.filter(upload => {
            const uploadMatches = upload.name.toLowerCase().includes(searchTerm);
            const hasMatchingTraces = upload.traces.some(trace => 
                trace.filename.toLowerCase().includes(searchTerm)
            );
            return uploadMatches || hasMatchingTraces;
        });
        
        // Keep uploads sorted by date (newest first)
        filteredUploads.sort((a, b) => {
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
    
    if (viewMode === 'consolidated') {
        // Consolidated view - show all traces grouped
        const traceList = document.createElement('div');
        traceList.className = 'trace-list';
        
        const searchTerm = document.getElementById('uploadFilter').value.toLowerCase();
        const filteredTraces = uploads.filter(trace => 
            trace.filename.toLowerCase().includes(searchTerm)
        );
                 
        // Sort traces alphabetically by filename
        filteredTraces.sort((a, b) => a.filename.localeCompare(b.filename));
        
        filteredTraces.forEach(trace => {
            const traceItem = document.createElement('div');
            traceItem.className = 'trace-item';
            if (currentTrace && currentTrace.filename === trace.filename) {
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
        filteredUploads.forEach(upload => {
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
                <div class="upload-name" onclick="renameUpload(${upload.id}, event)">${upload.name || 'Unnamed Upload'}</div>
                <div class="upload-count">${filteredTraces.length} traces</div>
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
            
            // Add delete button
            const deleteButton = document.createElement('button');
            deleteButton.className = 'btn btn-danger btn-sm mt-2';
            deleteButton.textContent = 'Delete Upload';
            deleteButton.addEventListener('click', function(e) {
                e.stopPropagation();
                if (confirm(`Are you sure you want to delete "${upload.name}"?`)) {
                    deleteUpload(upload.id);
                }
            });
            uploadContent.appendChild(deleteButton);
            
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
                const upload = uploads.find(u => u.id === uploadId);
                if (upload) upload.name = newName;
            } else {
                element.textContent = uploads.find(u => u.id === uploadId)?.name || 'Unnamed Upload';
                showToast(`Rename failed: ${data.error}`, 'error');
            }
        })
        .catch(error => {
            element.textContent = uploads.find(u => u.id === uploadId)?.name || 'Unnamed Upload';
            showToast(`Rename error: ${error}`, 'error');
        });
    } else {
        element.textContent = uploads.find(u => u.id === uploadId)?.name || 'Unnamed Upload';
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