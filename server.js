// server.js
const express = require('express');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 5500;

app.use(express.json({ limit: '50mb' }));
app.use(express.static(__dirname));

// Log all requests 
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// -------------------- Google Drive Config --------------------
const CLIENT_ID = '522107671979-8s0g7ne8u1tgvaidn7pf6df04el4ig21.apps.googleusercontent.com';
const CLIENT_SECRET = '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';
const REDIRECT_URI = 'https://developers.google.com/oauthplayground';
const REFRESH_TOKEN = '1//04b_AzpgbUekMCgYIARAAGAQSNwF-L9Ir-Z-Qg9EJITV6--jGjZ1djmUkZs7c22Gq93RpPEQrBZKoZ2K_79UVCZAVb_WPbOMAj40';

// -------------------- OAuth2 Setup --------------------
let drive = null;
try {
    const oauth2Client = new google.auth.OAuth2(
        CLIENT_ID,
        CLIENT_SECRET,
        REDIRECT_URI
    );

    oauth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });

    drive = google.drive({
        version: 'v3',
        auth: oauth2Client
    });

    console.log('Google Drive configured successfully');
} catch (error) {
    console.error('Google Drive config error:', error.message);
}

// -------------------- Helper Functions --------------------
function dataURLToBuffer(dataURL) {
    const matches = dataURL.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
        throw new Error('Invalid data URL');
    }
    return Buffer.from(matches[2], 'base64');
}

async function uploadToGoogleDrive(videoBuffer, fileName) {
    if (!drive) {
        return { success: false, message: 'Drive not configured' };
    }

    try {
        // Create temp file
        const tempFilePath = path.join(__dirname, 'temp_' + fileName);
        fs.writeFileSync(tempFilePath, videoBuffer);

        console.log('Uploading to Google Drive...');

        // Upload file
        const response = await drive.files.create({
            requestBody: {
                name: fileName,
                mimeType: 'video/webm'
            },
            media: {
                body: fs.createReadStream(tempFilePath)
            },
            fields: 'id, name, webViewLink'
        });

        // Make file public
        try {
            await drive.permissions.create({
                fileId: response.data.id,
                requestBody: {
                    role: 'reader',
                    type: 'anyone'
                }
            });
        } catch (permError) {
            console.log('Permission error:', permError.message);
        }

        // Clean up temp file
        fs.unlinkSync(tempFilePath);

        console.log('Uploaded to Drive. ID:', response.data.id);

        return {
            success: true,
            id: response.data.id,
            name: response.data.name,
            webViewLink: response.data.webViewLink
        };

    } catch (error) {
        console.error('Drive upload error:', error.message);
        return {
            success: false,
            message: error.message
        };
    }
}

// -------------------- Routes --------------------

// Simple test route
app.get('/test', (req, res) => {
    console.log('✓ Test route hit');
    res.json({ 
        success: true, 
        message: 'Server is working!',
        time: new Date().toISOString()
    });
});

// Status route
app.get('/status', (req, res) => {
    console.log('✓ Status route hit');
    res.json({ 
        success: true,
        status: 'Server running',
        drive: drive ? 'configured' : 'not configured',
        port: PORT
    });
});

// Upload route
app.post('/upload-to-drive', async (req, res) => {
    console.log('\n===== UPLOAD REQUEST RECEIVED =====');
    
    try {
        const { video, fileName } = req.body;
        
        // Validation
        if (!video) {
            console.log('No video data');
            return res.status(400).json({ 
                success: false, 
                error: 'No video data' 
            });
        }

        console.log('Video data received, length:', Math.round(video.length / 1024), 'KB');
        
        // Convert to buffer
        const videoBuffer = dataURLToBuffer(video);
        const videoName = fileName || `webcam_${Date.now()}.webm`;
        
        console.log('Buffer created, size:', Math.round(videoBuffer.length / 1024), 'KB');
        
        // Upload to Drive
        const result = await uploadToGoogleDrive(videoBuffer, videoName);
        
        // ALWAYS send JSON response
        if (result.success) {
            console.log('Sending success response');
            res.json({
                success: true,
                message: 'Video uploaded to Google Drive',
                driveLink: result.webViewLink,
                fileId: result.id
            });
        } else {
            console.log('Sending failure response');
            res.json({
                success: false,
                error: result.message || 'Upload failed'
            });
        }

    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Serve HTML
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

// Start server
const server = app.listen(PORT, () => {
    console.log('\n' + '='.repeat(50));
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Test route: http://localhost:${PORT}/test`);
    console.log(`Status route: http://localhost:${PORT}/status`);
    console.log('='.repeat(50) + '\n');
});

server.on('error', (err) => {
    console.error('Server error:', err);
});