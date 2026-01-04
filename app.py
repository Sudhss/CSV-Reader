from flask import Flask, render_template, request, redirect, url_for, flash, jsonify
import pandas as pd
import os
import magic
import math
from werkzeug.utils import secure_filename

app = Flask(__name__)
app.secret_key = 'your-secret-key-here'  # Required for flash messages

UPLOAD_FOLDER = os.path.join(os.getcwd(), 'uploads')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

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
    if not allowed_file(file.filename):
        return jsonify({'error': 'Invalid file type. Please upload a CSV file.'}), 400
    if not is_csv(file):
        return jsonify({'error': 'File is not a valid CSV. Please upload a valid CSV file.'}), 400
    
    try:
        # Save the file
        filename = secure_filename(file.filename)
        filepath = os.path.join(UPLOAD_FOLDER, filename)
        file.save(filepath)
        
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

if __name__ == '__main__':
    app.run(debug=True)
