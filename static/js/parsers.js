// Custom Parsers for TT-NN Trace Viewer

let editorIsNew = false;
let currentParserName = '';
let monacoEditor = null;
let monacoLoaded = false;

// Initialize Monaco Editor conditionally
if (!window.monacoRequireConfigDone) {
    window.monacoRequireConfigDone = true;
    require.config({ paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.44.0/min/vs' }});
}

// Load Monaco only when needed, not on page load
function loadMonacoIfNeeded(callback) {
    if (monacoLoaded) {
        callback();
        return;
    }
    
    require(['vs/editor/editor.main'], function() {
        monacoLoaded = true;
        callback();
    });
}

// Load custom parsers from the server
function loadCustomParsers() {
    // Load from server API
    fetch('/api/parsers')
        .then(response => response.json())
        .then(data => {
            customParsers = {};
            
            // Recreate function objects from saved strings
            for (const parser of data) {
                try {
                    // Store the parser code
                    customParsers[parser.name] = parser.code;
                    
                    // Also register it globally
                    updateGlobalParser(parser.name, parser.code);
                    
                    // Store the ID if we have one
                    if (parser.id) {
                        customParsers[parser.name + '_id'] = parser.id;
                    }
                } catch (e) {
                    console.error(`Error recreating parser ${parser.name}:`, e);
                }
            }
            
            displayCustomParsers();
            
            // Log available parsers to console for debugging
            console.log("Registered parsers:", Object.keys(customParsers).filter(k => !k.endsWith('_id')));
        })
        .catch(error => {
            console.error('Error loading parsers:', error);
            // If no parsers are in the database, add default parsers
            addBuiltInTensorShapeParser();
        });
}

// Display the list of custom parsers
function displayCustomParsers() {
    const parsersListContainer = document.getElementById('parsersList');
    parsersListContainer.innerHTML = '';
    
    Object.keys(customParsers).forEach(name => {
        // Skip ID fields
        if (name.endsWith('_id')) return;
        
        const parserItem = document.createElement('div');
        parserItem.className = 'parser-item';
        
        parserItem.innerHTML = `
            <div class="parser-header">
                <div class="parser-name">${name}</div>
                <div class="parser-actions">
                    <button class="btn btn-sm btn-outline-primary" onclick="editParser('${name}')">
                        Edit
                    </button>
                    <button class="btn btn-sm btn-outline-danger" onclick="deleteParser('${name}')">
                        Delete
                    </button>
                </div>
            </div>
        `;
        
        parsersListContainer.appendChild(parserItem);
    });
    
    // Add built-in tensor shape parser if it doesn't exist
    if (!customParsers['tensorShape']) {
        addBuiltInTensorShapeParser();
    }
}

// Add built-in tensor shape parser
function addBuiltInTensorShapeParser() {
    const parserCode = `function tensorShape(x) {
  // Extract the content between the square brackets
  const match = x.match(/Tensor\\[(.*?)\\]/);
  if (!match) return null;
  
  // Split the content to get the shape part (before the first '|')
  const parts = match[1].split('|');
  const shapeStr = parts[0];
  
  // Split the shape string by 'x' and convert to integers
  return shapeStr.split('x').map(dim => parseInt(dim, 10));
}`;

    customParsers['tensorShape'] = parserCode;
    updateGlobalParser('tensorShape', parserCode);
    
    // Save to server
    createOrUpdateParserOnServer('tensorShape', parserCode);
    
    displayCustomParsers();
}

// Create or update a parser on the server
function createOrUpdateParserOnServer(name, code) {
    const parserId = customParsers[name + '_id'];
    const method = parserId ? 'PUT' : 'POST';
    const url = parserId ? `/api/parsers/${parserId}` : '/api/parsers';
    
    fetch(url, {
        method: method,
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            name: name,
            code: code
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success && data.id) {
            customParsers[name + '_id'] = data.id;
        }
    })
    .catch(error => {
        console.error('Error saving parser to server:', error);
        showToast(`Error saving parser: ${error.message}`, 'error');
    });
}

// Update global namespace with a parser
function updateGlobalParser(name, code) {
    try {
        // Directly evaluate the code and assign to window
        const parserFunctionCode = code.trim();
        const isArrowFunction = parserFunctionCode.includes('=>');
        const isNamedFunction = parserFunctionCode.startsWith('function');
        
        if (isNamedFunction) {
            // For normal functions, just eval the code
            eval(parserFunctionCode);
            // Also make sure it's in the window object
            if (typeof window[name] !== 'function') {
                window[name] = eval(name);
            }
        } else if (isArrowFunction) {
            // For arrow functions or const declarations
            const fnMatch = parserFunctionCode.match(/(?:const|let|var)?\s*([a-zA-Z0-9_]+)\s*=/);
            if (fnMatch && fnMatch[1]) {
                eval(parserFunctionCode);
                window[name] = eval(fnMatch[1]);
            } else {
                // Anonymous arrow function
                window[name] = new Function('x', `return (${parserFunctionCode})(x);`);
            }
        } else {
            // Default fallback method
            window[name] = new Function(`return ${code}`)();
        }
        
        console.log(`Parser '${name}' registered successfully:`, typeof window[name] === 'function');
    } catch (error) {
        console.error(`Error registering parser ${name}:`, error);
    }
}

// Update global namespace with all parsers
function updateGlobalParsers() {
    Object.keys(customParsers).forEach(name => {
        // Skip ID fields
        if (name.endsWith('_id')) return;
        
        updateGlobalParser(name, customParsers[name]);
    });
}

// Add a new custom parser
function addNewParser() {
    editorIsNew = true;
    currentParserName = '';
    openParserEditor(`function tensorShape(x) {
  // Extract the content between the square brackets
  const match = x.match(/Tensor\\[(.*?)\\]/);
  if (!match) return null;
  
  // Split the content to get the shape part (before the first '|')
  const parts = match[1].split('|');
  const shapeStr = parts[0];
  
  // Split the shape string by 'x' and convert to integers
  return shapeStr.split('x').map(dim => parseInt(dim, 10));
}`);
}

// Edit an existing parser
function editParser(name) {
    editorIsNew = false;
    currentParserName = name;
    openParserEditor(customParsers[name]);
}

// Delete a parser
function deleteParser(name) {
    if (confirm(`Are you sure you want to delete the "${name}" parser?`)) {
        const parserId = customParsers[name + '_id'];
        
        // If we have an ID, delete from server
        if (parserId) {
            fetch(`/api/parsers/${parserId}`, {
                method: 'DELETE'
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    delete customParsers[name];
                    delete customParsers[name + '_id'];
                    delete window[name];
                    displayCustomParsers();
                    showToast(`Parser "${name}" deleted`);
                } else {
                    showToast(`Failed to delete parser: ${data.error}`, 'error');
                }
            })
            .catch(error => {
                console.error('Error deleting parser:', error);
                showToast(`Error deleting parser: ${error.message}`, 'error');
            });
        } else {
            // No ID, just delete locally
            delete customParsers[name];
            delete window[name];
            displayCustomParsers();
            showToast(`Parser "${name}" deleted`);
        }
    }
}

