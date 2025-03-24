#!/usr/bin/env python3
import os
import tempfile
from json_processor import process_json, is_raw_json
import json

class UploadHandler:
    """
    Handler for processing uploaded JSON files.
    This class can be integrated with web frameworks like Flask, Django, etc.
    """
    
    @staticmethod
    def handle_upload(uploaded_file, output_format='json', group_by=False, no_duplicates=False):
        """
        Process an uploaded JSON file.
        
        Args:
            uploaded_file: The uploaded file object or path
            output_format: 'json' or 'csv'
            group_by: Group operations by name (CSV only)
            no_duplicates: Remove duplicate entries (CSV only)
            
        Returns:
            dict: Result info with processed file path and metadata
        """
        # Determine if we're dealing with a file path or file-like object
        if isinstance(uploaded_file, str):
            input_path = uploaded_file
        else:
            # Save uploaded file to a temporary location
            temp_fd, input_path = tempfile.mkstemp(suffix='.json')
            try:
                with os.fdopen(temp_fd, 'wb') as f:
                    # Handle both string content and binary content
                    if hasattr(uploaded_file, 'read'):
                        f.write(uploaded_file.read())
                    else:
                        f.write(uploaded_file)
            except Exception as e:
                os.unlink(input_path)
                return {"success": False, "error": f"Failed to save uploaded file: {str(e)}"}
        
        try:
            # Determine file format
            with open(input_path, 'r') as f:
                try:
                    data = json.load(f)
                    raw_format = is_raw_json(data)
                except json.JSONDecodeError as e:
                    return {"success": False, "error": f"Invalid JSON format: {str(e)}"}
            
            # Process based on format
            is_csv = (output_format.lower() == 'csv')
            
            # Generate output path
            base_name = os.path.splitext(os.path.basename(input_path))[0]
            if is_csv:
                output_dir = tempfile.mkdtemp()
                output_path = os.path.join(output_dir, f"{base_name}_processed.csv")
            else:
                temp_fd, output_path = tempfile.mkstemp(suffix='.json')
                os.close(temp_fd)
            
            # Process the JSON file
            processed_path = process_json(
                input_path, 
                output_path, 
                is_csv, 
                group_by, 
                no_duplicates
            )
            
            return {
                "success": True,
                "file_path": processed_path,
                "original_format": "raw" if raw_format else "processed",
                "output_format": output_format,
                "group_by": group_by,
                "no_duplicates": no_duplicates
            }
        
        except Exception as e:
            return {"success": False, "error": f"Processing error: {str(e)}"}
        
        finally:
            # Clean up temporary input file if we created one
            if not isinstance(uploaded_file, str) and os.path.exists(input_path):
                os.unlink(input_path)


# Example usage with Flask
"""
from flask import Flask, request, jsonify, send_file
app = Flask(__name__)

@app.route('/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400
    
    # Get parameters
    output_format = request.form.get('format', 'json')
    group_by = request.form.get('group_by', 'false').lower() == 'true'
    no_duplicates = request.form.get('no_duplicates', 'false').lower() == 'true'
    
    # Process the file
    result = UploadHandler.handle_upload(file, output_format, group_by, no_duplicates)
    
    if not result["success"]:
        return jsonify({"error": result["error"]}), 400
    
    # Return the processed file
    return send_file(
        result["file_path"],
        as_attachment=True,
        download_name=os.path.basename(result["file_path"])
    )

if __name__ == '__main__':
    app.run(debug=True)
""" 