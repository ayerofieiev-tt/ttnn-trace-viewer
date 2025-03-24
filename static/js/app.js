// Main Application Logic for TT-NN Trace Viewer

// Global variables
window.currentTrace = null;
// Use window.columnFilters instead of a local variable to avoid conflicts
if (typeof window.columnFilters === 'undefined') {
    window.columnFilters = {};
}
window.uploads = [];
window.filteredUploads = [];
window.viewMode = 'by_upload';
window.commonFilterFn = null;
let customParsers = {};

// Initialize operations in progress from localStorage
window.operationsInProgress = {
    export: {},
    upload: false
};

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    // Load initial data
    loadUploads();
    loadCustomParsers();
    
    // Restore operation status from localStorage
    restoreOperationStatus();
    
    // Mark that operations have been restored
    window.operationsInProgressRestored = true;
    
    // Set up regular server status check
    startServerHeartbeat();
    
    // Set up file upload handler
    const fileInput = document.getElementById('hiddenFileInput');
    fileInput.addEventListener('change', handleFileUpload);
    
    // Set up click handler for the upload button with debounce
    const uploadButton = document.querySelector('.upload-section button');
    uploadButton.addEventListener('click', function(e) {
        // Check if upload is in progress
        if (window.operationsInProgress && window.operationsInProgress.upload) {
            e.preventDefault();
            showToast('Upload already in progress. Please wait...', 'warning');
            return;
        }
        
        // If no upload in progress, trigger file input click
        fileInput.click();
    });
    
    // Initialize toggle buttons
    initializeSidebarToggles();
    
    // Set initial view mode
    setViewMode('by_upload');
    
    // Add debug helper functions
    setupDebugHelpers();
});

