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

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    // Load initial data
    loadUploads();
    loadCustomParsers();
    
    // Set up file upload handler
    document.getElementById('hiddenFileInput').addEventListener('change', handleFileUpload);
    
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

// Handle file upload
function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('name', file.name.replace(/\.[^/.]+$/, "")); // Use filename without extension as initial name
    
    fetch('/api/upload', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showToast('success', `File ${file.name} uploaded successfully!`);
            loadUploads();
        } else {
            showToast('error', `Upload failed: ${data.error}`);
        }
    })
    .catch(error => {
        showToast('error', `Upload error: ${error}`);
    });
    
    // Reset file input
    event.target.value = '';
} 