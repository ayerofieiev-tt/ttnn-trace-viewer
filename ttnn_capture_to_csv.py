import json
import csv
import re
import os
from typing import Dict, Any, Callable, List, Tuple, Optional

# Registry for transformer functions
TRANSFORMERS: Dict[str, Callable[[Any], str]] = {}

def register_transformer(data_type: str):
    """
    Decorator to register a transformer function for a specific data type.
    
    Usage:
    @register_transformer("Tensor")
    def transform_tensor(data):
        ...
    """
    def decorator(func):
        TRANSFORMERS[data_type] = func
        return func
    return decorator

@register_transformer("Tensor")
def transform_tensor(tensor_data: Dict[str, Any]) -> str:
    """Transform a Tensor object to a simplified string representation."""
    try:
        tensor_spec = tensor_data['tensor_spec']
        
        # Extract shape dimensions
        shape = tensor_spec.get('logical_shape', [])
        shape_dims = 'x'.join(str(dim) for dim in shape)
        
        # Extract dtype
        dtype = "unknown"
        tensor_layout = tensor_spec.get('tensor_layout', {})
        if tensor_layout and 'dtype' in tensor_layout:
            dtype = tensor_layout['dtype']
            # Remove "DataType::" prefix if present
            dtype = re.sub(r'^DataType::', '', dtype)
        
        # Extract memory layout
        memory_layout = "unknown"
        if tensor_layout and 'memory_config' in tensor_layout:
            memory_config = tensor_layout['memory_config']
            if 'memory_layout' in memory_config:
                memory_layout = memory_config['memory_layout']
                # Remove "TensorMemoryLayout::" prefix if present
                memory_layout = re.sub(r'^TensorMemoryLayout::', '', memory_layout)
        
        # Get additional details if available
        buffer_type = "unknown"
        if tensor_layout and 'memory_config' in tensor_layout:
            memory_config = tensor_layout['memory_config']
            if 'buffer_type' in memory_config:
                buffer_type = memory_config['buffer_type']
                buffer_type = re.sub(r'^BufferType::', '', buffer_type)
        
        # Format as "Tensor[dims|dtype|layout|buffer]"
        return f"Tensor[{shape_dims}|{dtype}|{memory_layout}|{buffer_type}]"
    except Exception as e:
        return f"Error parsing tensor: {str(e)}"

@register_transformer("MemoryConfig")
def transform_memory_config(memory_config: Dict[str, Any]) -> str:
    """Transform a MemoryConfig object to a simplified string representation."""
    try:
        memory_layout = memory_config.get('memory_layout', 'unknown')
        memory_layout = re.sub(r'^TensorMemoryLayout::', '', memory_layout)
        buffer_type = memory_config.get('buffer_type', 'unknown')
        buffer_type = re.sub(r'^BufferType::', '', buffer_type)
        return f"MemoryConfig({memory_layout}|{buffer_type})"
    except Exception as e:
        return f"Error parsing memory config: {str(e)}"

def process_arg_value(arg_value: Any) -> str:
    """
    Process an argument value based on its type.
    Uses registered transformers when available.
    """
    # Handle null character (both string representation and actual null char)
    if arg_value == "\\u0000" or arg_value == "\0" or arg_value == "\u0000":
        return "0"
    
    # Handle all unsupported type patterns
    if isinstance(arg_value, str) and "[ unsupported type" in arg_value:
        return extract_unsupported_type(arg_value)
    
    if isinstance(arg_value, dict):
        # Check if we have a registered transformer for any of the keys
        for key, value in arg_value.items():
            if key in TRANSFORMERS:
                return TRANSFORMERS[key](value)
        
        # If no transformer matches, return string representation
        return str(arg_value)
    else:
        # Handle strings and other primitive types
        return str(arg_value)