// Add debug helper functions
function setupDebugHelpers() {
    // Debug parser for tensor shapes
    window.debug_parser = function(x) {
        console.log("[DEBUG PARSER] Called with:", x);
        if (typeof x !== 'string') {
            console.log("[DEBUG PARSER] Input is not a string:", typeof x);
            return null;
        }
        
        // Try to simulate tensorShape parsing for diagnostic purposes
        try {
            const match = x.match(/Tensor\[([^|]+)/);
            console.log("[DEBUG PARSER] Match result:", match);
            
            if (!match) {
                console.log("[DEBUG PARSER] No match found");
                return null;
            }
            
            const dimensions = match[1].split('x').map(dim => parseInt(dim, 10));
            console.log("[DEBUG PARSER] Dimensions:", dimensions);
            return dimensions;
        } catch (e) {
            console.log("[DEBUG PARSER] Error:", e);
            return null;
        }
    };
    
    // Debug version of tensor shape function
    window.debug_tensorShape = function(x) {
        console.log("[DEBUG TENSOR] Called with:", x);
        // Same implementation as tensorShape but with logging
        try {
            // Extract the content between the square brackets
            const match = x.match(/Tensor\[(.*?)\]/);
            console.log("[DEBUG TENSOR] Match result:", match);
            
            if (!match) {
                console.log("[DEBUG TENSOR] No match");
                return null;
            }
            
            // Split the content to get the shape part (before the first '|')
            const parts = match[1].split('|');
            console.log("[DEBUG TENSOR] Parts:", parts);
            const shapeStr = parts[0];
            
            // Split the shape string by 'x' and convert to integers
            const dimensions = shapeStr.split('x').map(dim => parseInt(dim, 10));
            console.log("[DEBUG TENSOR] Dimensions:", dimensions);
            
            return dimensions;
        } catch (e) {
            console.log("[DEBUG TENSOR] Error:", e);
            return null;
        }
    };
}

// View mode handling
function setViewMode(mode) {
    window.viewMode = mode;
    document.getElementById('byUploadBtn').classList.toggle('active', mode === 'by_upload');
    document.getElementById('consolidatedBtn').classList.toggle('active', mode === 'consolidated');
    document.getElementById('uploadFilter').placeholder = mode === 'by_upload' ? 'Filter uploads...' : 'Filter traces...';
    document.getElementById('traceFilter').style.display = mode === 'by_upload' ? 'block' : 'none';
    loadUploads();
}

// Toggle sidebar visibility
function toggleSidebar(side) {
    if (side === 'left') {
        const leftSidebar = document.getElementById('leftSidebar');
        leftSidebar.classList.toggle('hidden');
        
        const toggleButton = document.querySelector('.left-toggle');
        if (leftSidebar.classList.contains('hidden')) {
            toggleButton.innerHTML = '<i class="bi bi-chevron-right"></i>';
        } else {
            toggleButton.innerHTML = '<i class="bi bi-chevron-left"></i>';
        }
    } else if (side === 'right') {
        const rightSidebar = document.getElementById('rightSidebar');
        rightSidebar.classList.toggle('hidden');
        
        const toggleButton = document.querySelector('.right-toggle');
        if (rightSidebar.classList.contains('hidden')) {
            toggleButton.style.right = '0px';
            toggleButton.innerHTML = '<i class="bi bi-chevron-left"></i>';
        } else {
            toggleButton.style.right = '400px';
            toggleButton.innerHTML = '<i class="bi bi-chevron-right"></i>';
        }
    }
}

// Initialize sidebar toggle button positions
function initializeSidebarToggles() {
    const rightToggle = document.querySelector('.right-toggle');
    if (rightToggle) {
        const rightSidebar = document.getElementById('rightSidebar');
        if (rightSidebar && rightSidebar.classList.contains('hidden')) {
            rightToggle.style.right = '0px';
        } else {
            rightToggle.style.right = '400px';
        }
    }
}

// Show a toast notification
function showToast(message, type = 'success', duration = 5000, allowHTML = false) {
    const toastContainer = document.getElementById('toastContainer');
    
    // If toast container doesn't exist, create it
    if (!toastContainer) {
        const newContainer = document.createElement('div');
        newContainer.id = 'toastContainer';
        newContainer.className = 'toast-container';
        document.body.appendChild(newContainer);
    }
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    // Generate a unique ID for this toast
    const toastId = 'toast-' + Math.random().toString(36).substr(2, 9);
    toast.id = toastId;
    
    // Handle both message-first and type-first function calls for backward compatibility
    if (typeof message === 'string' && (type === 'success' || type === 'error' || type === 'info' || type === 'warning')) {
        // New style: first param is the message, second param is the type
    } else if (typeof message === 'string' && message === 'success' || message === 'error' || message === 'info' || message === 'warning') {
        // Old style: first param was the type, second param was the message
        const temp = message;
        message = type;
        type = temp;
    }
    
    // Set icon based on type
    const iconClass = type === 'error' ? 'bi-exclamation-triangle' : 
                      type === 'warning' ? 'bi-exclamation-circle' :
                      type === 'info' ? 'bi-info-circle' : 'bi-check-circle';
                      
    toast.innerHTML = `
        <div class="toast-content">
            <i class="bi ${iconClass}"></i>
            <span>${allowHTML ? message : document.createTextNode(message).textContent}</span>
        </div>
        <button class="toast-close" onclick="this.parentElement.remove()">×</button>
    `;
    
    // Ensure toast container exists before appending
    const container = document.getElementById('toastContainer') || document.body;
    container.appendChild(toast);
    
    // Log to console as a fallback
    const logMethod = type === 'error' ? console.error : 
                     type === 'warning' ? console.warn : console.log;
    logMethod('[Toast]', message.replace(/<[^>]*>/g, ''));  // Strip HTML tags for console
    
    // Auto-remove after specified duration
    if (duration > 0) {
        setTimeout(() => {
            if (toast.parentElement) {
                toast.remove();
            }
        }, duration);
    }
    
    // Return the toast ID so it can be referenced later
    return toastId;
}
window.showToast = showToast;

// Function to save operation status to localStorage
function saveOperationStatus() {
    try {
        localStorage.setItem('operationsInProgress', JSON.stringify({
            upload: window.operationsInProgress.upload,
            exportIds: Object.keys(window.operationsInProgress.export).filter(
                id => window.operationsInProgress.export[id]
            ),
            lastUpdated: new Date().getTime()
        }));
    } catch (e) {
        console.warn('Could not save operation status to localStorage:', e);
    }
}

// Function to restore operation status from localStorage
function restoreOperationStatus() {
    const runRestore = function() {
        try {
            const savedStatus = localStorage.getItem('operationsInProgress');
            if (savedStatus) {
                const parsedStatus = JSON.parse(savedStatus);
                
                // Check if status is recent (within last 10 minutes)
                const isRecent = (new Date().getTime() - parsedStatus.lastUpdated) < 10 * 60 * 1000;
                
                if (isRecent) {
                    // Restore upload status
                    if (parsedStatus.upload) {
                        window.operationsInProgress.upload = true;
                        
                        // Update UI to reflect ongoing upload
                        const uploadButton = document.querySelector('.upload-section button');
                        if (uploadButton) {
                            uploadButton.disabled = true;
                            uploadButton.innerHTML = '<i class="bi bi-arrow-clockwise spin"></i> Uploading...';
                        }
                        
                        // Show notification bar that upload is in progress
                        const notificationBar = document.createElement('div');
                        notificationBar.id = 'upload-notification';
                        notificationBar.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#007bff;color:white;padding:10px;text-align:center;z-index:9999;';
                        notificationBar.innerHTML = `<i class="bi bi-arrow-clockwise spin"></i> Upload in progress. This might take a couple of minutes. Please wait...`;
                        document.body.prepend(notificationBar);
                        
                        // Check upload status via server after a small delay
                        setTimeout(checkUploadStatusFromServer, 1000);
                    }
                    
                    // Restore export statuses
                    if (parsedStatus.exportIds && Array.isArray(parsedStatus.exportIds)) {
                        parsedStatus.exportIds.forEach(id => {
                            window.operationsInProgress.export[id] = true;
                        });
                    }
                } else {
                    // Status is stale, clear it
                    localStorage.removeItem('operationsInProgress');
                }
            }
        } catch (e) {
            console.warn('Could not restore operation status from localStorage:', e);
            localStorage.removeItem('operationsInProgress');
        }
    };
    
    // If DOM is loaded, run now, otherwise wait for DOMContentLoaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', runRestore);
    } else {
        runRestore();
    }
}

