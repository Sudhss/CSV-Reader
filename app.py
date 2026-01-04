from flask import Flask, render_template, request, redirect, url_for, flash
import pandas as pd
import os
import magic
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

@app.route('/', methods=['GET', 'POST'])
def index():
    table_html = None
    message = ''
    if request.method == 'POST':
        if 'file' not in request.files:
            message = 'No file uploaded.'
        else:
            file = request.files['file']
            if file.filename == '':
                message = 'No selected file.'
            elif not allowed_file(file.filename):
                message = 'Invalid file type. Please upload a CSV file.'
            elif not is_csv(file):
                message = 'File is not a valid CSV. Please upload a valid CSV file.'
            else:
                filepath = os.path.join(UPLOAD_FOLDER, file.filename)
                file.save(filepath)
                try:
                    df = pd.read_csv(filepath)
                    pd.set_option('display.max_colwidth', None)
                    table_html = df.to_html(classes='table table-striped', index=False, escape=False)
                except Exception as e:
                    message = f'Error reading CSV: {e}'
    return render_template('index.html', table_html=table_html, message=message)

if __name__ == '__main__':
    app.run(debug=True)
