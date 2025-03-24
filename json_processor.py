#!/usr/bin/env python3
import json
import sys
import os
import tempfile
from raw_trace_to_op_trace import GraphTracerUtils
from ttnn_capture_to_csv import json_to_csv

def is_raw_json(data):
    """
    Determine if a loaded JSON structure is a raw graph format that needs processing.
    
    Args:
        data: Loaded JSON data
    
    Returns:
        bool: True if the JSON is in raw format, False if already processed
    """
    # Raw JSON has a list of nodes with "arguments" and "connections" keys
    if isinstance(data, list) and len(data) > 0:
        first_item = data[0]
        if isinstance(first_item, dict) and "arguments" in first_item and "connections" in first_item:
            return True
    
    # Processed JSON has a "content" key with a list of operations
    if isinstance(data, dict) and "content" in data and isinstance(data["content"], list):
        return False
    
    # If format is unknown, check deeper for raw format clues
    if isinstance(data, list) and len(data) > 0:
        for item in data:
            if isinstance(item, dict) and "params" in item and "arguments" in item:
                return True
    
    # Default to assuming it needs processing
    return True

def process_json(input_file, output_file=None, is_csv=False, group_by=False, no_duplicates=False):
    """
    Universal processor for both raw and processed JSON files.
    
    Args:
        input_file: Path to input JSON file
        output_file: Path to output file (can be JSON or CSV)
        is_csv: If True, output should be CSV format
        group_by: Group operations by name (CSV only)
        no_duplicates: Remove duplicate entries (CSV only)
        
    Returns:
        The path to the processed output file or output directory if group_by is True
    """
    # Read and load the JSON
    print(f"Reading input file: {input_file}")
    with open(input_file, 'r') as f:
        data = json.load(f)
    
    # Determine JSON format and process if needed
    if is_raw_json(data):
        print("Detected raw JSON format, processing with GraphTracerUtils.serialize_graph")
        processed_data = GraphTracerUtils.serialize_graph(data)
    else:
        print("Detected already processed JSON format, using as is")
        processed_data = data
    
    # Determine output path
    if not output_file:
        base_name = os.path.splitext(input_file)[0]
        if is_csv:
            if group_by:
                # For group_by, create a directory
                output_file = f"{base_name}_processed"
                os.makedirs(output_file, exist_ok=True)
            else:
                output_file = f"{base_name}_processed.csv"
        else:
            output_file = f"{base_name}_processed.json"
    else:
        # If we're grouping and the output path is not a directory, make it a directory
        if is_csv and group_by and not os.path.isdir(output_file):
            # Check if the path has an extension - if so, remove it
            base, ext = os.path.splitext(output_file)
            if ext:
                output_file = base
            os.makedirs(output_file, exist_ok=True)
    
    # If CSV output is requested
    if is_csv:
        # Create a temporary JSON file with the processed data
        temp_fd, temp_json = tempfile.mkstemp(suffix='.json')
        with os.fdopen(temp_fd, 'w') as f:
            json.dump(processed_data, f)
        
        try:
            # Convert to CSV using existing function
            print(f"Converting to CSV: {output_file}"
                  f"{' (grouped by operation)' if group_by else ''}"
                  f"{' (removing duplicates)' if no_duplicates else ''}")
            json_to_csv(temp_json, output_file, group_by, no_duplicates)
        finally:
            # Clean up temporary file
            os.unlink(temp_json)
    else:
        # Write processed JSON
        print(f"Writing processed JSON to: {output_file}")
        with open(output_file, 'w') as f:
            json.dump(processed_data, f, indent=4)
    
    print("Processing complete!")
    return output_file

def print_usage():
    """Print usage information."""
    print("Usage:")
    print("  python json_processor.py input.json [output_file] [--csv] [--group] [--no-duplicates]")
    print("")
    print("Arguments:")
    print("  input.json      - Input JSON file (raw or processed format)")
    print("  output_file     - Optional output file path")
    print("  --csv           - Output in CSV format instead of JSON")
    print("  --group         - Group operations by name (CSV only)")
    print("  --no-duplicates - Remove duplicate entries (CSV only)")
    print("")
    print("Example:")
    print("  python json_processor.py input.json output.csv --csv --group")

if __name__ == "__main__":
    # Check for help flag first
    if len(sys.argv) > 1 and sys.argv[1] in ["--help", "-h", "help"]:
        print_usage()
        sys.exit(0)
    
    if len(sys.argv) < 2:
        print_usage()
        sys.exit(1)
    
    input_file = sys.argv[1]
    
    if not os.path.exists(input_file):
        print(f"Error: Input file {input_file} does not exist")
        sys.exit(1)
    
    # Parse optional arguments
    output_file = None
    is_csv = False
    group_by = False
    no_duplicates = False
    
    for i, arg in enumerate(sys.argv[2:], 2):
        if arg.startswith('--'):
            if arg == '--csv':
                is_csv = True
            elif arg == '--group':
                group_by = True
            elif arg == '--no-duplicates':
                no_duplicates = True
        elif i == 2:  # First non-flag argument is the output file
            output_file = arg
    
    process_json(input_file, output_file, is_csv, group_by, no_duplicates) 