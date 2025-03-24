from flask import Flask, render_template, jsonify, request, flash, Response
from trace_db import TraceDB
import json
import os
import time
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

# Track active uploads with timestamps
active_uploads = {}

# Clean stale uploads periodically
def clean_stale_uploads():
    """Remove stale uploads from tracking (older than 10 minutes)"""
    current_time = time.time()
    stale_keys = []
    for key, timestamp in active_uploads.items():
        if current_time - timestamp > 600:  # 10 minutes
            stale_keys.append(key)
    
    for key in stale_keys:
        active_uploads.pop(key, None)

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

@app.route('/api/trace/<int:trace_id>/export-filtered-csv', methods=['POST'])
def export_filtered_trace_to_csv(trace_id):
    """Export filtered trace data as CSV file for download."""
    # Get the filter criteria from the request
    filter_data = request.json if request.is_json else {}
    
    # Check if client sent pre-filtered data
    export_data = filter_data.get('exportData')
    
    # If client provides pre-filtered data, use it directly
    if export_data:
        filtered_values = export_data
    else:
        # Otherwise, get all values and filter server-side
        values = db.get_values(trace_id)
        
        if not values:
            return jsonify({"error": "No data found for this trace"}), 404
        
        # Filter values based on filter criteria
        filtered_values = []
        
        # Apply column filters if provided
        column_filters = filter_data.get('columnFilters', {})
        for row in values:
            include_row = True
            for column, filter_value in column_filters.items():
                cell_value = row.get(column, '')
                if filter_value and cell_value and filter_value.lower() not in str(cell_value).lower():
                    include_row = False
                    break
            if include_row:
                filtered_values.append(row)
    
    # Get trace info for filename
    trace_info = db.get_trace_by_id(trace_id)
    if not trace_info:
        filename = f"trace_{trace_id}_filtered.csv"
    else:
        filename = f"{trace_info[1].replace(' ', '_')}_{trace_id}_filtered.csv"
    
    # If filtered values is empty, return an error
    if not filtered_values:
        return jsonify({"error": "No data matches the filter criteria"}), 404
    
    # Get all column names from the first row
    if filtered_values and len(filtered_values) > 0:
        columns = list(filtered_values[0].keys())
        # Remove metadata columns if present
        for meta_col in ['id', '_upload_id', '_upload_name', '_upload_time']:
            if meta_col in columns:
                columns.remove(meta_col)
    else:
        columns = []
    
    # Generate CSV data
    csv_data = []
    csv_data.append(";".join(columns))
    
    for row in filtered_values:
        csv_row = []
        for col in columns:
            # Don't quote values - directly add them to the CSV
            value = str(row.get(col, ""))
            csv_row.append(value)
        csv_data.append(";".join(csv_row))
    
    # Create response with CSV data
    response = Response("\n".join(csv_data), mimetype="text/csv")
    response.headers["Content-Disposition"] = f"attachment; filename={filename}"
    response.headers["Content-Type"] = "text/csv; charset=utf-8; header=present; delimiter=semicolon"
    return response

@app.route('/api/consolidated-trace/<path:filename>/values')
def get_consolidated_trace_values(filename):
    try:
        values = db.get_deduplicated_values_by_filename(filename)
        return jsonify(values)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/consolidated-trace/<path:filename>/export-filtered-csv', methods=['POST'])
def export_filtered_consolidated_trace_to_csv(filename):
    """Export filtered consolidated trace data as CSV file for download."""
    try:
        # Get the filter criteria from the request
        filter_data = request.json if request.is_json else {}
        
        # Check if client sent pre-filtered data
        export_data = filter_data.get('exportData')
        
        # If client provides pre-filtered data, use it directly
        if export_data:
            filtered_values = export_data
        else:
            # Otherwise, get all values and filter server-side
            values = db.get_deduplicated_values_by_filename(filename)
            
            if not values:
                return jsonify({"error": "No data found for this trace"}), 404
            
            # Filter values based on filter criteria
            filtered_values = []
            
            # Apply column filters if provided
            column_filters = filter_data.get('columnFilters', {})
            for row in values:
                include_row = True
                for column, filter_value in column_filters.items():
                    cell_value = row.get(column, '')
                    if filter_value and cell_value and filter_value.lower() not in str(cell_value).lower():
                        include_row = False
                        break
                if include_row:
                    filtered_values.append(row)
        
        # Sanitize filename
        safe_filename = filename.replace(' ', '_').replace('/', '_').replace('\\', '_')
        output_filename = f"{safe_filename}_consolidated_filtered.csv"
        
        # If filtered values is empty, return an error
        if not filtered_values:
            return jsonify({"error": "No data matches the filter criteria"}), 404
        
        # Get all column names from the first row
        if filtered_values and len(filtered_values) > 0:
            columns = list(filtered_values[0].keys())
            # Remove metadata columns if present
            for meta_col in ['id', '_upload_id', '_upload_name', '_upload_time']:
                if meta_col in columns:
                    columns.remove(meta_col)
        else:
            columns = []
        
        # Generate CSV data
        csv_data = []
        csv_data.append(";".join(columns))
        
        for row in filtered_values:
            csv_row = []
            for col in columns:
                # Don't quote values - directly add them to the CSV
                value = str(row.get(col, ""))
                csv_row.append(value)
            csv_data.append(";".join(csv_row))
        
        # Create response with CSV data
        response = Response("\n".join(csv_data), mimetype="text/csv")
        response.headers["Content-Disposition"] = f"attachment; filename={output_filename}"
        response.headers["Content-Type"] = "text/csv; charset=utf-8; header=present; delimiter=semicolon"
        return response
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/upload/<int:upload_id>', methods=['DELETE'])
def delete_upload(upload_id):
    try:
        db.delete_upload(upload_id)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/upload/<int:upload_id>/export-csv', methods=['GET'])
