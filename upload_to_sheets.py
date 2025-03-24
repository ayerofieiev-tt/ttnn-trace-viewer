import os
import pandas as pd
import numpy as np
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
import pickle
import argparse
import time
from random import uniform

# If modifying these scopes, delete the file token.pickle.
SCOPES = ['https://www.googleapis.com/auth/spreadsheets']

# Rate limiting constants
WRITES_PER_MINUTE_LIMIT = 60
MIN_DELAY_BETWEEN_WRITES = 60.0 / WRITES_PER_MINUTE_LIMIT  # Minimum seconds between writes

def sanitize_value(val):
    """Sanitize a value for Google Sheets API."""
    if pd.isna(val) or (isinstance(val, float) and np.isnan(val)):
        return ""
    if isinstance(val, (float, np.float64, np.float32)):
        if val.is_integer():
            return int(val)
    return str(val)

def sanitize_values(values):
    """Sanitize a list of values for Google Sheets API."""
    return [[sanitize_value(val) for val in row] for row in values]

def retry_with_backoff(func, max_retries=5, initial_delay=5):
    """
    Retry a function with exponential backoff on HttpError 429.
    
    Args:
        func: Function to retry
        max_retries: Maximum number of retry attempts
        initial_delay: Initial delay in seconds
    """
    retries = 0
    delay = initial_delay

    while retries < max_retries:
        try:
            return func()
        except HttpError as e:
            if e.resp.status == 429:  # Too Many Requests
                if retries == max_retries - 1:
                    raise  # Last attempt failed
                
                # Add some random jitter to avoid thundering herd
                jitter = uniform(0, 0.1 * delay)
                sleep_time = max(delay + jitter, MIN_DELAY_BETWEEN_WRITES)
                print(f"Rate limit hit. Waiting {sleep_time:.2f} seconds before retrying...")
                time.sleep(sleep_time)
                
                retries += 1
                delay *= 2  # Exponential backoff
            else:
                raise
    return func()  # One last try

def rate_limited_operation(func):
    """Ensures minimum delay between API write operations."""
    result = func()
    time.sleep(MIN_DELAY_BETWEEN_WRITES)  # Ensure we don't exceed rate limit
    return result

def get_google_sheets_credentials():
    """Gets valid user credentials from storage or initiates OAuth2 flow."""
    creds = None
    # The file token.pickle stores the user's access and refresh tokens
    if os.path.exists('token.pickle'):
        with open('token.pickle', 'rb') as token:
            creds = pickle.load(token)
    
    # If there are no (valid) credentials available, let the user log in.
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(
                'credentials.json', SCOPES)
            creds = flow.run_local_server(port=0)
        # Save the credentials for the next run
        with open('token.pickle', 'wb') as token:
            pickle.dump(creds, token)

    return creds

def create_spreadsheet(service, title):
    """Creates a new Google Spreadsheet."""
    spreadsheet = {
        'properties': {
            'title': title
        }
    }
    return retry_with_backoff(
        lambda: rate_limited_operation(
            lambda: service.spreadsheets().create(body=spreadsheet, fields='spreadsheetId').execute()
        )
    ).get('spreadsheetId')

def batch_update_spreadsheet(service, spreadsheet_id, requests):
    """Performs a batch update of the spreadsheet."""
    body = {'requests': requests}
    return retry_with_backoff(
        lambda: rate_limited_operation(
            lambda: service.spreadsheets().batchUpdate(
                spreadsheetId=spreadsheet_id,
                body=body
            ).execute()
        )
    )

def batch_update_values(service, spreadsheet_id, data):
    """Performs a batch update of values."""
    body = {
        'valueInputOption': 'RAW',
        'data': data
    }
    return retry_with_backoff(
        lambda: rate_limited_operation(
            lambda: service.spreadsheets().values().batchUpdate(
                spreadsheetId=spreadsheet_id,
                body=body
            ).execute()
        )
    )

def upload_csv_files(directory_path, spreadsheet_title):
    """
    Uploads all CSV files from the specified directory to a new Google Spreadsheet.
    Each CSV file becomes a separate sheet/tab in the spreadsheet.
    """
    # Verify directory exists
    if not os.path.isdir(directory_path):
        raise ValueError(f"Directory not found: {directory_path}")

    # Get credentials and create service
    creds = get_google_sheets_credentials()
    service = build('sheets', 'v4', credentials=creds)

    # Create new spreadsheet
    spreadsheet_id = create_spreadsheet(service, spreadsheet_title)
    print(f"Created new spreadsheet with ID: {spreadsheet_id}")

    # Get list of CSV files
    csv_files = [f for f in os.listdir(directory_path) if f.endswith('.csv')]
    
    if not csv_files:
        print("No CSV files found in the specified directory.")
        return None

    # Prepare batch requests for creating sheets
    sheet_requests = []
    value_data = []
    
    # Process each CSV file
    for csv_file in csv_files:
        try:
            file_path = os.path.join(directory_path, csv_file)
            sheet_name = os.path.splitext(csv_file)[0]  # Use filename without extension as sheet name
            
            # Read CSV file with semicolon delimiter
            df = pd.read_csv(file_path, sep=';', encoding='utf-8')
            
            # Convert DataFrame to list and sanitize values
            raw_values = [df.columns.values.tolist()] + df.values.tolist()
            values = sanitize_values(raw_values)
            
            # Add sheet creation request
            sheet_requests.append({
                'addSheet': {
                    'properties': {
                        'title': sheet_name
                    }
                }
            })
            
            # Add values to batch update
            value_data.append({
                'range': f'{sheet_name}!A1',
                'values': values
            })
            
            print(f"Prepared {csv_file} for upload")
            
        except Exception as e:
            print(f"Error processing {csv_file}: {str(e)}")
            continue

    try:
        # Add request to delete the default Sheet1
        sheet_requests.append({
            'deleteSheet': {
                'sheetId': 0  # Sheet1 always has ID 0
            }
        })

        # Batch create all sheets
        if sheet_requests:
            print("Creating sheets...")
            batch_update_spreadsheet(service, spreadsheet_id, sheet_requests)

        # Batch update all values
        if value_data:
            print("Uploading data...")
            batch_update_values(service, spreadsheet_id, value_data)

        print(f"\nAll files have been uploaded. You can access your spreadsheet at:")
        print(f"https://docs.google.com/spreadsheets/d/{spreadsheet_id}")
        
        # Return the spreadsheet ID
        return spreadsheet_id

    except Exception as e:
        print(f"Error during batch operations: {str(e)}")
        if isinstance(e, HttpError):
            print(f"Response content: {e.content}")
        return None

def main():
    parser = argparse.ArgumentParser(description='Upload CSV files to Google Sheets')
    parser.add_argument('directory', help='Directory containing CSV files')
    parser.add_argument('title', help='Title for the new Google Spreadsheet')
    
    args = parser.parse_args()
    upload_csv_files(args.directory, args.title)

if __name__ == '__main__':
    main() 