package com.example.bioatt_attendance.utils;

import android.content.Context;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Environment;
import android.util.Log;

import androidx.camera.core.CameraSelector;
import androidx.camera.core.ImageCapture;
import androidx.camera.core.ImageCaptureException;
import androidx.camera.core.Preview;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.core.content.ContextCompat;
import androidx.lifecycle.LifecycleOwner;

import com.google.common.util.concurrent.ListenableFuture;

import java.io.File;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class CameraHelper {
    private static final String TAG = "CameraHelper";
    private Context context;
    private ImageCapture imageCapture;
    private ExecutorService cameraExecutor;
    private OnImageCapturedListener listener;

    public interface OnImageCapturedListener {
        void onImageCaptured(String imagePath);
        void onImageCaptureError(String error);
    }

    public CameraHelper(Context context, OnImageCapturedListener listener) {
        this.context = context;
        this.listener = listener;
        cameraExecutor = Executors.newSingleThreadExecutor();
    }

    public void startCamera(LifecycleOwner lifecycleOwner, androidx.camera.view.PreviewView previewView) {
        ListenableFuture<ProcessCameraProvider> cameraProviderFuture = ProcessCameraProvider.getInstance(context);

        cameraProviderFuture.addListener(() -> {
            try {
                ProcessCameraProvider cameraProvider = cameraProviderFuture.get();

                Preview preview = new Preview.Builder().build();
                preview.setSurfaceProvider(previewView.getSurfaceProvider());

                imageCapture = new ImageCapture.Builder()
                        .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
                        .build();

                CameraSelector cameraSelector = CameraSelector.DEFAULT_FRONT_CAMERA;

                cameraProvider.unbindAll();
                cameraProvider.bindToLifecycle(lifecycleOwner, cameraSelector, preview, imageCapture);

            } catch (ExecutionException | InterruptedException e) {
                Log.e(TAG, "Error starting camera", e);
            }
        }, ContextCompat.getMainExecutor(context));
    }

    public void takePictureWithSelector(LifecycleOwner lifecycleOwner, androidx.camera.view.PreviewView previewView, int cameraSelector, OnImageCapturedListener customListener) {
        ListenableFuture<ProcessCameraProvider> cameraProviderFuture = ProcessCameraProvider.getInstance(context);

        cameraProviderFuture.addListener(() -> {
            try {
                ProcessCameraProvider cameraProvider = cameraProviderFuture.get();

                Preview preview = new Preview.Builder().build();
                preview.setSurfaceProvider(previewView.getSurfaceProvider());

                imageCapture = new ImageCapture.Builder()
                        .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
                        .build();

                CameraSelector selector = new CameraSelector.Builder().requireLensFacing(cameraSelector).build();

                cameraProvider.unbindAll();
                cameraProvider.bindToLifecycle(lifecycleOwner, selector, preview, imageCapture);

                takePicture(customListener);
            } catch (ExecutionException | InterruptedException e) {
                Log.e(TAG, "Error starting camera", e);
                customListener.onImageCaptureError("Camera error: " + e.getMessage());
            }
        }, ContextCompat.getMainExecutor(context));
    }

    public void takePictureFront(LifecycleOwner lifecycleOwner, androidx.camera.view.PreviewView previewView, OnImageCapturedListener customListener) {
        takePictureWithSelector(lifecycleOwner, previewView, CameraSelector.LENS_FACING_FRONT, customListener);
    }

    public void takePictureRear(LifecycleOwner lifecycleOwner, androidx.camera.view.PreviewView previewView, OnImageCapturedListener customListener) {
        takePictureWithSelector(lifecycleOwner, previewView, CameraSelector.LENS_FACING_BACK, customListener);
    }

    private void takePicture(OnImageCapturedListener customListener) {
        if (imageCapture == null) {
            customListener.onImageCaptureError("Camera not initialized");
            return;
        }

        File photoFile = new File(getOutputDirectory(),
                "IMG_" + new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.getDefault()).format(new Date()) + ".jpg");

        ImageCapture.OutputFileOptions outputOptions = new ImageCapture.OutputFileOptions.Builder(photoFile).build();

        imageCapture.takePicture(outputOptions, ContextCompat.getMainExecutor(context),
                new ImageCapture.OnImageSavedCallback() {
                    @Override
                    public void onImageSaved(ImageCapture.OutputFileResults outputFileResults) {
                        String savedPath = photoFile.getAbsolutePath();
                        Log.d(TAG, "Photo saved: " + savedPath);
                        customListener.onImageCaptured(savedPath);
                    }

                    @Override
                    public void onError(ImageCaptureException exception) {
                        Log.e(TAG, "Photo capture failed: " + exception.getMessage(), exception);
                        customListener.onImageCaptureError(exception.getMessage());
                    }
                });
    }

    private File getOutputDirectory() {
        File mediaDir = context.getExternalMediaDirs()[0];
        if (mediaDir != null && mediaDir.exists()) {
            return mediaDir;
        } else {
            return context.getFilesDir();
        }
    }

    public void shutdown() {
        if (cameraExecutor != null) {
            cameraExecutor.shutdown();
        }
    }

    public static boolean isCameraAvailable(Context context) {
        return context.getPackageManager().hasSystemFeature(android.content.pm.PackageManager.FEATURE_CAMERA_ANY);
    }
} 