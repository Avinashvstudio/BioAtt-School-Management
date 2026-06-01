package com.example.bioatt_attendance.data;

import androidx.room.Entity;
import androidx.room.PrimaryKey;

@Entity(tableName = "employees")
public class Employee {
    @PrimaryKey(autoGenerate = true)
    private int id;
    
    private String name;
    private String email;
    private String phoneNumber;
    private String faceImagePath;
    private String employeeId;
    private boolean isActive;
    private long createdAt;

    public Employee(String name, String email, String phoneNumber, String employeeId) {
        this.name = name;
        this.email = email;
        this.phoneNumber = phoneNumber;
        this.employeeId = employeeId;
        this.isActive = true;
        this.createdAt = System.currentTimeMillis();
    }

    // Getters and Setters
    public int getId() { return id; }
    public void setId(int id) { this.id = id; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    public String getPhoneNumber() { return phoneNumber; }
    public void setPhoneNumber(String phoneNumber) { this.phoneNumber = phoneNumber; }

    public String getFaceImagePath() { return faceImagePath; }
    public void setFaceImagePath(String faceImagePath) { this.faceImagePath = faceImagePath; }

    public String getEmployeeId() { return employeeId; }
    public void setEmployeeId(String employeeId) { this.employeeId = employeeId; }

    public boolean isActive() { return isActive; }
    public void setActive(boolean active) { isActive = active; }

    public long getCreatedAt() { return createdAt; }
    public void setCreatedAt(long createdAt) { this.createdAt = createdAt; }
} 