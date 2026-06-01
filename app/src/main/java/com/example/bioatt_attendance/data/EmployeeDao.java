package com.example.bioatt_attendance.data;

import androidx.room.Dao;
import androidx.room.Delete;
import androidx.room.Insert;
import androidx.room.Query;
import androidx.room.Update;

import java.util.List;

@Dao
public interface EmployeeDao {
    @Insert
    long insert(Employee employee);

    @Update
    void update(Employee employee);

    @Delete
    void delete(Employee employee);

    @Query("SELECT * FROM employees WHERE isActive = 1")
    List<Employee> getAllActiveEmployees();

    @Query("SELECT * FROM employees WHERE id = :id")
    Employee getEmployeeById(int id);

    @Query("SELECT * FROM employees WHERE employeeId = :employeeId")
    Employee getEmployeeByEmployeeId(String employeeId);

    @Query("SELECT COUNT(*) FROM employees WHERE isActive = 1")
    int getActiveEmployeeCount();
} 