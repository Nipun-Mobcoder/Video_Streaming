import express, { Request } from 'express';
import cors from 'cors';
import multer from 'multer';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { exec } from 'child_process';
import { getPresignedUrl, putPresignedUrl, s3, uploadHLSS3, uploadToS3 } from './utils/s3.js';
import connectDB from './config/db.js';
import User from './models/User.js';
import jwt from "jsonwebtoken";
import { authenticateToken } from './utils/configToken.js';
import Video from './models/Video.js';
import client from './config/client.js';
import getVideoFrame from './utils/getVideoFrame.js';
import getVideoDuration from './utils/getVideoDuration.js';

const app = express();
dotenv.config();

app.use(
    cors({
        origin: [process.env.CLIENT_URL ?? '', process.env.CLIENT_URL_2 ?? ''],
        credentials: true
    })
)

const storage = multer.diskStorage({
    destination: function(req, file, cb){
      cb(null, "./uploads")
    },
    filename: function(req, file, cb){
      cb(null, file.fieldname + "-" + uuidv4() + path.extname(file.originalname))
    }
  })
  
const upload = multer({storage});

interface AuthenticatedRequest extends Request {
    user?: { email: string; id: string; userName: string };
}

app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*") 
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept"
    );
    next()
  })

app.use(express.json());
app.use(express.urlencoded({extended: true}))
app.use("/uploads", express.static("uploads"))

if(!process.env.JWT_Secret) { 
    throw new Error("JWT secret is absent.")
}

app.get("/", (req, res) => {
    res.send("Hello World");
})

app.post("/upload", authenticateToken, upload.single('file'), async (req: AuthenticatedRequest, res) => {
    try {
        if (!req.file) {
            res.status(400).json({ message: "No file uploaded" });
        }
        const lessonId = uuidv4()
        const videoPath = req.file?.path
        const outputPath = `./uploads/courses/${lessonId}`
        const hlsPath = `${outputPath}/index.m3u8`
        console.log("hlsPath", hlsPath)
    
        if (!fs.existsSync(outputPath)) {
            fs.mkdirSync(outputPath, {recursive: true})
        }
    
        const ffmpegCommand = `ffmpeg -i ${videoPath} -codec:v libx264 -codec:a aac -hls_time 10 -hls_playlist_type vod -hls_segment_filename "${outputPath}/segment%03d.ts" -start_number 0 ${hlsPath}`;
    
        exec(ffmpegCommand, async (error, stdout, stderr) => {
            if (error) {
               console.log(`exec error: ${error}`)
            }
            console.log(`stdout: ${stdout}`)
            console.log(`stderr: ${stderr}`)
            const videoUrl = `http://localhost:5000/uploads/courses/${lessonId}/index.m3u8`;

            const userData = req.user as { email: string; id: string; userName: string };

            const {id} = userData;
            const user = User.find({ id });
            if(!user) res.status(401).json({ message: "User was not found." });

            await Video.create({ userId:id, vidURL: videoUrl, title: req.file?.filename });
    
            res.json({
                message: "Video converted to HLS format",
                videoUrl,
                lessonId
            })
        })
    } catch (e) {
        console.log(e);
        res.status(400).json(e)
    }
})

app.post("/upload-s3", authenticateToken, upload.single('file'), async (req: AuthenticatedRequest, res) => {
    try {
        if(!req.file) 
            res.status(400).json({ message: "No file uploaded" });
        else {
            const userData = req.user as { email: string; id: string; userName: string };
            const { path, filename, mimetype } = req.file;
            if (!path || !filename || !mimetype)
                res.status(400).json({ message: "Invalid file data" });
            const uploadResult = await uploadToS3(path, filename, mimetype);
         
            const presignedUrl = await getPresignedUrl(uploadResult.Key);
            
            const {id} = userData;
            const user = User.find({ id });
            if(!user) res.status(401).json({ message: "User was not found." });

            await Video.create({ userId:id, vidURL: uploadResult.Location, title: filename });

            res.json({
                message: "Video uploaded successfully.",
                url: presignedUrl
            })
        }
    } catch (error) {
        console.error("Error during file upload:", error);
        res.status(500).json({ message: "Error uploading file" });
    }
})

