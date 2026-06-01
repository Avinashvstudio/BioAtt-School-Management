package com.example.bioatt_attendance.utils;

import android.util.Log;

import java.util.Properties;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import jakarta.mail.Authenticator;
import jakarta.mail.Message;
import jakarta.mail.PasswordAuthentication;
import jakarta.mail.Session;
import jakarta.mail.Transport;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeBodyPart;
import jakarta.mail.internet.MimeMessage;
import jakarta.mail.internet.MimeMultipart;

public class EmailHelper {
    private static final String TAG = "EmailHelper";
    private final ExecutorService emailExecutor = Executors.newSingleThreadExecutor();

    public void sendEmailWithAttachment(
            final String host,
            final String port,
            final String username,
            final String password,
            final String recipient,
            final String subject,
            final String body,
            final String attachmentPath
    ) {
        emailExecutor.execute(() -> {
            try {
                Properties props = new Properties();
                props.put("mail.smtp.host", host);
                props.put("mail.smtp.socketFactory.port", port);
                props.put("mail.smtp.socketFactory.class", "javax.net.ssl.SSLSocketFactory");
                props.put("mail.smtp.auth", "true");
                props.put("mail.smtp.port", port);

                Session session = Session.getInstance(props, new Authenticator() {
                    @Override
                    protected PasswordAuthentication getPasswordAuthentication() {
                        return new PasswordAuthentication(username, password);
                    }
                });

                MimeMessage mimeMessage = new MimeMessage(session);
                mimeMessage.setFrom(new InternetAddress(username));
                mimeMessage.addRecipient(Message.RecipientType.TO, new InternetAddress(recipient));
                mimeMessage.setSubject(subject);

                MimeMultipart multipart = new MimeMultipart();

                // Body part
                MimeBodyPart textBodyPart = new MimeBodyPart();
                textBodyPart.setText(body);
                multipart.addBodyPart(textBodyPart);

                // Attachment part
                if (attachmentPath != null && !attachmentPath.isEmpty()) {
                    MimeBodyPart attachmentBodyPart = new MimeBodyPart();
                    attachmentBodyPart.attachFile(attachmentPath);
                    multipart.addBodyPart(attachmentBodyPart);
                }

                mimeMessage.setContent(multipart);

                Transport.send(mimeMessage);
                Log.d(TAG, "Email sent successfully to " + recipient);

            } catch (Exception e) {
                Log.e(TAG, "Error sending email", e);
            }
        });
    }
} 