// Function to start server heartbeat checks
function startServerHeartbeat() {
    // Check server status immediately 
    checkServerStatus();
    
    // Then check every 60 seconds (reduced from 30 for less frequent checks)
    setInterval(checkServerStatus, 60000);
}

// Function to check if server is reachable and verify upload status
function checkServerStatus() {
    const url = `/api/uploads/status?_t=${new Date().getTime()}`;
    
    // Set a timeout for the request
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    fetch(url, {
        method: 'GET',
        headers: { 'Cache-Control': 'no-cache' },
        credentials: 'same-origin',
        signal: controller.signal
    })
        .then(response => {
            clearTimeout(timeoutId);
            
            if (response.ok) {
                // Always parse response to check upload status
                return response.json().then(data => {
                    // If server reports active uploads
                    if (data.uploading) {
                        // Update our state if it doesn't match server
                        if (!window.operationsInProgress.upload) {
                            window.operationsInProgress.upload = true;
                            saveOperationStatus();
                        }
                        
                        // Update UI
                        const uploadButton = document.querySelector('.upload-section button');
                        if (uploadButton) {
                            uploadButton.disabled = true;
                            uploadButton.innerHTML = '<i class="bi bi-arrow-clockwise spin"></i> Uploading...';
                        }
                        
                        // Show notification if not already shown
                        if (!document.getElementById('upload-notification')) {
                            const notificationBar = document.createElement('div');
                            notificationBar.id = 'upload-notification';
                            notificationBar.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#007bff;color:white;padding:10px;text-align:center;z-index:9999;';
                            notificationBar.innerHTML = `<i class="bi bi-arrow-clockwise spin"></i> Upload in progress. This might take a couple of minutes. Please wait...`;
                            document.body.prepend(notificationBar);
                        }
                        
                        // Schedule next check sooner for active uploads
                        setTimeout(checkUploadStatusFromServer, 3000);
                    }
                    // If server reports no uploads but we think there is one
                    else if (!data.uploading && window.operationsInProgress.upload) {
                        window.operationsInProgress.upload = false;
                        document.getElementById('upload-notification')?.remove();
                        
                        const uploadButton = document.querySelector('.upload-section button');
                        if (uploadButton) {
                            uploadButton.disabled = false;
                            uploadButton.innerHTML = 'Upload JSON';
                        }
                        
                        saveOperationStatus();
                        loadUploads(); // Reload uploads list
                    }
                });
            }
        })
        .catch(error => {
            clearTimeout(timeoutId);
            console.warn('Server check failed:', error);
        });
}