def extract_arg_info(arg: Dict[str, Any]) -> Tuple[str, Any]:
    """Extract argument key and value from an argument dictionary."""
    if not arg:
        return "", ""
    
    # Get first key (usually arg0, arg1, etc.)
    arg_key = list(arg.keys())[0]
    arg_value = arg.get(arg_key, "")
    
    return arg_key, arg_value

def group_operations_by_name(data: Dict[str, Any]) -> Dict[str, List[Dict[str, Any]]]:
    """Group operations by operation name."""
    grouped_operations = {}
    
    for item in data.get('content', []):
        operation_name = item.get('operation', 'unknown')
        if operation_name not in grouped_operations:
            grouped_operations[operation_name] = []
        
        grouped_operations[operation_name].append(item)
    
    return grouped_operations

def write_csv_file(operations: List[Dict[str, Any]], output_file: str, remove_duplicates: bool = False) -> None:
    """Write operations to a CSV file.
    
    Args:
        operations: List of operations to write
        output_file: Path to the output CSV file
        remove_duplicates: If True, removes duplicate lines from the output
    """
    # First determine the maximum number of arguments in any operation
    max_args = 0
    for item in operations:
        arg_count = len(item.get('arguments', []))
        max_args = max(max_args, arg_count)
    
    # Create header: operation-name;arg0;arg1;...
    header = ['operation'] + [f'arg{i}' for i in range(max_args)]
    
    # Store rows for deduplication if needed
    rows = []
    seen_rows = set()
    
    # Process each operation
    for item in operations:
        operation_name = item.get('operation', 'unknown')
        arguments = item.get('arguments', [])
        
        # Process each argument
        row = [operation_name]
        for i in range(max_args):
            if i < len(arguments):
                arg = arguments[i]
                _, arg_value = extract_arg_info(arg)
                
                # Process the value based on its type
                processed_value = process_arg_value(arg_value)
                row.append(processed_value)
            else:
                # If we don't have this argument, add an empty cell
                row.append('')
        
        # Convert row to tuple for hashability
        row_tuple = tuple(row)
        
        # Add row if we're not removing duplicates or if it's a new unique row
        if not remove_duplicates or row_tuple not in seen_rows:
            rows.append(row)
            seen_rows.add(row_tuple)
    
    # Write to CSV
    with open(output_file, 'w', newline='') as csvfile:
        writer = csv.writer(csvfile, delimiter=';')
        writer.writerow(header)
        writer.writerows(rows)

def json_to_csv(input_file: str, output_file: str, group_by_operation: bool = False, remove_duplicates: bool = False) -> None:
    """
    Convert the JSON file to CSV format.
    
    Args:
        input_file: Path to the input JSON file
        output_file: Path to the output CSV file (or directory if group_by_operation is True)
        group_by_operation: If True, group operations by name and create separate files
        remove_duplicates: If True, removes duplicate lines from the output
    """
    # Read JSON data
    with open(input_file, 'r') as f:
        data = json.load(f)
    
    if group_by_operation:
        # Create output directory if it doesn't exist
        output_dir = output_file.rstrip('/\\')
        os.makedirs(output_dir, exist_ok=True)
        
        # Group operations by name
        grouped_operations = group_operations_by_name(data)
        
        # Write each group to a separate file
        for operation_name, operations in grouped_operations.items():
            # Sanitize filename by replacing invalid characters
            safe_name = re.sub(r'[<>:"/\\|?*]', '_', operation_name)
            group_file = os.path.join(output_dir, f"{safe_name}.csv")
            
            print(f"Writing {len(operations)} operations to {group_file}")
            write_csv_file(operations, group_file, remove_duplicates)
    else:
        # Write all operations to a single file
        all_operations = data.get('content', [])
        write_csv_file(all_operations, output_file, remove_duplicates)

