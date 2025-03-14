import sqlite3
import json
from datetime import datetime
import os

class TraceDB:
    def __init__(self, db_path='traces.db'):
        self.db_path = db_path
        self.init_db()

    def init_db(self):
        """Initialize the database with required tables."""
        # If database exists but has wrong schema, delete it
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                # Check if traces table has upload_id column
                cursor.execute("PRAGMA table_info(traces)")
                columns = [row[1] for row in cursor.fetchall()]
                if 'upload_id' not in columns:
                    conn.close()
                    os.remove(self.db_path)
                    print(f"Removed old database with incompatible schema")
        except:
            # If database doesn't exist or other error, we'll create it
            pass

        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            
            # Create uploads table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS uploads (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    created_at TIMESTAMP NOT NULL
                )
            ''')
            
            # Create traces table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS traces (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    upload_id INTEGER NOT NULL,
                    filename TEXT NOT NULL,
                    sheet_name TEXT NOT NULL,
                    upload_time TIMESTAMP NOT NULL,
                    row_count INTEGER NOT NULL,
                    column_count INTEGER NOT NULL,
                    column_names TEXT NOT NULL,  -- JSON array of column names
                    error TEXT,
                    FOREIGN KEY (upload_id) REFERENCES uploads(id) ON DELETE CASCADE
                )
            ''')
            
            # Create values table for storing actual data
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS trace_values (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    trace_id INTEGER NOT NULL,
                    row_idx INTEGER NOT NULL,
                    column_name TEXT NOT NULL,
                    value TEXT,
                    FOREIGN KEY (trace_id) REFERENCES traces(id) ON DELETE CASCADE
                )
            ''')
            
            # Create parsers table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS parsers (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL UNIQUE,
                    code TEXT NOT NULL,
                    created_at TIMESTAMP NOT NULL,
                    updated_at TIMESTAMP NOT NULL
                )
            ''')
            
            # Enable foreign key support
            cursor.execute('PRAGMA foreign_keys = ON')
            
            conn.commit()
            print(f"Database initialized with correct schema at {self.db_path}")

    def create_upload(self, name):
        """Create a new upload group."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO uploads (name, created_at)
                VALUES (?, ?)
            ''', (name, datetime.now().isoformat()))
            return cursor.lastrowid

    def delete_upload(self, upload_id):
        """Delete an upload and all its associated traces and values."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute('DELETE FROM uploads WHERE id = ?', (upload_id,))
            conn.commit()

    def add_trace(self, upload_id, filename, sheet_name, df, error=None):
        """Add a trace to the database."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            
            # Store trace metadata
            column_names = df.columns  # Already a list in SimpleDF
            cursor.execute('''
                INSERT INTO traces (
                    upload_id, filename, sheet_name, upload_time, row_count, column_count, 
                    column_names, error
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                upload_id,
                filename,
                sheet_name,
                datetime.now().isoformat(),
                len(df),
                len(df.columns),
                json.dumps(column_names),
                error
            ))
            
            trace_id = cursor.lastrowid
            
            # Store values
            values = []
            for idx, row in df.iterrows():
                for col_idx, col in enumerate(df.columns):
                    values.append((
                        trace_id,
                        idx,
                        col,
                        str(row[col_idx]) if row[col_idx] is not None else None
                    ))
            
            cursor.executemany('''
                INSERT INTO trace_values (trace_id, row_idx, column_name, value)
                VALUES (?, ?, ?, ?)
            ''', values)
            
            conn.commit()

    def get_uploads(self):
        """Get all uploads with their traces."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT 
                    u.id, u.name, u.created_at
                FROM uploads u
                ORDER BY u.created_at DESC
            ''')
            return cursor.fetchall()

    def get_traces_for_upload(self, upload_id):
        """Get all traces for a specific upload."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT 
                    id, filename, sheet_name, error, row_count
                FROM traces 
                WHERE upload_id = ?
                ORDER BY upload_time DESC
            ''', (upload_id,))
            return cursor.fetchall()

    def get_columns(self, trace_id):
        """Get column names for a specific trace."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT column_names FROM traces WHERE id = ?', (trace_id,))
            result = cursor.fetchone()
            return json.loads(result[0]) if result else []

    def get_traces(self, upload_id=None):
        """Get traces with optional filtering by upload_id."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            
            query = "SELECT * FROM traces"
            params = []
            
            if upload_id is not None:
                query += " WHERE upload_id = ?"
                params.append(upload_id)
            
            query += " ORDER BY upload_time DESC"
            cursor.execute(query, params)
            return cursor.fetchall()

    def get_trace_values(self, trace_id):
        """Get values for a specific trace."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM trace_values WHERE trace_id = ?", (trace_id,))
            return cursor.fetchall()

    def get_unique_values(self, column_name, table='traces'):
        """Get unique values for a column."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(f"SELECT DISTINCT {column_name} FROM {table}")
            return [row[0] for row in cursor.fetchall()]

    def get_values(self, trace_id):
        """Get values for a specific trace, organized by rows."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            
            # First, get all values for this trace
            cursor.execute('''
                SELECT row_idx, column_name, value
                FROM trace_values
                WHERE trace_id = ?
                ORDER BY row_idx, column_name
            ''', (trace_id,))
            
            values = cursor.fetchall()
            
            # Organize values by row
            rows = {}
            for row_idx, column_name, value in values:
                if row_idx not in rows:
                    rows[row_idx] = {'id': row_idx}
                rows[row_idx][column_name] = value
            
            return list(rows.values())

    def get_all_traces(self):
        """Get all traces from the database."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT id, filename, sheet_name, error, row_count, upload_id
                FROM traces
                ORDER BY filename
            """)
            return cursor.fetchall()
            
    def get_traces_by_filename(self, filename):
        """Get all traces with a specific filename."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT id, filename, sheet_name, error, row_count, upload_id
                FROM traces
                WHERE filename = ?
                ORDER BY id DESC
            """, (filename,))
            return cursor.fetchall()
            
    def get_upload(self, upload_id):
        """Get upload information by ID."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM uploads WHERE id = ?", (upload_id,))
            return cursor.fetchone()

    def rename_upload(self, upload_id, new_name):
        """Rename an upload."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                UPDATE uploads 
                SET name = ?
                WHERE id = ?
            ''', (new_name, upload_id))
            conn.commit()

    def get_deduplicated_values_by_filename(self, filename):
        """Get deduplicated values for all traces with a given filename."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            
            # First get all trace IDs for this filename
            cursor.execute("""
                SELECT t.id, t.upload_id, u.created_at
                FROM traces t
                JOIN uploads u ON t.upload_id = u.id
                WHERE t.filename = ? AND t.error IS NULL
                ORDER BY u.created_at DESC
            """, (filename,))
            traces = cursor.fetchall()
            
            if not traces:
                return []
            
            # Build a query to get all values with upload info
            trace_ids = [str(t[0]) for t in traces]
            cursor.execute(f"""
                WITH grouped_values AS (
                    SELECT 
                        tv.row_idx,
                        tv.column_name,
                        tv.value,
                        t.upload_id,
                        u.name as upload_name,
                        u.created_at as upload_time,
                        ROW_NUMBER() OVER (
                            PARTITION BY tv.column_name, tv.value
                            ORDER BY u.created_at DESC
                        ) as rn
                    FROM trace_values tv
                    JOIN traces t ON tv.trace_id = t.id
                    JOIN uploads u ON t.upload_id = u.id
                    WHERE tv.trace_id IN ({','.join(trace_ids)})
                )
                SELECT 
                    row_idx,
                    column_name,
                    value,
                    upload_id,
                    upload_name,
                    upload_time
                FROM grouped_values
                WHERE rn = 1
                ORDER BY row_idx, column_name
            """)
            
            values = cursor.fetchall()
            
            # Organize values by row
            rows = {}
            for row_idx, column_name, value, upload_id, upload_name, upload_time in values:
                if row_idx not in rows:
                    rows[row_idx] = {
                        'id': row_idx,
                        '_upload_id': upload_id,
                        '_upload_name': upload_name,
                        '_upload_time': upload_time
                    }
                rows[row_idx][column_name] = value
            
            return list(rows.values())

    # Parser-related methods
    
    def get_all_parsers(self):
        """Get all parsers from the database."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT id, name, code, created_at, updated_at 
                FROM parsers
                ORDER BY name
            """)
            return cursor.fetchall()
    
    def get_parser(self, parser_id):
        """Get a specific parser by ID."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT id, name, code, created_at, updated_at 
                FROM parsers
                WHERE id = ?
            """, (parser_id,))
            return cursor.fetchone()
    
    def get_parser_by_name(self, name):
        """Get a specific parser by name."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT id, name, code, created_at, updated_at 
                FROM parsers
                WHERE name = ?
            """, (name,))
            return cursor.fetchone()
    
    def create_parser(self, name, code):
        """Create a new parser."""
        now = datetime.now().isoformat()
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            try:
                cursor.execute("""
                    INSERT INTO parsers (name, code, created_at, updated_at)
                    VALUES (?, ?, ?, ?)
                """, (name, code, now, now))
                return cursor.lastrowid
            except sqlite3.IntegrityError:
                # Parser with this name already exists
                return None
    
    def update_parser(self, parser_id, name, code):
        """Update an existing parser."""
        now = datetime.now().isoformat()
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            try:
                cursor.execute("""
                    UPDATE parsers
                    SET name = ?, code = ?, updated_at = ?
                    WHERE id = ?
                """, (name, code, now, parser_id))
                return cursor.rowcount > 0
            except sqlite3.IntegrityError:
                # Parser with this name already exists
                return False
    
    def delete_parser(self, parser_id):
        """Delete a parser."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM parsers WHERE id = ?", (parser_id,))
            return cursor.rowcount > 0 