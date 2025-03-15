// Main Application Logic for TT-NN Trace Viewer

// Global variables
let currentTrace = null;
let columnFilters = {};
let uploads = [];
let filteredUploads = [];
let viewMode = 'by_upload';
let commonFilterFn = null;
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
    viewMode = mode;
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
function showToast(message, type = 'success') {
    const toastContainer = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <div>${message}</div>
        <button class="toast-close" onclick="this.parentElement.remove()">&times;</button>
    `;
    toastContainer.appendChild(toast);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s ease-out forwards';
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 5000);
}

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
            showToast(`File ${file.name} uploaded successfully!`);
            loadUploads();
        } else {
            showToast(`Upload failed: ${data.error}`, 'error');
        }
    })
    .catch(error => {
        showToast(`Upload error: ${error}`, 'error');
    });
    
    // Reset file input
    event.target.value = '';
} 