app.post("/uploadS3", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
        const userData = req.user as { email: string; id: string; userName: string };
        
        const presignedUrl = await putPresignedUrl(req.body.key);
        
        const {id} = userData;
        const user = User.find({ id });
        if(!user) res.status(401).json({ message: "User was not found." });

        res.json({
            message: "Video uploaded successfully.",
            url: presignedUrl
        })
    } catch (error) {
        console.error("Error during file upload:", error);
        res.status(500).json({ message: "Error uploading file" });
    }
})

app.get("/uploadSuccess", authenticateToken, async (req: AuthenticatedRequest, res)=> {
    try {
        const userData = req.user as { email: string; id: string; userName: string };
        const vidURL = `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${req.query.key}`;
        const {id} = userData;
        const user = User.find({ id });
        if(!user) res.status(401).json({ message: "User was not found." });
        await Video.create({ userId:id, vidURL, title: req.query.key });
        const presignedUrl = await getPresignedUrl(req.query.key as string);
        res.json({
            message: "Video uploaded successfully.",
            url: presignedUrl
         })
    } catch (e: any) {
        console.log(e);
        res.status(500).json({ message: e?.message ?? "Looks like something went wrong." })
    }
})

app.post('/uploadhlsS3', authenticateToken, async (req: AuthenticatedRequest, res): Promise<void> => {
    try {
        const { presignedUrl, fileName } = req.body;
        if (!presignedUrl || !fileName) {
            res.status(400).json({ message: "Presigned URL or file name not provided" });
            return;
        }
    
        const channelName = 'video-stream';
        let segmentCount = 0;
        let uploadedCount = 0;

        const email = req.user?.email;

        const lessonId = uuidv4();
        const outputPath = `/tmp/${lessonId}`;
        const hlsPath = `${outputPath}/index.m3u8`;
        console.log("hlsPath", hlsPath);
        
        if (!fs.existsSync(outputPath)) {
            fs.mkdirSync(outputPath, { recursive: true });
        }
    
        const ffmpegCommand = `ffmpeg -i "${presignedUrl}" -codec:v libx264 -codec:a aac -hls_time 10 -hls_playlist_type vod -hls_segment_filename "${outputPath}/segment%03d.ts" -start_number 0 ${hlsPath}`;
        
        exec(ffmpegCommand, async (error, stdout, stderr) => {
            if (error) {
                console.log(`exec error: ${error}`);
                await fs.promises.rm(outputPath, { recursive: true, force: true });
                await client.publish(channelName, JSON.stringify({ status: "error", message: "Error processing video" }));
                res.status(500).json({ message: "Error processing video" });
                return;
            }
            
            console.log(`stdout: ${stdout}`);
            console.log(`stderr: ${stderr}`);
            
            try {
                const files = fs.readdirSync(outputPath);
                const uploadPromises = files.map(async file => {
                    if (file.endsWith('.ts') || file.endsWith('.m3u8')) {
                        segmentCount++;
                        await client.publish(channelName, JSON.stringify({ status: "progress-creating-segments", segmentsCreated: segmentCount }));
                    }
                    const filePath = path.join(outputPath, file);
                    const mimetype = file.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/MP2T';
                    const result = await uploadHLSS3(filePath, file, mimetype, lessonId);
                    uploadedCount++;
                    await client.publish(channelName, JSON.stringify({ status: "progress-uploading-segments-on-S3", segmentsUploaded: uploadedCount }));
                    return result;
                });
                const uploadedFiles = await Promise.all(uploadPromises);

                const videoUrl = uploadedFiles.find(url => url.Location.endsWith('index.m3u8'))?.Location;

                if (!videoUrl) {
                    await fs.promises.rm(outputPath, { recursive: true, force: true });
                    await client.publish(channelName, JSON.stringify({ status: "error", message: "HLS index file not found after upload" }));
                    res.status(500).json({ message: "HLS index file not found after upload" });
                    return;
                }

                const userData = req.user as { email: string; id: string; userName: string };
                const { email, id } = userData;

                const user = await User.findOne({ email });
                if (!user) {
                    await fs.promises.rm(outputPath, { recursive: true, force: true });
                    res.status(401).json({ message: "User was not found." });
                    return;
                }
                
                await Video.create({ userId: id, vidURL: videoUrl, title: fileName });

                await fs.promises.rm(outputPath, { recursive: true, force: true });

                await client.publish(channelName, JSON.stringify({
                        status: "complete",
                        message: "Upload complete",
                        videoUrl,
                    }));
                
                res.json({
                    message: "Video converted to HLS format and uploaded to S3",
                    videoUrl,
                    lessonId
                });
            } catch (uploadError) {
                console.error(uploadError);
                await client.publish(channelName, JSON.stringify({ status: "error", message: "Error uploading HLS files to S3" }));
                await fs.promises.rm(outputPath, { recursive: true, force: true });
                res.status(500).json({ message: "Error uploading HLS files to S3" });
            }
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ e });
    }
});

