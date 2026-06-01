package com.example.bioatt_attendance;

import android.app.AlertDialog;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;
import androidx.security.crypto.EncryptedSharedPreferences;
import androidx.security.crypto.MasterKey;

import com.example.bioatt_attendance.data.AppDatabase;
import com.example.bioatt_attendance.data.Employee;
import com.example.bioatt_attendance.utils.AttendanceScheduler;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class AdminActivity extends AppCompatActivity {
    private static final String TAG = "AdminActivity";
    private static final String PREFS_NAME = "AdminPrefs";
    private static final String ENCRYPTED_PREFS_NAME = "EncryptedAdminPrefs";
    private static final String KEY_SENDER_EMAIL = "sender_email";
    private static final String KEY_SENDER_PASSWORD = "sender_password";
    private static final String KEY_RECIPIENT_EMAIL = "recipient_email";

    private TextView totalEmployeesText;
    private TextView todayAttendanceText;
    private Button generateDailyReportButton;
    private Button configureEmailButton;
    private RecyclerView employeesRecyclerView;

    private AppDatabase database;
    private ExecutorService executor;
    private AttendanceScheduler scheduler;
    private EmployeeAdapter employeeAdapter;
    private SharedPreferences prefs;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_admin);

        initializeViews();
        initializeHelpers();
        setupClickListeners();
        loadData();
    }

    private void initializeViews() {
        totalEmployeesText = findViewById(R.id.totalEmployeesText);
        todayAttendanceText = findViewById(R.id.todayAttendanceText);
        generateDailyReportButton = findViewById(R.id.generateDailyReportButton);
        configureEmailButton = findViewById(R.id.configureEmailButton);
        employeesRecyclerView = findViewById(R.id.employeesRecyclerView);
    }

    private void initializeHelpers() {
        database = AppDatabase.getInstance(this);
        executor = Executors.newSingleThreadExecutor();
        scheduler = new AttendanceScheduler(this);
        
        try {
            MasterKey masterKey = new MasterKey.Builder(this)
                    .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                    .build();

            prefs = EncryptedSharedPreferences.create(
                    this,
                    ENCRYPTED_PREFS_NAME,
                    masterKey,
                    EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                    EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            );
        } catch (Exception e) {
            Log.e(TAG, "Error creating EncryptedSharedPreferences", e);
            // Fallback to regular SharedPreferences if encryption fails
            prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        }
        
        // Setup RecyclerView
        employeesRecyclerView.setLayoutManager(new LinearLayoutManager(this));
        employeeAdapter = new EmployeeAdapter(new ArrayList<>());
        employeesRecyclerView.setAdapter(employeeAdapter);
    }

    private void setupClickListeners() {
        generateDailyReportButton.setOnClickListener(v -> {
            scheduler.scheduleImmediateReport("daily_summary");
            Toast.makeText(this, "Daily summary report will be sent shortly", Toast.LENGTH_SHORT).show();
        });

        configureEmailButton.setOnClickListener(v -> showEmailConfigurationDialog());
    }

    private void showEmailConfigurationDialog() {
        AlertDialog.Builder builder = new AlertDialog.Builder(this);
        builder.setTitle("Configure Email Settings");

        // Inflate custom layout
        View view = getLayoutInflater().inflate(R.layout.dialog_email_config, null);
        final EditText senderEmailInput = view.findViewById(R.id.senderEmailInput);
        final EditText senderPasswordInput = view.findViewById(R.id.senderPasswordInput);
        final EditText recipientEmailInput = view.findViewById(R.id.recipientEmailInput);
        builder.setView(view);

        // Pre-fill existing data
        senderEmailInput.setText(prefs.getString(KEY_SENDER_EMAIL, ""));
        senderPasswordInput.setText(prefs.getString(KEY_SENDER_PASSWORD, ""));
        recipientEmailInput.setText(prefs.getString(KEY_RECIPIENT_EMAIL, ""));


        builder.setPositiveButton("Save", (dialog, which) -> {
            String senderEmail = senderEmailInput.getText().toString().trim();
            String senderPassword = senderPasswordInput.getText().toString().trim();
            String recipientEmail = recipientEmailInput.getText().toString().trim();

            if (!senderEmail.isEmpty() && !senderPassword.isEmpty() && !recipientEmail.isEmpty()) {
                prefs.edit()
                        .putString(KEY_SENDER_EMAIL, senderEmail)
                        .putString(KEY_SENDER_PASSWORD, senderPassword)
                        .putString(KEY_RECIPIENT_EMAIL, recipientEmail)
                        .apply();
                Toast.makeText(this, "Email settings saved.", Toast.LENGTH_SHORT).show();
            } else {
                Toast.makeText(this, "Please fill all fields.", Toast.LENGTH_SHORT).show();
            }
        });
        builder.setNegativeButton("Cancel", (dialog, which) -> dialog.cancel());
        builder.show();
    }

    private void updateAdminPhoneDisplay() {
        // This method is no longer needed
    }

    private String getAdminPhone() {
        // This method is no longer needed
        return "";
    }

    private void setAdminPhone(String phoneNumber) {
        // This method is no longer needed
    }

    private void loadData() {
        executor.execute(() -> {
            try {
                // Load employee count
                int employeeCount = database.employeeDao().getActiveEmployeeCount();
                
                // Load today's attendance count
                String today = new SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(new Date());
                int todayAttendance = database.attendanceDao().getAttendanceCountByDate(today);
                
                // Load employees list
                List<Employee> employees = database.employeeDao().getAllActiveEmployees();

                runOnUiThread(() -> {
                    updateUI(employeeCount, todayAttendance, employees);
                });

            } catch (Exception e) {
                Log.e(TAG, "Error loading data", e);
                runOnUiThread(() -> {
                    Toast.makeText(this, "Error loading data: " + e.getMessage(), Toast.LENGTH_SHORT).show();
                });
            }
        });
    }

    private void updateUI(int employeeCount, int todayAttendance, List<Employee> employees) {
        totalEmployeesText.setText("Total Employees: " + employeeCount);
        todayAttendanceText.setText("Today's Attendance: " + todayAttendance);
        
        employeeAdapter.updateEmployees(employees);
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (executor != null) {
            executor.shutdown();
        }
    }

    // Simple Employee Adapter for RecyclerView
    private static class EmployeeAdapter extends RecyclerView.Adapter<EmployeeAdapter.EmployeeViewHolder> {
        private List<Employee> employees;

        public EmployeeAdapter(List<Employee> employees) {
            this.employees = employees;
        }

        public void updateEmployees(List<Employee> newEmployees) {
            this.employees = newEmployees;
            notifyDataSetChanged();
        }

        @Override
        public EmployeeViewHolder onCreateViewHolder(android.view.ViewGroup parent, int viewType) {
            android.view.View view = android.view.LayoutInflater.from(parent.getContext())
                    .inflate(android.R.layout.simple_list_item_2, parent, false);
            return new EmployeeViewHolder(view);
        }

        @Override
        public void onBindViewHolder(EmployeeViewHolder holder, int position) {
            Employee employee = employees.get(position);
            holder.text1.setText(employee.getName());
            holder.text2.setText(employee.getEmployeeId() + " • " + employee.getEmail());
        }

        @Override
        public int getItemCount() {
            return employees.size();
        }

        static class EmployeeViewHolder extends RecyclerView.ViewHolder {
            TextView text1;
            TextView text2;

            public EmployeeViewHolder(android.view.View itemView) {
                super(itemView);
                text1 = itemView.findViewById(android.R.id.text1);
                text2 = itemView.findViewById(android.R.id.text2);
            }
        }
    }
} 