# Attendance Email Backend

This is a simple Flask backend to send attendance notification emails to parents when attendance is marked in your school management system.

## Features
- Exposes a POST endpoint `/send-attendance-emails` to receive attendance data and send emails to parents.
- Uses Gmail SMTP with App Password for secure email sending.

## Setup

1. **Clone this repo or copy the folder to your project.**
2. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```
3. **Create a `.env` file:**
   - Copy `.env.example` to `.env` and fill in your Gmail address and App Password.
   - [How to create a Gmail App Password?](https://support.google.com/accounts/answer/185833)

```
GMAIL_USER=your_gmail_address@gmail.com
GMAIL_PASS=your_app_password
```

## Running the Server

```bash
python app.py
```

The server will run on `http://localhost:5001` by default.

## API Usage

**POST** `/send-attendance-emails`

- Content-Type: `application/json`
- Body example:

```
{
  "records": [
    {
      "parent_email": "parent1@example.com",
      "student_name": "John Doe",
      "status": "Present",
      "date": "2024-06-01"
    },
    {
      "parent_email": "parent2@example.com",
      "student_name": "Jane Smith",
      "status": "Absent",
      "date": "2024-06-01"
    }
  ]
}
```

- Returns a JSON array with the status for each email sent.

## Deployment
- Deploy this backend alongside your website (e.g., on Heroku, Render, or your own server).
- Update your frontend to POST attendance data to the deployed backend URL. 