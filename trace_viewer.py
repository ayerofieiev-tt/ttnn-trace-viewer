from flask import Flask, render_template, jsonify, request, flash
from trace_db import TraceDB
import json
import os
from werkzeug.utils import secure_filename
from store_traces import process_json_file

app = Flask(__name__)
app.secret_key = os.urandom(24)  # Required for flash messages
db = TraceDB()

UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'json'}

# Ensure upload directory exists
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/uploads')
def get_uploads():
    view_mode = request.args.get('mode', 'by_upload')
    
    if view_mode == 'consolidated':
        # Get all traces
        traces = db.get_all_traces()
        unique_traces = {}
        
        for trace in traces:
            trace_id, filename, sheet_name, error, row_count, upload_id = trace
            
            # Skip traces with errors
            if error:
                continue
                
            if filename not in unique_traces:
                # Get columns from the first occurrence of this trace
                columns = db.get_columns(trace_id)
                # Get actual row count from deduplicated values
                values = db.get_deduplicated_values_by_filename(filename)
                
                unique_traces[filename] = {
                    'filename': filename,
                    'row_count': len(values),
                    'columns': columns
                }
        
        # Convert to list and sort by filename
        result = list(unique_traces.values())
        result.sort(key=lambda x: x['filename'].lower())
        return jsonify(result)
    else:
        # Original by-upload view logic
        uploads = db.get_uploads()
        result = []
        for upload in uploads:
            upload_data = {
                'id': upload[0],
                'name': upload[1],
                'timestamp': upload[2],
                'traces': []
            }
            traces = db.get_traces_for_upload(upload[0])
            for trace in traces:
                trace_data = {
                    'id': trace[0],
                    'filename': trace[1],
                    'sheet_name': trace[2],
                    'error': trace[3],
                    'row_count': trace[4],
                    'columns': []
                }
                if not trace[3]:  # if no error
                    columns = db.get_columns(trace[0])
                    trace_data['columns'] = columns
                upload_data['traces'].append(trace_data)
            result.append(upload_data)
        return jsonify(result)

@app.route('/api/trace/<int:trace_id>/values')
def get_trace_values(trace_id):
    values = db.get_values(trace_id)
    return jsonify(values)

@app.route('/api/consolidated-trace/<path:filename>/values')
def get_consolidated_trace_values(filename):
    try:
        values = db.get_deduplicated_values_by_filename(filename)
        return jsonify(values)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/upload/<int:upload_id>', methods=['DELETE'])
def delete_upload(upload_id):
    try:
        db.delete_upload(upload_id)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'success': False, 'error': 'No file part'}), 400
    
    file = request.files['file']
    upload_name = request.form.get('name', '').strip()
    
    if file.filename == '':
        return jsonify({'success': False, 'error': 'No selected file'}), 400
    
    if not allowed_file(file.filename):
        return jsonify({'success': False, 'error': 'Invalid file type. Only .json files are allowed'}), 400
    
    if not upload_name:
        upload_name = os.path.splitext(secure_filename(file.filename))[0]  # Use filename without extension as fallback
    
    try:
        filename = secure_filename(file.filename)
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        
        # Save the uploaded file
        file.save(file_path)
        
        # Process the JSON file
        if process_json_file(file_path, upload_name):
            # Clean up the temporary file
            os.remove(file_path)
            return jsonify({
                'success': True,
                'message': 'File successfully processed and stored in the database'
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Failed to process the file'
            }), 500
            
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/upload/<int:upload_id>/rename', methods=['POST'])
def rename_upload(upload_id):
    try:
        data = request.get_json()
        new_name = data.get('name', '').strip()
        
        if not new_name:
            return jsonify({
                'success': False,
                'error': 'Name cannot be empty'
            }), 400
        
        db.rename_upload(upload_id, new_name)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# Parser API endpoints
@app.route('/api/parsers', methods=['GET'])
def get_parsers():
    """Get all parsers."""
    try:
        parsers = db.get_all_parsers()
        result = []
        for parser in parsers:
            result.append({
                'id': parser[0],
                'name': parser[1],
                'code': parser[2],
                'created_at': parser[3],
                'updated_at': parser[4]
            })
        return jsonify(result)
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/parsers/<int:parser_id>', methods=['GET'])
def get_parser(parser_id):
    """Get a specific parser by ID."""
    try:
        parser = db.get_parser(parser_id)
        if parser:
            return jsonify({
                'id': parser[0],
                'name': parser[1],
                'code': parser[2],
                'created_at': parser[3],
                'updated_at': parser[4]
            })
        else:
            return jsonify({'success': False, 'error': 'Parser not found'}), 404
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/parsers', methods=['POST'])
def create_parser():
    """Create a new parser."""
    try:
        data = request.json
        if not data or 'name' not in data or 'code' not in data:
            return jsonify({'success': False, 'error': 'Missing required fields (name, code)'}), 400
        
        # Check if parser with this name already exists
        existing = db.get_parser_by_name(data['name'])
        if existing:
            return jsonify({'success': False, 'error': 'Parser with this name already exists'}), 409
        
        parser_id = db.create_parser(data['name'], data['code'])
        if parser_id:
            return jsonify({'success': True, 'id': parser_id})
        else:
            return jsonify({'success': False, 'error': 'Failed to create parser'}), 500
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/parsers/<int:parser_id>', methods=['PUT'])
def update_parser(parser_id):
    """Update an existing parser."""
    try:
        data = request.json
        if not data or 'name' not in data or 'code' not in data:
            return jsonify({'success': False, 'error': 'Missing required fields (name, code)'}), 400
        
        # Check if the parser exists
        parser = db.get_parser(parser_id)
        if not parser:
            return jsonify({'success': False, 'error': 'Parser not found'}), 404
        
        # If name is changing, check if the new name conflicts with an existing parser
        if parser[1] != data['name']:
            existing = db.get_parser_by_name(data['name'])
            if existing and existing[0] != parser_id:
                return jsonify({'success': False, 'error': 'Parser with this name already exists'}), 409
        
        success = db.update_parser(parser_id, data['name'], data['code'])
        if success:
            return jsonify({'success': True})
        else:
            return jsonify({'success': False, 'error': 'Failed to update parser'}), 500
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/parsers/<int:parser_id>', methods=['DELETE'])
def delete_parser(parser_id):
    """Delete a parser."""
    try:
        # Check if the parser exists
        parser = db.get_parser(parser_id)
        if not parser:
            return jsonify({'success': False, 'error': 'Parser not found'}), 404
        
        success = db.delete_parser(parser_id)
        if success:
            return jsonify({'success': True})
        else:
            return jsonify({'success': False, 'error': 'Failed to delete parser'}), 500
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

def main():
    """Entry point for the trace viewer application."""
    import webbrowser
    import threading
    import argparse
    
    parser = argparse.ArgumentParser(description='TT-NN Trace Viewer')
    parser.add_argument('--no-browser', action='store_true', help='Do not open browser automatically')
    args = parser.parse_args()
    
    host = '127.0.0.1'
    port = 5000
    url = f'http://{host}:{port}'
    
    if not args.no_browser:
        # Open browser after a short delay to ensure Flask has started
        threading.Timer(1.0, lambda: webbrowser.open(url)).start()
        print(f"Opening browser at {url} (use --no-browser to disable)")
    else:
        print(f"Trace viewer running at {url}")
        
    app.run(debug=True, host=host, port=port)

if __name__ == '__main__':
    main() 