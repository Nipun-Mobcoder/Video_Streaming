# Video Upload, Processing, and HLS Conversion API

### Process Flow
1. Validate the incoming request.
2. Generate a unique `lessonId` to store HLS segments temporarily.
3. Use `FFmpeg` to process the video and create HLS segments:
   - Set segment duration to 10 seconds.
   - Generate `.ts` files (video segments) and an `index.m3u8` playlist file.
4. Publish progress updates to a Redis channel (`video-stream`):
   - Frames processed.
   - Segments created.
   - Segments uploaded to S3.
5. Upload all HLS files to S3.
6. Store video metadata in MongoDB:
   - `userId`, `vidURL`, and `title`.
7. Clean up temporary files.
8. Return the URL of the uploaded HLS file to the client.

## Implementation Details

### Key Functionalities

#### 1. **FFmpeg Command**:
The FFmpeg command processes the video and converts it into HLS format:
```bash
ffmpeg -i "<videoPath>" -codec:v libx264 -codec:a aac -hls_time 10 -hls_playlist_type vod -hls_segment_filename "<outputPath>/segment%03d.ts" -start_number 0 -progress pipe:1 <hlsPath>
```
- `-hls_time 10`: Sets each segment's duration to 10 seconds.
- `-progress pipe:1`: Outputs progress to the standard output for real-time monitoring.

#### 2. **Redis for Progress Updates**:
Progress updates are published to the Redis `video-stream` channel:
- **Frame processing progress**.
- **Segments created**.
- **Segments uploaded to S3**.

#### 3. **S3 Upload**:
Uploads the `.ts` and `.m3u8` files to S3 using the `uploadHLSS3` helper function. Each file is uploaded with the correct MIME type.

#### 4. **MongoDB Video Metadata**:
The video metadata, including the uploaded HLS playlist URL and the user ID, is stored in a MongoDB collection.

#### 5. **Web Socket**:
The progress is sent to another service (microservice) through redis which sends it to the frontend using websockets.

### Error Handling
- If any step fails (e.g., FFmpeg processing, file upload, or database operations), the server cleans up temporary files and publishes an error message to the Redis channel.

### Temporary File Management
- Temporary files are stored in `/tmp/<lessonId>` during processing.
- Files are deleted after successful upload or on error.
