from flask import Flask, request, jsonify, send_from_directory
import smtplib
from email.mime.text import MIMEText
import os
from dotenv import load_dotenv
from flask_cors import CORS
from admin_api import register_admin_routes

load_dotenv()

app = Flask(__name__)
CORS(app)
register_admin_routes(app)

GMAIL_USER = os.getenv('GMAIL_USER')
GMAIL_PASS = os.getenv('GMAIL_PASS')
SMTP_SERVER = 'smtp.gmail.com'
SMTP_PORT = 587

@app.route('/send-attendance-emails', methods=['POST'])
def send_attendance_emails():
    data = request.json
    if not data or 'records' not in data:
        return jsonify({'error': 'Invalid data'}), 400
    results = []
    for rec in data['records']:
        to_email = rec.get('parent_email')
        student_name = rec.get('student_name')
        status = rec.get('status')
        date = rec.get('date')
        if not (to_email and student_name and status and date):
            results.append({'parent_email': to_email, 'status': 'skipped', 'reason': 'missing fields'})
            continue
        subject = f"Attendance Update for {student_name}"
        if status == 'Left for Home':
            body = f"Dear Parent,\n\nYour child {student_name} has left for home at {date}.\n\nRegards,\nSchool"
        elif status == 'Present':
            body = f"Dear Parent,\n\nYour child {student_name} is present today ({date}).\n\nRegards,\nSchool"
        elif status == 'Absent':
            body = f"Dear Parent,\n\nYour child {student_name} is absent today ({date}).\n\nRegards,\nSchool"
        else:
            body = f"Dear Parent,\n\nYour child {student_name} was marked {status} on {date}.\n\nRegards,\nSchool"
        msg = MIMEText(body)
        msg['Subject'] = subject
        msg['From'] = GMAIL_USER
        msg['To'] = to_email
        try:
            with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
                server.starttls()
                server.login(GMAIL_USER, GMAIL_PASS)
                server.sendmail(GMAIL_USER, to_email, msg.as_string())
            results.append({'parent_email': to_email, 'status': 'sent'})
        except Exception as e:
            results.append({'parent_email': to_email, 'status': 'error', 'reason': str(e)})
    return jsonify({'results': results})

@app.route('/send-marks-emails', methods=['POST'])
def send_marks_emails():
    data = request.json
    if not data or 'records' not in data:
        return jsonify({'error': 'Invalid data'}), 400
    results = []
    for rec in data['records']:
        to_email = rec.get('parent_email')
        student_name = rec.get('student_name')
        marks = rec.get('marks')
        subject = rec.get('subject')
        exam = rec.get('exam')
        date = rec.get('date')
        if not (to_email and student_name and subject and exam and date and marks is not None):
            results.append({'parent_email': to_email, 'status': 'skipped', 'reason': 'missing fields'})
            continue
        subject_line = f"Marks Update for {student_name} - {subject} ({exam})"
        body = f"Dear Parent,\n\nYour child {student_name} scored {marks} in {subject} ({exam}) on {date}.\n\nRegards,\nSchool"
        msg = MIMEText(body)
        msg['Subject'] = subject_line
        msg['From'] = GMAIL_USER
        msg['To'] = to_email
        try:
            with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
                server.starttls()
                server.login(GMAIL_USER, GMAIL_PASS)
                server.sendmail(GMAIL_USER, to_email, msg.as_string())
            results.append({'parent_email': to_email, 'status': 'sent'})
        except Exception as e:
            results.append({'parent_email': to_email, 'status': 'error', 'reason': str(e)})
    return jsonify({'results': results})

@app.route('/send-bus-notification-email', methods=['POST'])
def send_bus_notification_email():
    data = request.json
    to_email = data.get('parent_email')
    student_name = data.get('student_name')
    notif_type = data.get('type')  # 'picked' or 'dropped'
    bus_number = data.get('bus_number')
    timestamp = data.get('timestamp')
    if not (to_email and student_name and notif_type and bus_number and timestamp):
        return jsonify({'error': 'Missing fields'}), 400
    if notif_type == 'picked':
        subject = f"Bus Pickup Notification for {student_name}"
        body = f"Dear Parent,\n\nYour child {student_name} has been picked up by bus {bus_number} at {timestamp}.\n\nRegards,\nSchool"
    elif notif_type == 'dropped':
        subject = f"Bus Drop Notification for {student_name}"
        body = f"Dear Parent,\n\nYour child {student_name} has been dropped off by bus {bus_number} at {timestamp}.\n\nRegards,\nSchool"
    else:
        subject = f"Bus Notification for {student_name}"
        body = f"Dear Parent,\n\nYour child {student_name} had a bus event ({notif_type}) at {timestamp}.\n\nRegards,\nSchool"
    msg = MIMEText(body)
    msg['Subject'] = subject
    msg['From'] = GMAIL_USER
    msg['To'] = to_email
    try:
        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
            server.starttls()
            server.login(GMAIL_USER, GMAIL_PASS)
            server.sendmail(GMAIL_USER, to_email, msg.as_string())
        return jsonify({'status': 'sent'})
    except Exception as e:
        return jsonify({'status': 'error', 'reason': str(e)}), 500

@app.route('/')
def landing_page():
    return send_from_directory('.', 'index.html')

@app.route('/admin_panal')
def admin_panel():
    return send_from_directory('common', 'login.html')

@app.route('/admin_panal/common/<path:path>')
def admin_panel_common_static(path):
    return send_from_directory('common', path)

@app.route('/admin_panal/admin/<path:path>')
def admin_panel_admin_static(path):
    return send_from_directory('admin', path)

@app.route('/admin_panal/teacher/<path:path>')
def admin_panel_teacher_static(path):
    return send_from_directory('teacher', path)

@app.route('/admin_panal/parent/<path:path>')
def admin_panel_parent_static(path):
    return send_from_directory('parent', path)

@app.route('/admin_panal/driver/<path:path>')
def admin_panel_driver_static(path):
    return send_from_directory('driver', path)

@app.route('/admin_panal/demo/<path:path>')
def admin_panel_demo_static(path):
    return send_from_directory('demo', path)

@app.route('/forgot-password')
def forgot_password():
    return send_from_directory('common', 'forgot-password.html')

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5001))
    debug = os.environ.get('FLASK_DEBUG', 'false').lower() == 'true'
    app.run(host='0.0.0.0', port=port, debug=debug) 