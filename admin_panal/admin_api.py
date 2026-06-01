import json
import os

import firebase_admin
from firebase_admin import auth, credentials, firestore
from flask import jsonify, request

_db = None
_initialized = False


def init_firebase_admin():
    global _db, _initialized
    if _initialized:
        return _db is not None
    _initialized = True

    if firebase_admin._apps:
        _db = firestore.client()
        return True

    json_env = os.getenv('FIREBASE_SERVICE_ACCOUNT_JSON')
    if json_env:
        try:
            cred = credentials.Certificate(json.loads(json_env))
            firebase_admin.initialize_app(cred)
            _db = firestore.client()
            return True
        except Exception as exc:
            print(f'Admin API disabled: invalid FIREBASE_SERVICE_ACCOUNT_JSON: {exc}')
            return False

    gac = os.getenv('GOOGLE_APPLICATION_CREDENTIALS')
    if gac and os.path.isfile(gac):
        cred = credentials.Certificate(gac)
        firebase_admin.initialize_app(cred)
        _db = firestore.client()
        return True

    default_path = os.path.join(
        os.path.dirname(__file__),
        'bioatt-attendance-25d06-firebase-adminsdk-fbsvc-8fded6b85d.json',
    )
    path = os.getenv('FIREBASE_SERVICE_ACCOUNT', default_path)
    if not os.path.isfile(path):
        print(f'Admin API disabled: service account not found at {path}')
        return False

    cred = credentials.Certificate(path)
    firebase_admin.initialize_app(cred)
    _db = firestore.client()
    return True


def _verify_token():
    if _db is None:
        return None, None, ('API not configured on server', 503)

    header = request.headers.get('Authorization', '')
    id_token = header.replace('Bearer ', '').strip()
    if not id_token:
        return None, None, ('Missing auth token', 401)

    try:
        decoded = auth.verify_id_token(id_token)
    except Exception as exc:
        return None, None, (f'Invalid token: {exc}', 401)

    uid = decoded['uid']
    doc = _db.collection('users').document(uid).get()
    if not doc.exists:
        return None, None, ('User profile not found', 403)

    return decoded, doc.to_dict(), None


def _verify_admin():
    _, profile, err = _verify_token()
    if err:
        return None, err
    if profile.get('role') != 'admin':
        return None, ('Admin access required', 403)
    return _, None


def _verify_teacher():
    decoded, profile, err = _verify_token()
    if err:
        return None, err
    if profile.get('role') not in ('teacher', 'admin'):
        return None, ('Teacher access required', 403)
    return decoded, profile, None


def _teacher_assigned_to_class(profile, class_name, section):
    section = (section or '').strip().upper()
    class_names = [s.strip() for s in (profile.get('className') or '').split(',') if s.strip()]
    sections = [s.strip().upper() for s in (profile.get('section') or '').split(',') if s.strip()]

    def class_matches(stored):
        stored = (stored or '').strip()
        target = (class_name or '').strip()
        if stored == target:
            return True
        if stored.lower() == target.lower():
            return True
        if stored.lower() == f'class {target}'.lower():
            return True
        if f'class {stored}'.lower() == target.lower():
            return True
        return False

    if class_names and sections:
        if len(class_names) == len(sections):
            for cls, sec in zip(class_names, sections):
                if class_matches(cls) and sec == section:
                    return True
        for cls in class_names:
            for sec in sections:
                if class_matches(cls) and sec == section:
                    return True
    return False


def _filter_fields(data, allowed):
    if not isinstance(data, dict):
        return {}
    return {k: v for k, v in data.items() if k in allowed}


