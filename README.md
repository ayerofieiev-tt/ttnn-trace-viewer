# TT-NN Capture Viewer

A comprehensive tool dedicated to processing output of TT-NN Graph Tracing. With this tool, you can quickly process what operations are called, with what arguments, and can easily filter through data from single or multiple runs.

## Features

- **Trace Capture and Storage**: Store and organize trace data in a SQLite database
- **Web-based Viewer**: Browse and analyze trace data through an intuitive web interface
- **Export Capabilities**: Export trace data to CSV and Google Sheets
- **Flexible Data Processing**: Filter, sort, and analyze operation data efficiently
- **Custom Parsers**: Create and save custom parsers for your specific analysis needs
- **Automatic Browser Launch**: Viewer automatically opens in your default browser
- **Smart JSON Processing**: Automatically detects and processes both raw and pre-processed JSON formats

## Installation

### Basic Installation

Install directly from the source:

```bash
pip install .
```

### Installation from GitHub Release

You can also install the latest release directly from GitHub:

```bash
pip install https://github.com/ayerofieiev-tt/ttnn-trace-viewer/releases/download/latest/ttnn_trace_viewer-0.1.0-py3-none-any.whl
```

### Development Installation

For development work with editable mode:

```bash
pip install -e .
```

## Quick Start

After installation, several command-line tools become available:

1. **Launch the viewer web interface**:
   ```bash
   ttnn-trace-viewer
   ```
   This will start a Flask web server accessible at http://localhost:5000 and automatically open it in your default browser.
   
   To start without automatically opening a browser:
   ```bash
   ttnn-trace-viewer --no-browser
   ```

2. **Store trace data in the database**:
   ```bash
   # From a JSON file:
   ttnn-store your_trace_file.json "My Trace Run"
   
   # From a directory containing CSV files:
   ttnn-store your_csv_directory "My CSV Data"
   ```

3. **Convert trace data to CSV**:
   ```bash
   ttnn-to-csv input_directory output_file.csv
   ```

4. **Upload trace data to Google Sheets**:
   ```bash
   ttnn-to-sheets directory "My Spreadsheet Title"
   ```

## Development Environment Setup

To set up a development environment:

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd ttnn_capture
   ```

2. Create and activate a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. Install dependencies in development mode:
   ```bash
   pip install -e .
   ```

4. Run the viewer during development:
   ```bash
   python trace_viewer.py
   ```

## Workflow Examples

### Processing a TT-NN Trace File

1. Capture a trace file from your TT-NN application (typically a JSON file)
2. Store it in the database:
   ```bash
   ttnn-store your_trace.json "My Application Run"
   ```
3. Launch the viewer to explore the data:
   ```bash
   ttnn-trace-viewer
   ```
4. Use the web interface to filter operations, analyze arguments, and explore trace data

### Comparing Multiple Runs

1. Store multiple trace files with descriptive names:
   ```bash
   ttnn-store trace1.json "Run with optimization A"
   ttnn-store trace2.json "Run with optimization B"
   ```
2. Use the viewer to switch between uploads and compare results
3. Create custom parsers in the viewer to extract specific metrics

## Google Sheets Integration

To use the Google Sheets integration:

1. Set up Google Sheets API:
   - Go to the [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select an existing one
   - Enable the Google Sheets API for your project
   - Create OAuth 2.0 Client ID credentials
   - Download the client configuration file
   - Rename it to `credentials.json` and place it in your working directory

2. Upload data to Google Sheets:
   ```bash
   ttnn-to-sheets your_data_directory "Performance Analysis"
   ```

The first time you run this, it will open a browser for authentication. Your credentials will be saved in `token.pickle` for future use.

## Notes

- Data is stored in a SQLite database (`traces.db`) by default
- The web viewer provides both upload-based and consolidated views of your trace data
- Custom parsers allow for advanced analysis directly in the viewer

## JSON Format Support

The tool now supports two different JSON formats:

### 1. Raw JSON Format

This format contains the raw graph structure with connections and arguments:

```json
[
    {
        "arguments": [...],
        "connections": [...],
        "params": {
            "name": "operation_name",
            ...
        }
    },
    ...
]
```

When uploading a file in this format, it will be automatically processed using `GraphTracerUtils.serialize_graph()` before converting to CSV.

### 2. Processed JSON Format

This format has already been processed and contains a "content" key with a list of operations:

```json
{
    "content": [
        {
            "operation": "operation_name",
            "arguments": [...]
        },
        ...
    ]
}
```

Files in this format will be directly converted to CSV without additional processing.

## Command Line Tools

### JSON Processor Tool

You can use the JSON processor directly from the command line:

```bash
python json_processor.py input.json [output_file] [--csv] [--group] [--no-duplicates]
```

Arguments:
- `input.json` - Input JSON file (raw or processed format)
- `output_file` - Optional output file path
- `--csv` - Output in CSV format instead of JSON
- `--group` - Group operations by name (CSV only)
- `--no-duplicates` - Remove duplicate entries (CSV only) 