def simplify_cpp_type(type_str: str) -> str:
    """
    Simplify complex C++ type patterns into more readable forms.
    Examples:
    - std::__1::reference_wrapper<std::__1::optional<tt::tt_metal::DataType const> const> -> std::optional<tt::tt_metal::DataType>
    - std::__1::reference_wrapper<std::__1::optional<TYPE const> const> -> std::optional<TYPE>
    - std::__1::vector<T, std::__1::allocator<T>> -> std::vector<T>
    - std::__1::basic_string<char, std::__1::char_traits<char>> -> std::string
    - std::optional<basic_string<char, char_traits<char>, allocator<char>>> -> std::optional<std::string>
    """
    
    # Remove std::__1:: namespace
    simplified = re.sub(r'std::__1::', '', type_str)
    
    # Handle basic_string pattern (with or without std:: prefix)
    simplified = re.sub(r'(?:std::)?basic_string\s*<\s*char\s*,\s*(?:std::)?char_traits\s*<\s*char\s*>(?:\s*,\s*(?:std::)?allocator\s*<\s*char\s*>)?\s*>', r'std::string', simplified)
    
    # Remove reference_wrapper
    simplified = re.sub(r'reference_wrapper<(.+)>', r'\1', simplified)
    
    # Handle optional pattern (ensuring single std:: prefix)
    simplified = re.sub(r'(?:std::)?optional<(.+?)\s*const>\s*const', r'std::optional<\1>', simplified)
    simplified = re.sub(r'(?:std::)?optional<(.+?)>', r'std::optional<\1>', simplified)
    
    # Handle vector with allocator pattern (keeping std:: prefix)
    simplified = re.sub(r'vector<([^,]+),\s*std::allocator<[^>]+>>', r'std::vector<\1>', simplified)
    
    # Remove remaining const qualifiers
    simplified = re.sub(r'\s+const', '', simplified)
    
    return simplified

def extract_unsupported_type(value_str: str) -> str:
    """
    Extract meaningful type information from unsupported type strings.
    
    Handles various formats:
    - [ unsupported type , std::__1::reference_wrapper<tt::tt_metal::IDevice*>]
    - [ unsupported type , some_other_pattern]
    """
    # Extract the type information between the comma and closing bracket
    comma_match = re.search(r'\[ unsupported type ,\s*([^\]]+)\]', value_str)
    if comma_match:
        extracted = comma_match.group(1).strip()
        # Simplify the C++ type pattern
        simplified = simplify_cpp_type(extracted)
        return simplified
    
    # Default: return original string if no patterns match
    return value_str

def register_custom_transformers():
    """
    Register additional custom transformers here.
    This function can be extended by users without modifying the core code.
    
    Example:
    @register_transformer("CustomType")
    def transform_custom_type(data):
        return f"Custom: {data}"
    """
    # Add your custom transformers here
    pass

def print_usage():
    """Print usage information."""
    print("Usage:")
    print("  python script.py input.json output.csv [--group] [--no-duplicates]")
    print("")
    print("Arguments:")
    print("  input.json      - Input JSON file")
    print("  output.csv      - Output CSV file or directory (if --group is specified)")
    print("  --group         - Group operations by name and create separate files")
    print("  --no-duplicates - Remove duplicate lines from output")

if __name__ == "__main__":
    import sys
    
    # Register any custom transformers
    register_custom_transformers()
    
    # Parse command line arguments
    if len(sys.argv) < 3:
        print_usage()
        sys.exit(1)
    
    input_file = sys.argv[1]
    output_file = sys.argv[2]
    group_by_operation = False
    remove_duplicates = False
    
    # Check for flags
    for arg in sys.argv[3:]:
        if arg == "--group":
            group_by_operation = True
        elif arg == "--no-duplicates":
            remove_duplicates = True
    
    print(f"Converting {input_file} to {output_file}"
          f"{' (grouped by operation)' if group_by_operation else ''}"
          f"{' (removing duplicates)' if remove_duplicates else ''}...")
    json_to_csv(input_file, output_file, group_by_operation, remove_duplicates)
    print("Conversion complete!")