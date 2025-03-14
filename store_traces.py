import os
import csv
import argparse
import tempfile
from trace_db import TraceDB
from ttnn_capture_to_csv import json_to_csv

def read_csv_file(file_path):
    """Read CSV file with semicolon delimiter."""
    with open(file_path, 'r', encoding='utf-8') as f:
        reader = csv.reader(f, delimiter=';')
        headers = next(reader)  # Get column names
        data = list(reader)     # Get all rows
    return headers, data

def process_json_file(json_file, upload_name):
    """
    Process a JSON file by converting it to CSVs and storing them in the database.
    Returns True if successful, False otherwise.
    """
    try:
        # Create a temporary directory for CSV files
        with tempfile.TemporaryDirectory() as temp_dir:
            # Convert JSON to CSV files (grouped by operation)
            json_to_csv(json_file, temp_dir, group_by_operation=True, remove_duplicates=True)
            
            # Store the generated CSV files
            store_csv_files(temp_dir, upload_name)
            return True
    except Exception as e:
        print(f"Error processing JSON file: {str(e)}")
        return False

def store_csv_files(directory_path, upload_name):
    """
    Read all CSV files from the specified directory and store them in the database.
    Each CSV file becomes a separate trace entry.
    """
    # Verify directory exists
    if not os.path.isdir(directory_path):
        raise ValueError(f"Directory not found: {directory_path}")

    # Initialize database
    db = TraceDB()

    # Create new upload
    upload_id = db.create_upload(upload_name)
    print(f"Created upload: {upload_name}")

    # Get list of CSV files
    csv_files = [f for f in os.listdir(directory_path) if f.endswith('.csv')]
    
    if not csv_files:
        print("No CSV files found in the specified directory.")
        return

    # Process each CSV file
    for csv_file in csv_files:
        try:
            file_path = os.path.join(directory_path, csv_file)
            sheet_name = os.path.splitext(csv_file)[0]  # Use filename without extension as sheet name
            
            print(f"Processing {csv_file}...")
            
            # Read CSV file with semicolon delimiter
            headers, data = read_csv_file(file_path)
            
            # Create a simple DataFrame-like structure
            class SimpleDF:
                def __init__(self, headers, data):
                    self.columns = headers
                    self.values = data
                    self._index = range(len(data))
                
                def iterrows(self):
                    for i, row in enumerate(self.values):
                        yield i, row
                
                def __len__(self):
                    return len(self.values)

            df = SimpleDF(headers, data)
            
            # Store in database
            db.add_trace(upload_id, csv_file, sheet_name, df)
            
            print(f"Successfully stored {csv_file}")
            
        except Exception as e:
            error_msg = str(e)
            print(f"Error processing {csv_file}: {error_msg}")
            # Store the error in the database
            try:
                # Create an empty DataFrame-like structure with the same headers
                empty_df = SimpleDF(headers if 'headers' in locals() else [], [])
                db.add_trace(upload_id, csv_file, sheet_name, empty_df, error=error_msg)
            except:
                print(f"Could not store error information for {csv_file}")

def main():
    parser = argparse.ArgumentParser(description='Store trace data in the database')
    parser.add_argument('input', help='Input file (.json) or directory containing CSV files')
    parser.add_argument('name', help='Name for this upload group')
    
    args = parser.parse_args()
    
    # Check if input is a JSON file
    if os.path.isfile(args.input) and args.input.lower().endswith('.json'):
        print(f"Processing JSON file: {args.input}")
        if process_json_file(args.input, args.name):
            print("\nJSON file has been processed and stored in the database.")
            print("You can now use ttnn-viewer to view the data.")
    else:
        # Treat as directory with CSV files
        store_csv_files(args.input, args.name)
        print("\nAll files have been processed. You can now use ttnn-viewer to view the data.")

if __name__ == '__main__':
    main() 