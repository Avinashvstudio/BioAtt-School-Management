package com.example.bioatt_attendance;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.widget.Toast;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.cardview.widget.CardView;
import androidx.core.content.ContextCompat;

import com.example.bioatt_attendance.utils.AttendanceScheduler;

public class MainActivity extends AppCompatActivity {

    private final ActivityResultLauncher<String> requestPermissionLauncher =
            registerForActivityResult(new ActivityResultContracts.RequestPermission(), isGranted -> {
                if (isGranted) {
                    Toast.makeText(this, "Notifications permission granted.", Toast.LENGTH_SHORT).show();
                } else {
                    Toast.makeText(this, "Notifications permission denied. Reports will not be shown.", Toast.LENGTH_SHORT).show();
                }
            });

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        setupClickListeners();
        requestNotificationPermission();
        // Removed AttendanceScheduler and daily report scheduling logic
    }

    private void setupClickListeners() {
        CardView registerEmployeeCard = findViewById(R.id.registerEmployeeCard);
        CardView markAttendanceCard = findViewById(R.id.markAttendanceCard);
        CardView adminPanelCard = findViewById(R.id.adminPanelCard);

        registerEmployeeCard.setOnClickListener(v -> {
            startActivity(new Intent(MainActivity.this, RegistrationActivity.class));
        });

        markAttendanceCard.setOnClickListener(v -> {
            startActivity(new Intent(MainActivity.this, AttendanceActivity.class));
        });

        adminPanelCard.setOnClickListener(v -> {
            startActivity(new Intent(MainActivity.this, AdminActivity.class));
        });
    }

    private void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) !=
                    PackageManager.PERMISSION_GRANTED) {
                // This will show the native permission request dialog
                requestPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS);
            }
        }
    }
}