def export_upload_to_csv(upload_id):
    """Export all traces from an upload as a zip of CSV files."""
    try:
        import zipfile
        import io
        
        # Get upload info
        upload = db.get_upload(upload_id)
        if not upload:
            return jsonify({"error": "Upload not found"}), 404
            
        # Get all traces for this upload
        traces = db.get_traces_for_upload(upload_id)
        if not traces or len(traces) == 0:
            return jsonify({"error": "No traces found for this upload"}), 404
            
        # Create in-memory zip file
        memory_file = io.BytesIO()
        with zipfile.ZipFile(memory_file, 'w', zipfile.ZIP_DEFLATED) as zf:
            for trace in traces:
                trace_id, filename, sheet_name, error, row_count = trace
                
                # Skip traces with errors
                if error:
                    continue
                
                # Get columns and values
                columns = db.get_columns(trace_id)
                values = db.get_values(trace_id)
                
                if not values or len(values) == 0:
                    continue
                
                # Generate CSV data
                csv_data = []
                csv_data.append(";".join(columns))
                
                for row in values:
                    csv_row = []
                    for col in columns:
                        # Don't quote values - directly add them to the CSV
                        value = str(row.get(col, ""))
                        csv_row.append(value)
                    csv_data.append(";".join(csv_row))
                
                # Add CSV file to zip
                safe_filename = filename.replace(' ', '_').replace('/', '_').replace('\\', '_')
                # Remove .csv extension if it already exists to avoid double extension
                if safe_filename.lower().endswith('.csv'):
                    safe_filename = safe_filename[:-4]
                zf.writestr(f"{safe_filename}.csv", "\n".join(csv_data))
        
        # Prepare response
        memory_file.seek(0)
        safe_upload_name = upload[1].replace(' ', '_').replace('/', '_').replace('\\', '_')
        
        response = Response(
            memory_file.getvalue(),
            mimetype="application/zip",
            headers={
                "Content-Disposition": f"attachment; filename={safe_upload_name}_traces.zip"
            }
        )
        return response
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/upload/<int:upload_id>/export-to-sheets', methods=['GET'])
def export_upload_to_sheets(upload_id):
    """Export all traces from an upload to Google Sheets."""
    try:
        import tempfile
        import os
        import shutil
        from upload_to_sheets import upload_csv_files
        
        # Get upload info
        upload = db.get_upload(upload_id)
        if not upload:
            return jsonify({"error": "Upload not found"}), 404
            
        # Get all traces for this upload
        traces = db.get_traces_for_upload(upload_id)
        if not traces or len(traces) == 0:
            return jsonify({"error": "No traces found for this upload"}), 404
            
        # Create a temporary directory to store CSV files
        temp_dir = tempfile.mkdtemp()
        spreadsheet_url = ""
        
        try:
            # Generate CSV files for each trace
            for trace in traces:
                trace_id, filename, sheet_name, error, row_count = trace
                
                # Skip traces with errors
                if error:
                    continue
                
                # Get columns and values
                columns = db.get_columns(trace_id)
                values = db.get_values(trace_id)
                
                if not values or len(values) == 0:
                    continue
                
                # Generate CSV data
                csv_data = []
                csv_data.append(";".join(columns))
                
                for row in values:
                    csv_row = []
                    for col in columns:
                        # Don't quote values - directly add them to the CSV
                        value = str(row.get(col, ""))
                        csv_row.append(value)
                    csv_data.append(";".join(csv_row))
                
                # Create CSV file in temp directory
                safe_filename = filename.replace(' ', '_').replace('/', '_').replace('\\', '_')
                # Remove .csv extension if it already exists to avoid double extension
                if safe_filename.lower().endswith('.csv'):
                    safe_filename = safe_filename[:-4]
                    
                csv_path = os.path.join(temp_dir, f"{safe_filename}.csv")
                with open(csv_path, 'w', encoding='utf-8') as f:
                    f.write("\n".join(csv_data))
            
            # Upload all CSV files to Google Sheets
            safe_upload_name = upload[1].replace(' ', '_').replace('/', '_').replace('\\', '_')
            spreadsheet_title = f"{safe_upload_name}_traces"
            
            # Get spreadsheet URL from the upload function
            result = upload_csv_files(temp_dir, spreadsheet_title)
            spreadsheet_url = f"https://docs.google.com/spreadsheets/d/{result}" if result else ""
            
            return jsonify({
                "success": True, 
                "message": "Traces exported to Google Sheets successfully", 
                "spreadsheet_url": spreadsheet_url
            })
            
        finally:
            # Clean up temporary directory
            shutil.rmtree(temp_dir)
            
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/uploads/status', methods=['GET'])
def get_upload_status():
    """Check if there are any active uploads."""
    # Clean stale uploads first
    clean_stale_uploads()
    
    # Get client IP for more accurate tracking
    client_ip = request.remote_addr
    
    # Check if this client has any active uploads
    client_uploads = []
    for key in list(active_uploads.keys()):
        if key.startswith(f"{client_ip}_"):
            client_uploads.append(key.split('_', 1)[1])
    
    # Build response
    response = {
        'uploading': bool(active_uploads) and bool(client_uploads),
        'uploads': client_uploads,
        'server_time': time.time()
    }
    
    # Ensure proper cache headers
    resp = jsonify(response)
    resp.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    resp.headers['Pragma'] = 'no-cache'
    resp.headers['Expires'] = '0'
    return resp

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
        
        # Track this upload with client IP for more accurate tracking
        client_ip = request.remote_addr
        upload_id = f"{client_ip}_{upload_name}_{filename}"
        active_uploads[upload_id] = time.time()
        
        # Save the uploaded file
        file.save(file_path)
        
        # Process the JSON file
        if process_json_file(file_path, upload_name):
            # Clean up the temporary file
            os.remove(file_path)
            # Remove from active uploads
            active_uploads.pop(upload_id, None)
            return jsonify({
                'success': True,
                'message': 'File successfully processed and stored in the database'
            })
        else:
            # Remove from active uploads
            active_uploads.pop(upload_id, None)
            return jsonify({
                'success': False,
                'error': 'Failed to process the file'
            }), 500
            
    except Exception as e:
        # Remove from active uploads if there was an error
        upload_id = f"{client_ip}_{upload_name}_{filename}" if 'filename' in locals() else f"{client_ip}_{upload_name}_error"
        active_uploads.pop(upload_id, None)
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

