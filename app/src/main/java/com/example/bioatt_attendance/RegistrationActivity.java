package com.example.bioatt_attendance;

import android.Manifest;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Bundle;
import android.util.Log;
import android.widget.Button;
import android.widget.EditText;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.camera.view.PreviewView;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.example.bioatt_attendance.data.AppDatabase;
import com.example.bioatt_attendance.data.Employee;
import com.example.bioatt_attendance.utils.CameraHelper;

import java.io.File;
import java.io.FileOutputStream;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class RegistrationActivity extends AppCompatActivity {
    private static final String TAG = "RegistrationActivity";
    private static final int CAMERA_PERMISSION_REQUEST = 100;

    private EditText nameEditText;
    private EditText classEditText;
    private EditText parentEmailEditText;
    private Button registerButton;
    private Button captureButton;
    private TextView statusText;
    private PreviewView previewView;

    private CameraHelper cameraHelper;
    private AppDatabase database;
    private ExecutorService executor;
    private String capturedImagePath;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_registration);

        initializeViews();
        initializeHelpers();
        setupClickListeners();
    }

    private void initializeViews() {
        nameEditText = findViewById(R.id.nameEditText);
        classEditText = findViewById(R.id.classEditText);
        parentEmailEditText = findViewById(R.id.parentEmailEditText);
        registerButton = findViewById(R.id.registerButton);
        captureButton = findViewById(R.id.captureButton);
        statusText = findViewById(R.id.statusText);
        previewView = findViewById(R.id.previewView);
    }

    private void initializeHelpers() {
        database = AppDatabase.getInstance(this);
        executor = Executors.newSingleThreadExecutor();
        cameraHelper = new CameraHelper(this, null);
    }

    private void setupClickListeners() {
        captureButton.setOnClickListener(v -> {
            capturePhoto();
        });
        registerButton.setOnClickListener(v -> {
            if (validateInputs()) {
                registerStudent();
            }
        });
    }

    private void capturePhoto() {
        // Check camera permission before capturing
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.CAMERA}, CAMERA_PERMISSION_REQUEST);
            return;
        }
        statusText.setText("Capturing photo...");
        captureButton.setEnabled(false);
        cameraHelper.takePictureFront(this, previewView, new CameraHelper.OnImageCapturedListener() {
            @Override
            public void onImageCaptured(String imagePath) {
                capturedImagePath = imagePath;
                runOnUiThread(() -> {
                    statusText.setText("Photo captured!");
                    captureButton.setEnabled(true);
                });
            }
            @Override
            public void onImageCaptureError(String error) {
                runOnUiThread(() -> {
                    statusText.setText("Camera error: " + error);
                    Toast.makeText(RegistrationActivity.this, "Camera error: " + error, Toast.LENGTH_LONG).show();
                    captureButton.setEnabled(true);
                });
            }
        });
    }

    private boolean validateInputs() {
        if (nameEditText.getText().toString().trim().isEmpty()) {
            nameEditText.setError("Name is required");
            return false;
        }
        if (classEditText.getText().toString().trim().isEmpty()) {
            classEditText.setError("Class is required");
            return false;
        }
        if (parentEmailEditText.getText().toString().trim().isEmpty()) {
            parentEmailEditText.setError("Parent Email is required");
            return false;
        }
        if (capturedImagePath == null) {
            Toast.makeText(this, "Please capture face photo", Toast.LENGTH_SHORT).show();
            return false;
        }
        return true;
    }

    private void registerStudent() {
        executor.execute(() -> {
            try {
                String name = nameEditText.getText().toString().trim();
                String className = classEditText.getText().toString().trim();
                String parentEmail = parentEmailEditText.getText().toString().trim();

                // Prepare output file (e.g., JSON or CSV)
                File outputDir = getExternalFilesDir(null);
                File outFile = new File(outputDir, "student_" + name.replaceAll("\\s+", "_") + ".txt");
                StringBuilder sb = new StringBuilder();
                sb.append("Name: ").append(name).append("\n");
                sb.append("Class: ").append(className).append("\n");
                sb.append("Parent Email: ").append(parentEmail).append("\n");
                sb.append("Face Photo Path: ").append(capturedImagePath).append("\n");
                java.nio.file.Files.write(outFile.toPath(), sb.toString().getBytes());

                runOnUiThread(() -> {
                    Toast.makeText(this, "Student registered! File ready for upload.", Toast.LENGTH_LONG).show();
                    finish();
                });
            } catch (Exception e) {
                Log.e(TAG, "Error registering student", e);
                runOnUiThread(() -> {
                    Toast.makeText(this, "Error: " + e.getMessage(), Toast.LENGTH_SHORT).show();
                });
            }
        });
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

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == CAMERA_PERMISSION_REQUEST) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                capturePhoto(); // Retry capturing photo after permission is granted
            } else {
                Toast.makeText(this, "Camera permission is required to capture photo", Toast.LENGTH_LONG).show();
            }
        }
    }
} 