def register_admin_routes(app):
    if not init_firebase_admin():
        return

    user_fields = {'name', 'email', 'role', 'className', 'section', 'subjects', 'updatedAt', 'createdAt'}
    student_fields = {'name', 'class', 'section', 'parentEmail', 'bus', 'updatedAt', 'createdAt'}
    class_fields = {'name', 'section', 'teacherId', 'teacherName', 'updatedAt', 'createdAt'}

    @app.route('/api/admin/users/<user_id>', methods=['PUT', 'PATCH'])
    def admin_update_user(user_id):
        _, err = _verify_admin()
        if err:
            return jsonify({'error': err[0]}), err[1]
        payload = _filter_fields(request.get_json(silent=True) or {}, user_fields)
        if not payload:
            return jsonify({'error': 'No valid fields to update'}), 400
        _db.collection('users').document(user_id).update(payload)
        return jsonify({'ok': True})

    @app.route('/api/admin/users/<user_id>', methods=['DELETE'])
    def admin_delete_user(user_id):
        _, err = _verify_admin()
        if err:
            return jsonify({'error': err[0]}), err[1]
        _db.collection('users').document(user_id).delete()
        return jsonify({'ok': True})

    @app.route('/api/admin/students/<student_id>', methods=['PUT', 'PATCH'])
    def admin_update_student(student_id):
        _, err = _verify_admin()
        if err:
            return jsonify({'error': err[0]}), err[1]
        payload = _filter_fields(request.get_json(silent=True) or {}, student_fields)
        if not payload:
            return jsonify({'error': 'No valid fields to update'}), 400
        _db.collection('students').document(student_id).update(payload)
        return jsonify({'ok': True})

    @app.route('/api/admin/students/<student_id>', methods=['DELETE'])
    def admin_delete_student(student_id):
        _, err = _verify_admin()
        if err:
            return jsonify({'error': err[0]}), err[1]
        _db.collection('students').document(student_id).delete()
        return jsonify({'ok': True})

    @app.route('/api/admin/classes/<class_id>', methods=['PUT', 'PATCH'])
    def admin_update_class(class_id):
        _, err = _verify_admin()
        if err:
            return jsonify({'error': err[0]}), err[1]
        payload = _filter_fields(request.get_json(silent=True) or {}, class_fields)
        if not payload:
            return jsonify({'error': 'No valid fields to update'}), 400
        _db.collection('classes').document(class_id).update(payload)
        return jsonify({'ok': True})

    @app.route('/api/admin/classes/<class_id>', methods=['DELETE'])
    def admin_delete_class(class_id):
        _, err = _verify_admin()
        if err:
            return jsonify({'error': err[0]}), err[1]
        _db.collection('classes').document(class_id).delete()
        return jsonify({'ok': True})

    @app.route('/api/teacher/timetable', methods=['GET'])
    def teacher_timetable():
        decoded, profile, err = _verify_teacher()
        if err:
            return jsonify({'error': err[0]}), err[1]

        class_name = (request.args.get('class') or '').strip()
        section = (request.args.get('section') or '').strip().upper()
        if not class_name or not section:
            return jsonify({'error': 'class and section are required'}), 400

        uid = decoded['uid']
        is_admin = profile.get('role') == 'admin'
        assigned = _teacher_assigned_to_class(profile, class_name, section)

        if not is_admin and not assigned:
            # Also allow if teacher has any period in this class/section
            own = (
                _db.collection('timetable')
                .where('teacherId', '==', uid)
                .where('class', '==', class_name)
                .where('section', '==', section)
                .limit(1)
                .stream()
            )
            if not any(True for _ in own):
                # Try alternate class name format
                alt_class = class_name if class_name.lower().startswith('class ') else f'Class {class_name}'
                own = (
                    _db.collection('timetable')
                    .where('teacherId', '==', uid)
                    .where('class', '==', alt_class)
                    .where('section', '==', section)
                    .limit(1)
                    .stream()
                )
                if not any(True for _ in own):
                    # Check classes collection for class teacher assignment
                    classes = _db.collection('classes').where('teacherId', '==', uid).stream()
                    for c in classes:
                        data = c.to_dict()
                        if _teacher_assigned_to_class(
                            {'className': data.get('name', ''), 'section': data.get('section', '')},
                            class_name,
                            section,
                        ):
                            assigned = True
                            break
                    if not assigned:
                        return jsonify({'error': 'Not assigned to this class/section'}), 403

        class_variants = {class_name}
        if not class_name.lower().startswith('class '):
            class_variants.add(f'Class {class_name}')
        else:
            class_variants.add(class_name.replace('Class ', '').replace('class ', ''))

        entries = []
        seen_ids = set()
        for cls in class_variants:
            snap = (
                _db.collection('timetable')
                .where('class', '==', cls)
                .where('section', '==', section)
                .stream()
            )
            for doc in snap:
                if doc.id in seen_ids:
                    continue
                seen_ids.add(doc.id)
                row = doc.to_dict()
                row['id'] = doc.id
                entries.append(row)

        return jsonify({'entries': entries})
