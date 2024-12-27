import express from 'express';
import cors from 'cors';
import multer from 'multer';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs, { ReadStream } from 'fs';
import { exec } from 'child_process';
import { getPresignedUrl, uploadToS3 } from './utils/s3.js';

const app = express();
dotenv.config();

app.use(
    cors({
        origin: process.env.CLIENT_URL,
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
  
const upload = multer({storage})

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

app.get("/", (req, res) => {
    res.send("Hello World");
})

app.post("/upload", upload.single('file'), (req, res) => {
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
    
        exec(ffmpegCommand, (error, stdout, stderr) => {
            if (error) {
               console.log(`exec error: ${error}`)
            }
            console.log(`stdout: ${stdout}`)
            console.log(`stderr: ${stderr}`)
            const videoUrl = `http://localhost:5000/uploads/courses/${lessonId}/index.m3u8`;
    
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

app.post("/upload-s3", upload.single('file'), async (req, res) => {
    try {
        if(!req.file) 
            res.status(400).json({ message: "No file uploaded" });
        else {
            const { path, filename, mimetype } = req.file;
            if (!path || !filename || !mimetype)
                res.status(400).json({ message: "Invalid file data" });
            const uploadResult = await uploadToS3(path, filename, mimetype);
         
            const presignedUrl = await getPresignedUrl(uploadResult.Key);
        
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

app.listen(5000, () => {
    console.log("App is listening on http://localhost:5000");
})