app.post("/register", async (req, res) => {
    try {
        const { userName, password, email } = req.body;
        if( !userName || !password || !email )
            res.status(500).json({
                message: "Invalid Credentials"
            })
        await User.create({
                userName,
                password,
                email
            })
        res.json({userName, password, email});
    } catch (e) {
        console.log(e);
        res.status(400).json({ message: "Looks like something went wrong." });
    }
})

app.post("/login", async (req, res) => {
    const jwtSecret = process.env.JWT_Secret as string;
    try {
        const { password, email } = req.body;
        const userDoc = await User.findOne({ email });
        if (userDoc && password === userDoc.password) {
            const token = jwt.sign({ email: userDoc.email, id: userDoc._id, userName: userDoc.userName }, jwtSecret);
            res.json({token, name: userDoc.userName, email: userDoc.email, id: userDoc._id.toString()});
        } else {
            res.status(501).json({ message: "Invalid Credentials" });
        }
    } catch (e: any) {
        console.log(e);
        res.status(400).json({ message: e?.message ?? "Looks like something went wrong." });
    }
})

app.post("/startMultipart", async (req, res) => {
    try {
        const { fileName, contentType } = req.body;
        const params = {
            Bucket: process.env.S3_BUCKET_NAME ?? '',
            Key: fileName,
            ContentDisposition: contentType === "VIDEO" ? "inline" : "attachment",
            ContentType: contentType === "VIDEO" ? "video/mp4" : "application/octet-stream",
          };
    
        const multipart = await s3.createMultipartUpload(params).promise();
        res.json({ uploadId: multipart.UploadId });
    } catch(e) {
        res.status(500).json(e);
    }
});

app.post("/generateMultipart", async (req, res) => {
    try {
        const {fileName, uploadId, partNumbers} = req.body;
        const totalParts = Array.from({ length: partNumbers }, (_, i) => i + 1);
  
        const presignedUrls = await Promise.all(
          totalParts.map(async (partNumber) => {
            const params = {
              Bucket: process.env.S3_BUCKET_NAME,
              Key: fileName,
              PartNumber: partNumber,
              UploadId: uploadId,
              Expires: 60 * 60
            };
  
            return s3.getSignedUrl("uploadPart", params);
          })
        );
  
        res.json({presignedUrls});
      } catch (e) {
        console.log(e);
        res.status(500).json(e);
      }
})

app.post("/completeMultipart",authenticateToken,  async (req: AuthenticatedRequest, res) => {
      const {fileName, uploadId, parts} = req.body;

      const params = {
        Bucket: process.env.S3_BUCKET_NAME ?? "",
        Key: fileName,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: parts.map((part: { etag: string; }, index: number) => ({
            ETag: part.etag,
            PartNumber: index + 1,
          })),
        },
      };

      try {
        const data = await s3.completeMultipartUpload(params).promise();
        const fileUrl = data.Location;
        const presignedUrl = await getPresignedUrl(fileUrl??'');

        res.json({ message: "Message sent successfully", presignedUrl });
      } catch (e) {
        console.log(e);
        res.status(500).json(e);
      }
})