// Test a parser with sample input
function testParser(name) {
    const testInput = document.getElementById(`test-input-${name}`).value;
    const resultElement = document.getElementById(`test-result-${name}`);
    
    try {
        // Get the parser function
        const parserFunction = window[name];
        if (typeof parserFunction !== 'function') {
            throw new Error('Parser is not a function');
        }
        
        // Execute the parser with the test input
        const result = parserFunction(testInput);
        
        // Display the result
        resultElement.textContent = `Result: ${JSON.stringify(result)}`;
        resultElement.style.color = '#28a745';
    } catch (error) {
        resultElement.textContent = `Error: ${error.message}`;
        resultElement.style.color = '#dc3545';
    }
}

// Open the parser editor modal
function openParserEditor(code = '') {
    // Show the modal
    document.getElementById('parserEditorModal').style.display = 'flex';
    
    // Set default test input
    document.getElementById('testInput').value = 'Tensor[8x384x1024|BFLOAT16|INTERLEAVED|L1]';
    
    // Load Monaco and initialize the editor
    loadMonacoIfNeeded(function() {
        // Initialize Monaco editor if needed
        if (!monacoEditor) {
            initializeMonacoEditor(code);
        } else {
            monacoEditor.setValue(code);
        }
        
        // Extract function name on load
        setTimeout(extractFunctionName, 100);
    });
}

