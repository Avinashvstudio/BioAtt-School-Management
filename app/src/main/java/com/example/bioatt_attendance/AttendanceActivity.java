package com.example.bioatt_attendance;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.widget.Button;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.camera.view.PreviewView;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.example.bioatt_attendance.data.AppDatabase;
import com.example.bioatt_attendance.data.Attendance;
import com.example.bioatt_attendance.data.Employee;
import com.example.bioatt_attendance.data.EmployeeDao;
import com.example.bioatt_attendance.utils.CameraHelper;
import com.example.bioatt_attendance.utils.EmailHelper;
import com.example.bioatt_attendance.utils.ReportGenerator;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import java.io.File;

public class AttendanceActivity extends AppCompatActivity implements CameraHelper.OnImageCapturedListener {
    private static final String TAG = "AttendanceActivity";
    private static final int CAMERA_PERMISSION_REQUEST = 100;

    private PreviewView previewView;
    private Button captureButton;
    private TextView statusText;
    private TextView timeText;

    private CameraHelper cameraHelper;
    private AppDatabase database;
    private ExecutorService executor;
    private Employee currentEmployee;
    private String capturedImagePath;
    private boolean isEntry = true; // true for entry, false for exit
    private EmailHelper emailHelper;
    private ReportGenerator reportGenerator;
    private SharedPreferences prefs;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_attendance);

        initializeViews();
        initializeHelpers();
        setupClickListeners();
        updateTimeDisplay();
    }

    private void initializeViews() {
        previewView = findViewById(R.id.previewView);
        captureButton = findViewById(R.id.captureButton);
        statusText = findViewById(R.id.statusText);
        timeText = findViewById(R.id.timeText);
    }

    private void initializeHelpers() {
        database = AppDatabase.getInstance(this);
        executor = Executors.newSingleThreadExecutor();
        cameraHelper = new CameraHelper(this, this);
        emailHelper = new EmailHelper();
        reportGenerator = new ReportGenerator(this);
        prefs = getSharedPreferences("AdminPrefs", MODE_PRIVATE);
        currentEmployee = null; // Reset for new session
    }

    private void setupClickListeners() {
        captureButton.setOnClickListener(v -> {
            // Start the process to capture both photos
            captureSelfieAndSitePhoto();
        });
    }

    private void captureSelfieAndSitePhoto() {
        statusText.setText("Please take a selfie (front camera)...");
        cameraHelper.takePictureFront(this, previewView, new CameraHelper.OnImageCapturedListener() {
            @Override
            public void onImageCaptured(String selfiePath) {
                statusText.setText("Now take a site photo (rear camera)...");
                cameraHelper.takePictureRear(AttendanceActivity.this, previewView, new CameraHelper.OnImageCapturedListener() {
                    @Override
                    public void onImageCaptured(String sitePath) {
                        capturedImagePath = selfiePath + "," + sitePath;
                        runOnUiThread(() -> {
                            statusText.setText("Both photos captured. You can now mark attendance.");
                            processAttendance();
                        });
                    }
                    @Override
                    public void onImageCaptureError(String error) {
                        onImageCaptureError(error);
                    }
                });
            }
            @Override
            public void onImageCaptureError(String error) {
                onImageCaptureError(error);
            }
        });
    }

    private void updateTimeDisplay() {
        SimpleDateFormat timeFormat = new SimpleDateFormat("HH:mm:ss", Locale.getDefault());
        timeText.setText("Current Time: " + timeFormat.format(new Date()));
    }

    @Override
    public void onImageCaptured(String imagePath) {
        // This method is no longer used for face recognition.
        // It will be called when a photo is captured for attendance.
        // For now, we'll just set the capturedImagePath.
        capturedImagePath = imagePath;
        runOnUiThread(() -> {
            statusText.setText("Photo captured! Marking attendance...");
        });
    }

    @Override
    public void onImageCaptureError(String error) {
        runOnUiThread(() -> {
            statusText.setText("Camera error: " + error);
            captureButton.setEnabled(true);
            Toast.makeText(this, "Camera error: " + error, Toast.LENGTH_SHORT).show();
        });
    }

    private void processAttendance() {
        executor.execute(() -> {
            try {
                String currentDate = new SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(new Date());
                long currentTime = System.currentTimeMillis();

                // Use the currentEmployee that was set during face recognition
                if (currentEmployee != null) {
                    // Check if attendance already exists for today
                    Attendance existingAttendance = database.attendanceDao()
                            .getAttendanceByEmployeeAndDate(currentEmployee.getId(), currentDate);

                    if (existingAttendance == null) {
                        // Create new entry attendance
                        Attendance attendance = new Attendance(currentEmployee.getId(), currentEmployee.getName(), currentTime, currentDate);
                        attendance.setEntryImagePath(capturedImagePath);
                        
                        // Check if late (after 11:55 AM)
                        Calendar calendar = Calendar.getInstance();
                        calendar.set(Calendar.HOUR_OF_DAY, 11);
                        calendar.set(Calendar.MINUTE, 55);
                        calendar.set(Calendar.SECOND, 0);
                        
                        if (currentTime > calendar.getTimeInMillis()) {
                            attendance.setLate(true);
                            attendance.setStatus("LATE");
                        }

                        long attendanceId = database.attendanceDao().insert(attendance);
                        sendInstantEntryReport(attendance);
                        
                        runOnUiThread(() -> {
                            statusText.setText("Entry attendance marked successfully!");
                            Toast.makeText(this, "Welcome " + currentEmployee.getName() + "!", Toast.LENGTH_LONG).show();
                            finish();
                        });
                    } else {
                        // Update exit time
                        existingAttendance.setExitTime(currentTime);
                        existingAttendance.setExitImagePath(capturedImagePath);
                        
                        // Check if early exit (before 8:00 PM)
                        Calendar calendar = Calendar.getInstance();
                        calendar.set(Calendar.HOUR_OF_DAY, 20);
                        calendar.set(Calendar.MINUTE, 0);
                        calendar.set(Calendar.SECOND, 0);
                        
                        if (currentTime < calendar.getTimeInMillis()) {
                            existingAttendance.setEarlyExit(true);
                        }

                        database.attendanceDao().update(existingAttendance);
                        
                        runOnUiThread(() -> {
                            statusText.setText("Exit attendance marked successfully!");
                            Toast.makeText(this, "Goodbye " + currentEmployee.getName() + "!", Toast.LENGTH_LONG).show();
                            finish();
                        });
                    }
                } else {
                    runOnUiThread(() -> {
                        statusText.setText("No employees found. Please register employees first.");
                        Toast.makeText(this, "No employees registered", Toast.LENGTH_SHORT).show();
                    });
                }

            } catch (Exception e) {
                Log.e(TAG, "Error processing attendance", e);
                runOnUiThread(() -> {
                    statusText.setText("Error processing attendance");
                    Toast.makeText(this, "Error: " + e.getMessage(), Toast.LENGTH_SHORT).show();
                });
            }
        });
    }

    private void sendInstantEntryReport(Attendance attendance) {
        String senderEmail = prefs.getString("sender_email", "");
        String senderPassword = prefs.getString("sender_password", "");
        String recipientEmail = prefs.getString("recipient_email", "");

        if (senderEmail.isEmpty() || senderPassword.isEmpty() || recipientEmail.isEmpty()) {
            Log.w(TAG, "Email credentials not configured. Skipping instant report.");
            return;
        }

        String reportPath = reportGenerator.generateSingleEntryReport(attendance);
        if (reportPath != null) {
            String subject = "Instant Attendance Entry: " + attendance.getEmployeeName();
            String body = "Please find the attached entry report for " + attendance.getEmployeeName() + ".";

            emailHelper.sendEmailWithAttachment(
                    "smtp.gmail.com", // This should be configurable in a real app
                    "465",            // Standard SSL port for Gmail
                    senderEmail,
                    senderPassword,
                    recipientEmail,
                    subject,
                    body,
                    reportPath
            );
        }
    }

    private boolean checkCameraPermission() {
        return ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED;
    }

    private void requestCameraPermission() {
        ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.CAMERA}, CAMERA_PERMISSION_REQUEST);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == CAMERA_PERMISSION_REQUEST) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                captureSelfieAndSitePhoto(); // Call the new method
            } else {
                Toast.makeText(this, "Camera permission required for face recognition", Toast.LENGTH_SHORT).show();
            }
        }
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (cameraHelper != null) {
            cameraHelper.shutdown();
        }
        if (executor != null) {
            executor.shutdown();
        }
    }

    private String saveBitmapToFile(Bitmap bitmap, String fileName) {
        try {
            File file = new File(getFilesDir(), fileName);
            java.io.FileOutputStream out = new java.io.FileOutputStream(file);
            bitmap.compress(Bitmap.CompressFormat.JPEG, 100, out);
            out.flush();
            out.close();
            return file.getAbsolutePath();
        } catch (Exception e) {
            e.printStackTrace();
            return null;
        }
    }
} 