@app.route('/api/debug/active-uploads', methods=['GET'])
def debug_active_uploads():
    """Debug endpoint to view active uploads."""
    clean_stale_uploads()
    client_ip = request.remote_addr
    
    return jsonify({
        'active_uploads': active_uploads,
        'client_ip': client_ip,
        'all_active_count': len(active_uploads),
        'client_active_uploads': {k: v for k, v in active_uploads.items() if k.startswith(f"{client_ip}_")},
        'server_time': time.time(),
        'server_time_human': time.strftime('%Y-%m-%d %H:%M:%S', time.localtime())
    })

def main():
    """Entry point for the trace viewer application."""
    import webbrowser
    import threading
    import argparse
    import os
    
    parser = argparse.ArgumentParser(description='TT-NN Trace Viewer')
    parser.add_argument('--no-browser', action='store_true', help='Do not open browser automatically')
    args = parser.parse_args()
    
    host = '127.0.0.1'
    port = 5000
    url = f'http://{host}:{port}'
    
    # Check if this is the initial run or a reload
    # WERKZEUG_RUN_MAIN environment variable is set when Flask's reloader
    # restarts the app, so we only open the browser on the initial run
    is_reload = os.environ.get('WERKZEUG_RUN_MAIN') == 'true'
    
    if not args.no_browser and not is_reload:
        # Open browser after a short delay to ensure Flask has started
        threading.Timer(1.0, lambda: webbrowser.open(url)).start()
        print(f"Opening browser at {url} (use --no-browser to disable)")
    else:
        print(f"Trace viewer running at {url}")
        
    app.run(debug=True, host=host, port=port)

if __name__ == '__main__':
    main() 