// Close the parser editor modal
function closeParserEditor() {
    document.getElementById('parserEditorModal').style.display = 'none';
    document.getElementById('testResult').style.display = 'none';
}

// Initialize Monaco Editor
function initializeMonacoEditor(code = '') {
    if (monacoEditor) {
        monacoEditor.dispose();
    }
    
    // Make sure monaco is defined before using it
    if (typeof monaco === 'undefined') {
        console.error('Monaco is not loaded yet');
        showToast('Editor failed to load. Please try again.', 'error');
        return null;
    }
    
    monacoEditor = monaco.editor.create(document.getElementById('editorContainer'), {
        value: code,
        language: 'javascript',
        theme: 'vs',
        automaticLayout: true,
        minimap: { enabled: false },
        lineNumbers: 'on',
        scrollBeyondLastLine: false,
        fixedOverflowWidgets: true
    });
    
    // Add event listener for extract function name on change
    monacoEditor.onDidChangeModelContent(function() {
        extractFunctionName();
    });
    
    // Set up auto-completion suggestions specific to tensor processing
    monaco.languages.registerCompletionItemProvider('javascript', {
        provideCompletionItems: function(model, position) {
            const textUntilPosition = model.getValueInRange({
                startLineNumber: position.lineNumber,
                startColumn: 1,
                endLineNumber: position.lineNumber,
                endColumn: position.column
            });
            
            const suggestions = [];
            
            // Add suggestions related to tensor parsing
            if (textUntilPosition.includes('x.')) {
                const stringMethods = [
                    {
                        label: 'match',
                        kind: monaco.languages.CompletionItemKind.Method,
                        insertText: 'match(${1:/Tensor\\\\[(\\\\d+)x(\\\\d+)/})',
                        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                        detail: 'String.prototype.match()',
                        documentation: 'Retrieves the result of matching a string against a regular expression.'
                    },
                    {
                        label: 'split',
                        kind: monaco.languages.CompletionItemKind.Method,
                        insertText: 'split(${1:\'|\'})',
                        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                        detail: 'String.prototype.split()',
                        documentation: 'Splits a String object into an array of strings by separating the string into substrings.'
                    },
                    {
                        label: 'replace',
                        kind: monaco.languages.CompletionItemKind.Method,
                        insertText: 'replace(${1:/\\\\]|\\\\[/g}, ${2:\'\'})',
                        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                        detail: 'String.prototype.replace()',
                        documentation: 'Returns a new string with some or all matches of a pattern replaced by a replacement.'
                    }
                ];
                suggestions.push(...stringMethods);
            }
            
            // Add tensor-related snippet suggestions
            if (position.column === 1) {
                suggestions.push({
                    label: 'tensorShape',
                    kind: monaco.languages.CompletionItemKind.Snippet,
                    insertText: [
                        'function tensorShape(x) {',
                        '  // Extract shape from tensor string',
                        '  const match = x.match(/Tensor\\\\[(.*?)\\\\|/);',
                        '  if (match) {',
                        '    return match[1].split("x").map(Number);',
                        '  }',
                        '  return null;',
                        '}'
                    ].join('\n'),
                    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                    detail: 'Extract tensor shape',
                    documentation: 'Function to extract shape dimensions from tensor string'
                });
                
                suggestions.push({
                    label: 'tensorDtype',
                    kind: monaco.languages.CompletionItemKind.Snippet,
                    insertText: [
                        'function tensorDtype(x) {',
                        '  // Extract dtype from tensor string',
                        '  const match = x.match(/\\\\|(\\\\w+)\\\\|/);',
                        '  return match ? match[1] : null;',
                        '}'
                    ].join('\n'),
                    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                    detail: 'Extract tensor dtype',
                    documentation: 'Function to extract data type from tensor string'
                });
            }
            
            return { suggestions: suggestions };
        }
    });
    
    return monacoEditor;
}

