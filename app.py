from flask import Flask, render_template, request, redirect, url_for, flash, jsonify, send_from_directory
import pandas as pd
import os
import magic
import math
import json
from werkzeug.utils import secure_filename
from datetime import datetime

# Configuration
MAX_CONTENT_LENGTH = 10 * 1024 * 1024  # 10MB limit

app = Flask(__name__)
app.secret_key = 'your-secret-key-here'  # Required for flash messages
app.config['MAX_CONTENT_LENGTH'] = MAX_CONTENT_LENGTH
app.config['UPLOAD_FOLDER'] = os.path.join(os.getcwd(), 'uploads')

os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

# File to store file metadata
METADATA_FILE = os.path.join(UPLOAD_FOLDER, 'file_metadata.json')

def load_metadata():
    if os.path.exists(METADATA_FILE):
        with open(METADATA_FILE, 'r') as f:
            try:
                return json.load(f)
            except json.JSONDecodeError:
                return {}
    return {}

def save_metadata(metadata):
    with open(METADATA_FILE, 'w') as f:
        json.dump(metadata, f, indent=2)

def update_file_metadata(filename, action='add'):
    metadata = load_metadata()
    filepath = os.path.join(UPLOAD_FOLDER, filename)
    
    if action == 'add' and os.path.exists(filepath):
        stats = os.stat(filepath)
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                row_count = sum(1 for _ in f) - 1  # Exclude header
                if row_count < 0:  # Handle empty file
                    row_count = 0
        except Exception as e:
            print(f"Error counting rows in {filename}: {e}")
            row_count = 0
            
        metadata[filename] = {
            'uploaded_at': datetime.now().isoformat(),
            'size': stats.st_size,
            'size_mb': round(stats.st_size / (1024 * 1024), 2),  # Add size in MB
            'rows': row_count
        }
    elif action == 'delete' and filename in metadata:
        del metadata[filename]
    
    save_metadata(metadata)

# Allowed file extensions and their MIME types
ALLOWED_EXTENSIONS = {'csv'}
ALLOWED_MIME_TYPES = {'text/csv', 'text/plain', 'application/csv', 'application/octet-stream'}

def allowed_file(filename):
    return ('.' in filename and 
            filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS)

def is_csv(file):
    # Check MIME type of the file
    file_mime = magic.Magic(mime=True)
    mime_type = file_mime.from_buffer(file.read(1024))
    file.seek(0)  # Reset file pointer
    return mime_type in ALLOWED_MIME_TYPES

@app.route('/', methods=['GET'])
def index():
    return render_template('index.html')

@app.route('/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded.'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file.'}), 400
        
    # Check file size
    file.seek(0, os.SEEK_END)
    file_size = file.tell()
    file.seek(0)  # Reset file pointer
    
    if file_size > MAX_CONTENT_LENGTH:
        return jsonify({
            'error': f'File too large. Maximum size is {MAX_CONTENT_LENGTH/1024/1024:.1f}MB'
        }), 413
        
    if not allowed_file(file.filename):
        return jsonify({'error': 'Invalid file type. Please upload a CSV file.'}), 400
    if not is_csv(file):
        return jsonify({'error': 'File is not a valid CSV. Please upload a valid CSV file.'}), 400
    
    try:
        # Save the file
        filename = secure_filename(file.filename)
        filepath = os.path.join(UPLOAD_FOLDER, filename)
        file.save(filepath)
        
        # Update file metadata
        update_file_metadata(filename, 'add')
        
        # Read just the first 10 rows to get column info
        df_sample = pd.read_csv(filepath, nrows=10)
        columns = df_sample.columns.tolist()
        total_rows = sum(1 for _ in open(filepath, 'r', encoding='utf-8')) - 1  # Subtract header
        
        return jsonify({
            'filename': filename,
            'columns': columns,
            'total_rows': total_rows,
            'rows_per_page': 10,
            'total_pages': math.ceil(total_rows / 10)
        })
    except Exception as e:
        return jsonify({'error': f'Error processing file: {str(e)}'}), 500

@app.route('/get_data', methods=['GET'])
def get_data():
    filename = request.args.get('filename')
    page = int(request.args.get('page', 1))
    rows_per_page = int(request.args.get('rows_per_page', 10))
    
    try:
        filepath = os.path.join(UPLOAD_FOLDER, filename)
        
        if not os.path.exists(filepath):
            return jsonify({'error': 'File not found'}), 404
            
        # Calculate rows to skip
        skip_rows = (page - 1) * rows_per_page
        
        # Read only the required rows
        df = pd.read_csv(
            filepath,
            skiprows=range(1, skip_rows + 1),  # +1 to skip header
            nrows=rows_per_page,
            header=0  # Use first line as header
        )
        
        # Convert to HTML
        table_html = df.to_html(classes='table table-striped', index=False, escape=False)
        
        return jsonify({
            'table_html': table_html,
            'current_page': page
        })
    except Exception as e:
        return jsonify({'error': f'Error reading data: {str(e)}'}), 500

@app.route('/list_files', methods=['GET'])
def list_files():
    try:
        metadata = load_metadata()
        files = []
        
        for filename in os.listdir(UPLOAD_FOLDER):
            if filename == os.path.basename(METADATA_FILE):
                continue
                
            file_info = metadata.get(filename, {
                'uploaded_at': datetime.fromtimestamp(os.path.getmtime(os.path.join(UPLOAD_FOLDER, filename))).isoformat(),
                'size': os.path.getsize(os.path.join(UPLOAD_FOLDER, filename))
            })
            
            files.append({
                'name': filename,
                'uploaded_at': file_info.get('uploaded_at'),
                'size': file_info.get('size'),
                'rows': file_info.get('rows', 'N/A')
            })
        
        # Sort by upload time (newest first)
        files.sort(key=lambda x: x['uploaded_at'], reverse=True)
        
        return jsonify({'files': files})
    except Exception as e:
        return jsonify({'error': f'Error listing files: {str(e)}'}), 500

@app.route('/download/<filename>', methods=['GET'])
def download_file(filename):
    try:
        return send_from_directory(
            UPLOAD_FOLDER,
            filename,
            as_attachment=True,
            download_name=filename
        )
    except Exception as e:
        return jsonify({'error': f'Error downloading file: {str(e)}'}), 500

@app.route('/delete/<filename>', methods=['DELETE'])
def delete_file(filename):
    try:
        filepath = os.path.join(UPLOAD_FOLDER, filename)
        if os.path.exists(filepath):
            os.remove(filepath)
            update_file_metadata(filename, 'delete')
            return jsonify({'message': 'File deleted successfully'})
        return jsonify({'error': 'File not found'}), 404
    except Exception as e:
        return jsonify({'error': f'Error deleting file: {str(e)}'}), 500

if __name__ == '__main__':
    app.run(debug=True)