app.post('/uploadfileS3', authenticateToken, async (req: AuthenticatedRequest, res): Promise<void> => {
    try {
        const { presignedUrl, fileName } = req.body;
        if (!presignedUrl || !fileName) {
            res.status(400).json({ message: "Presigned URL or file name not provided" });
            return;
        }
    
        const channelName = 'video-stream';
        let segmentCount = 0;
        let uploadedCount = 0;
        let segmentsCreated = 0;

        const lessonId = uuidv4();
        const outputPath = `/tmp/${lessonId}`;
        const hlsPath = `${outputPath}/index.m3u8`;
        console.log("hlsPath", hlsPath);
        
        if (!fs.existsSync(outputPath)) {
            fs.mkdirSync(outputPath, { recursive: true });
        }

        const frameNumber = await getVideoFrame(presignedUrl as string);
        const totalFrames = Math.ceil((frameNumber as number)/10);

        const duration = await getVideoDuration(presignedUrl as string);
        const totalDuration = Math.ceil((duration as number)/10)
    
        const ffmpegCommand = `ffmpeg -i "${presignedUrl}" -codec:v libx264 -codec:a aac -hls_time 10 -hls_playlist_type vod -hls_segment_filename "${outputPath}/segment%03d.ts" -start_number 0 -progress pipe:1 ${hlsPath}`;

        const ffmpegProcess = exec(ffmpegCommand);

        ffmpegProcess.stdout?.on('data', async (data) => {
            const output = data.toString();

            if (output.includes('frame=')) {
                segmentCount++;
                segmentsCreated = Math.floor(parseInt(output.split('frame=')[1].trim()) / 10);
    
                const progress = Math.floor((segmentsCreated / totalFrames) * 100);
                
                await client.publish(channelName, JSON.stringify({
                    status: "progress-segment-create",
                    message: `Segment ${segmentCount} created`,
                    segmentsCreated: segmentsCreated,
                    loading: progress,
                    totalFrames
                }));
            }
        });

        ffmpegProcess.stderr?.on('data', (data) => {
            console.error(`FFmpeg stderr: ${data}`);
        });

        ffmpegProcess.on('close', async (code) => {
            if (code !== 0) {
                console.error(`FFmpeg exited with code ${code}`);
                await client.publish(channelName, JSON.stringify({
                    status: "error",
                    message: "Error processing video",
                }));
                await fs.promises.rm(outputPath, { recursive: true, force: true });
                res.status(500).json({ message: "Error processing video" });
                return;
            }

            console.log("FFmpeg processing complete. Uploading segments...");

            try {
                const files = fs.readdirSync(outputPath);

                const uploadPromises = files.map(async (file) => {
                    if (file.endsWith('.ts') || file.endsWith('.m3u8')) {
                        const filePath = path.join(outputPath, file);
                        const mimetype = file.endsWith('.m3u8')
                            ? 'application/vnd.apple.mpegurl'
                            : 'video/MP2T';
                        const result = await uploadHLSS3(filePath, file, mimetype, lessonId);

                        uploadedCount++;
                        const progress = Math.floor((uploadedCount / totalDuration) * 100);

                        await client.publish(channelName, JSON.stringify({
                            status: "progress-segment-upload-on-s3",
                            message: `Segment ${uploadedCount} uploaded`,
                            segmentsUploaded: uploadedCount,
                            progress,
                            totalDuration
                        }));

                        return result;
                    }
                });

                const uploadedFiles = await Promise.all(uploadPromises);

                const videoUrl = uploadedFiles.find((url) =>
                    url?.Location.endsWith('index.m3u8')
                )?.Location;

                if (!videoUrl) {
                    await fs.promises.rm(outputPath, { recursive: true, force: true });
                    await client.publish(channelName, JSON.stringify({
                        status: "error",
                        message: "HLS index file not found after upload",
                    }));
                    res.status(500).json({ message: "HLS index file not found after upload" });
                    return;
                }

                const userData = req.user as { email: string; id: string; userName: string };
                const { email, id } = userData;

                const user = await User.findOne({ email });
                if (!user) {
                    await fs.promises.rm(outputPath, { recursive: true, force: true });
                    res.status(401).json({ message: "User was not found." });
                    return;
                }

                await Video.create({ userId: id, vidURL: videoUrl, title: fileName });

                await fs.promises.rm(outputPath, { recursive: true, force: true });

                await client.publish(channelName, JSON.stringify({
                    status: "complete",
                    message: "Upload complete",
                    videoUrl
                }));

                res.json({
                    message: "Video converted to HLS format and uploaded to S3",
                    videoUrl,
                    lessonId
                });
            } catch (uploadError) {
                console.error(uploadError);
                await client.publish(channelName, JSON.stringify({ status: "error", message: "Error uploading HLS files to S3" }));
                await fs.promises.rm(outputPath, { recursive: true, force: true });
                res.status(500).json({ message: "Error uploading HLS files to S3" });
            }
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ e });
    }
});