// Function to check upload status from server
function checkUploadStatusFromServer() {
    const url = `/api/uploads/status?_t=${new Date().getTime()}`;
    
    fetch(url, {
        method: 'GET',
        headers: { 'Cache-Control': 'no-cache' },
        credentials: 'same-origin'
    })
        .then(response => {
            if (!response.ok) {
                throw new Error(`Server returned ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            if (data.uploading) {
                // Server confirms upload is in progress
                window.operationsInProgress.upload = true;
                
                // Make sure UI reflects this
                const uploadButton = document.querySelector('.upload-section button');
                if (uploadButton) {
                    uploadButton.disabled = true;
                    uploadButton.innerHTML = '<i class="bi bi-arrow-clockwise spin"></i> Uploading...';
                }
                
                // Make sure notification is shown
                if (!document.getElementById('upload-notification')) {
                    const notificationBar = document.createElement('div');
                    notificationBar.id = 'upload-notification';
                    notificationBar.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#007bff;color:white;padding:10px;text-align:center;z-index:9999;';
                    notificationBar.innerHTML = `<i class="bi bi-arrow-clockwise spin"></i> Upload in progress. This might take a couple of minutes. Please wait...`;
                    document.body.prepend(notificationBar);
                }
                
                // Check again in 3 seconds
                setTimeout(checkUploadStatusFromServer, 3000);
            } else {
                // If server reports no active uploads, clear our status
                window.operationsInProgress.upload = false;
                
                const notification = document.getElementById('upload-notification');
                if (notification) {
                    notification.remove();
                }
                
                const uploadButton = document.querySelector('.upload-section button');
                if (uploadButton) {
                    uploadButton.disabled = false;
                    uploadButton.innerHTML = 'Upload JSON';
                }
                
                saveOperationStatus();
                loadUploads(); // Reload uploads to get the latest data
            }
        })
        .catch(error => {
            console.warn('Error checking upload status:', error);
            
            // On error, assume upload is complete to avoid locking the UI
            window.operationsInProgress.upload = false;
            
            const notification = document.getElementById('upload-notification');
            if (notification) {
                notification.remove();
            }
            
            const uploadButton = document.querySelector('.upload-section button');
            if (uploadButton) {
                uploadButton.disabled = false;
                uploadButton.innerHTML = 'Upload JSON';
            }
            
            saveOperationStatus();
        });
}

// Handle file upload
function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Check if already uploading
    if (window.operationsInProgress && window.operationsInProgress.upload) {
        showToast('Upload already in progress. Please wait...', 'warning');
        event.target.value = '';
        return;
    }
    
    // Set upload in progress immediately
    if (!window.operationsInProgress) window.operationsInProgress = {};
    window.operationsInProgress.upload = true;
    
    // Save operation status to localStorage
    saveOperationStatus();
    
    // Get reference to the upload button and disable it immediately
    const uploadButton = document.querySelector('.upload-section button');
    uploadButton.disabled = true;
    uploadButton.innerHTML = '<i class="bi bi-arrow-clockwise spin"></i> Uploading...';
    
    // Add a global notification at the top of the UI immediately
    const notificationBar = document.createElement('div');
    notificationBar.id = 'upload-notification';
    notificationBar.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#007bff;color:white;padding:10px;text-align:center;z-index:9999;';
    notificationBar.innerHTML = `<i class="bi bi-arrow-clockwise spin"></i> Uploading "${file.name}". This might take a couple of minutes depending on the size of the trace. Please wait...`;
    document.body.prepend(notificationBar);
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('name', file.name.replace(/\.[^/.]+$/, "")); // Use filename without extension as initial name
    
    // Start upload with a small delay to ensure UI updates are visible
    setTimeout(() => {
        fetch('/api/upload', {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            // Remove notification bar
            document.getElementById('upload-notification')?.remove();
            
            // Reset upload button
            uploadButton.disabled = false;
            uploadButton.innerHTML = 'Upload JSON';
            
            // Mark upload as no longer in progress
            window.operationsInProgress.upload = false;
            
            // Update localStorage
            saveOperationStatus();
            
            if (data.success) {
                // Show success toast
                showToast(`File ${file.name} uploaded successfully!`, 'success');
                
                // Show global success notification
                const successBar = document.createElement('div');
                successBar.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#28a745;color:white;padding:10px;text-align:center;z-index:9999;';
                successBar.innerHTML = `<i class="bi bi-check-circle"></i> "${file.name}" uploaded successfully!`;
                document.body.prepend(successBar);
                setTimeout(() => successBar.remove(), 5000);
                
                // Reload uploads list
                loadUploads();
            } else {
                showToast(`Upload failed: ${data.error}`, 'error');
                
                // Show error notification
                const errorBar = document.createElement('div');
                errorBar.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#dc3545;color:white;padding:10px;text-align:center;z-index:9999;';
                errorBar.innerHTML = `<i class="bi bi-exclamation-triangle"></i> Upload failed: ${data.error}`;
                document.body.prepend(errorBar);
                setTimeout(() => errorBar.remove(), 5000);
            }
        })
        .catch(error => {
            // Remove notification bar
            document.getElementById('upload-notification')?.remove();
            
            // Reset upload button
            uploadButton.disabled = false;
            uploadButton.innerHTML = 'Upload JSON';
            
            // Mark upload as no longer in progress
            window.operationsInProgress.upload = false;
            
            // Update localStorage
            saveOperationStatus();
            
            showToast(`Upload error: ${error}`, 'error');
            
            // Show error notification
            const errorBar = document.createElement('div');
            errorBar.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#dc3545;color:white;padding:10px;text-align:center;z-index:9999;';
            errorBar.innerHTML = `<i class="bi bi-exclamation-triangle"></i> Upload error: ${error}`;
            document.body.prepend(errorBar);
            setTimeout(() => errorBar.remove(), 5000);
        });
    }, 50); // Small delay to ensure UI updates are visible
    
    // Reset file input
    event.target.value = '';
} 