// Extract function name from the code
function extractFunctionName() {
    if (!monacoEditor) {
        console.warn('Editor not initialized yet, cannot extract function name');
        return;
    }
    
    const code = monacoEditor.getValue();
    
    // Try to extract function name using regex with improved patterns
    const functionNameMatch = code.match(/function\s+([a-zA-Z0-9_]+)\s*\(/);
    const varDeclarationMatch = code.match(/(?:const|let|var)\s+([a-zA-Z0-9_]+)\s*=/);
    
    let functionName = '';
    if (functionNameMatch && functionNameMatch[1]) {
        functionName = functionNameMatch[1];
    } else if (varDeclarationMatch && varDeclarationMatch[1]) {
        functionName = varDeclarationMatch[1];
    }
    
    // Always update the parser name field to match the function name
    const parserNameField = document.getElementById('parserName');
    if (functionName) {
        parserNameField.value = functionName;
        // Disable the field to make it clear it's automatically determined
        parserNameField.readOnly = true;
        parserNameField.classList.add('auto-detected');
    } else {
        // If no function name detected, enable the field for manual entry
        parserNameField.readOnly = false;
        parserNameField.classList.remove('auto-detected');
    }
}

// Test the parser in the editor
function testParserInEditor() {
    // Check if editor is initialized
    if (!monacoEditor) {
        showToast('Editor is not ready yet. Please try again.', 'error');
        return;
    }
    
    const code = monacoEditor.getValue();
    const testInput = document.getElementById('testInput').value;
    const resultElement = document.getElementById('testResult');
    
    try {
        // Evaluate the function
        const parserFunction = new Function(`return ${code}`)();
        
        // Test the function with the input
        const result = parserFunction(testInput);
        
        // Display the result
        resultElement.className = 'alert alert-success mt-2';
        resultElement.textContent = `Result: ${JSON.stringify(result)}`;
        resultElement.style.display = 'block';
    } catch (error) {
        resultElement.className = 'alert alert-danger mt-2';
        resultElement.textContent = `Error: ${error.message}`;
        resultElement.style.display = 'block';
    }
}

// Save the parser from the editor
function saveParser() {
    // Check if editor is initialized
    if (!monacoEditor) {
        showToast('Editor is not ready yet. Please try again.', 'error');
        return;
    }
    
    const code = monacoEditor.getValue();
    let name = document.getElementById('parserName').value.trim();
    
    // If no name provided, try to extract it from the code
    if (!name) {
        extractFunctionName();
        name = document.getElementById('parserName').value.trim();
        
        if (!name) {
            showToast('No function name detected. Please define a named function or provide a name manually.', 'error');
            // Enable the field for manual entry if needed
            document.getElementById('parserName').readOnly = false;
            return;
        }
    }
    
    // Validate the parser function
    try {
        const parserFunction = new Function(`return ${code}`)();
        if (typeof parserFunction !== 'function') {
            throw new Error('Parser must be a valid function');
        }
    } catch (error) {
        showToast(`Invalid parser function: ${error.message}`, 'error');
        return;
    }
    
    // Save the parser
    customParsers[name] = code;
    
    // Update the global namespace
    updateGlobalParser(name, code);
    
    // Save to server
    createOrUpdateParserOnServer(name, code);
    
    // Update display
    displayCustomParsers();
    
    // Close the editor
    closeParserEditor();
    
    showToast(`Parser "${name}" saved successfully`);
} 