app.post('/uploadCourse', authenticateToken, upload.single('file'), async (req: AuthenticatedRequest, res): Promise<void> => {
    try {
        if (!req.file) {
            res.status(400).json({ message: "No file uploaded" });
        }
        const lessonId = uuidv4();
        const videoPath = req.file?.path;
        const outputPath = `./uploads/courses/${lessonId}`;
        const hlsPath = `${outputPath}/index.m3u8`;
        console.log("hlsPath", hlsPath);

        const fileName = req.file?.filename;

        const channelName = 'video-stream';
        let segmentCount = 0;
        let segmentsCreated = 0;
    
        if (!fs.existsSync(outputPath)) {
            fs.mkdirSync(outputPath, {recursive: true});
        }

        const duration = await getVideoFrame(req.file?.path as string)
        const timeDuration = Math.ceil((duration as number)/10);
    
        const ffmpegCommand = `ffmpeg -i "${videoPath}" -codec:v libx264 -codec:a aac -hls_time 10 -hls_playlist_type vod -hls_segment_filename "${outputPath}/segment%03d.ts" -start_number 0 -progress pipe:1 ${hlsPath}`;

        const ffmpegProcess = exec(ffmpegCommand);

        ffmpegProcess.stdout?.on('data', async (data) => {
            const output = data.toString();

            if (output.includes('frame=')) {
                segmentCount++;
                segmentsCreated = Math.floor(parseInt(output.split('frame=')[1].trim()) / 10);
    
                const progress = Math.floor((segmentsCreated / timeDuration) * 100);
                
                await client.publish(channelName, JSON.stringify({
                    status: "progress-segment-create",
                    message: `Segment ${segmentCount} created`,
                    segmentsCreated: segmentsCreated,
                    loading: progress,
                    timeDuration
                }));
            }
        });

        ffmpegProcess.stderr?.on('data', (data) => {
            console.error(`FFmpeg stderr: ${data}`);
        });

        ffmpegProcess.on('close', async (code) => {
            if (code !== 0) {
                console.error(`FFmpeg exited with code ${code}`);
                await client.publish(channelName, JSON.stringify({
                    status: "error",
                    message: "Error processing video",
                }));
                res.status(500).json({ message: "Error processing video" });
                return;
            }

            console.log("FFmpeg processing complete. Uploading segments...");

            try {
                const videoUrl = `http://localhost:8000/uploads/courses/${lessonId}/index.m3u8`;

                const userData = req.user as { email: string; id: string; userName: string };
                const { email, id } = userData;

                const user = await User.findOne({ email });
                if (!user) {
                    res.status(401).json({ message: "User was not found." });
                    return;
                }

                await Video.create({ userId: id, vidURL: videoUrl, title: fileName });

                await client.publish(channelName, JSON.stringify({
                    status: "complete",
                    message: "Upload complete",
                    videoUrl,
                    loading: 100
                }));

                res.json({
                    message: "Video converted to HLS format and uploaded to S3",
                    videoUrl,
                    lessonId
                });
            } catch (uploadError) {
                console.error(uploadError);
                await client.publish(channelName, JSON.stringify({ status: "error", message: "Error uploading HLS files to S3" }));
                res.status(500).json({ message: "Error uploading HLS files to S3" });
            }
        });
    } catch (e) {
        console.log(e);
        res.status(400).json(e)
    }
});

connectDB();
app.listen(8000, () => {
    console.log("App is listening on http://localhost:8000");
})