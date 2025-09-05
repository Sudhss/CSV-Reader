from flask import Flask, render_template, request
import pandas as pd
import os

app = Flask(__name__)
UPLOAD_FOLDER = os.path.join(os.getcwd(), 'uploads')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

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
            elif not file.filename.endswith('.csv'):
                message = 'Please upload a CSV file.'
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
